import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import { thumbUrl } from '../exhibits/thumbnails';
import { WikidataService } from '../integrations/wikidata';

export interface OwnedExhibit {
  id: string;
  displayId: string;
  exhibitName: string;
  score: number;
  thumbnailUrl: string | null;
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(WikidataService) private readonly wikidata: WikidataService,
  ) {}

  // Full timeline payload: companies (ordered) → their models, each flagged
  // with whether we own a matching exhibit (fuzzy, brand-agnostic name match
  // against the Computers category) and the linked exhibits.
  async listTimeline(includeHidden: boolean) {
    const companies = await this.db.timelineCompany.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        models: {
          where: includeHidden ? {} : { hidden: false },
          orderBy: [{ year: 'asc' }, { name: 'asc' }],
        },
      },
    });

    const ownership = await this.computeOwnership(
      companies.flatMap((c) => c.models.map((m) => ({ id: m.id, name: m.name, companyName: c.name }))),
    );

    return {
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        wikidataQids: c.wikidataQids,
        displayOrder: c.displayOrder,
        models: c.models.map((m) => {
          const exhibits = ownership.get(m.id) ?? [];
          return {
            id: m.id,
            name: m.name,
            year: m.year,
            // Prefer a curated/Wikidata image; otherwise fall back to the photo
            // of the best-matched exhibit we own (Layer A photo population).
            imageUrl: m.imageUrl ?? exhibits[0]?.thumbnailUrl ?? null,
            // The stored image (null when the display image is an owned-photo
            // fallback) — the curator editor binds to this, not the resolved one.
            imageUrlRaw: m.imageUrl,
            type: m.type,
            country: m.country,
            description: m.description,
            wikidataQid: m.wikidataQid,
            source: m.source,
            hidden: m.hidden,
            owned: exhibits.length > 0,
            exhibits,
          };
        }),
      })),
    };
  }

  // Fuzzy ownership: match each model to Computers exhibits that are *the same
  // model*. We strip the company/brand word from both names (it's the same on
  // every model in a lane, so it only inflates scores) and use symmetric
  // pg_trgm similarity — this distinguishes "Amiga 500" (real duplicate units)
  // from siblings like "CPC 472" vs "CPC 6128", which an asymmetric/contains
  // match wrongly treats as owned. One set-based query over all models.
  private async computeOwnership(
    models: Array<{ id: string; name: string; companyName: string }>,
  ): Promise<Map<string, OwnedExhibit[]>> {
    const map = new Map<string, OwnedExhibit[]>();
    if (models.length === 0) return map;

    const values = Prisma.join(
      models.map((m) => Prisma.sql`(${m.id}::uuid, ${m.name}::text, ${m.companyName}::text)`),
    );
    const rows = await this.db.$queryRaw<
      Array<{
        model_id: string; exhibit_id: string; display_id: string; exhibit_name: string;
        score: number; storage_key: string | null; revision: number | null;
      }>
    >(Prisma.sql`
      WITH wanted(model_id, model_name, company_name) AS (VALUES ${values})
      SELECT b.model_id, e.id AS exhibit_id, e.display_id, e.exhibit_name, b.score,
             img.storage_key, img.revision
      FROM exhibits e
      JOIN categories c ON c.id = e.category_id AND c.code = 'computers'
      CROSS JOIN LATERAL (
        SELECT w.model_id,
               GREATEST(
                 -- brand-stripped trigram similarity (tolerant of word order)
                 similarity(
                   btrim(replace(unaccent(lower(w.model_name)), unaccent(lower(w.company_name)), '')),
                   btrim(replace(unaccent(lower(e.exhibit_name)), unaccent(lower(w.company_name)), ''))
                 ),
                 -- compact similarity: drop all non-alphanumerics so spacing/
                 -- punctuation variants align ("PC1512DD" = "PC1512 DD"). Safe —
                 -- only raises the score for genuinely same model numbers.
                 similarity(
                   regexp_replace(replace(unaccent(lower(w.model_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g'),
                   regexp_replace(replace(unaccent(lower(e.exhibit_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g')
                 ),
                 -- prefix match: the (compact, brand-stripped) model name is a
                 -- prefix of the exhibit's, so a unit named with extra tokens
                 -- ("Atmos 48K", "Macintosh SE FDHD M5011") still links. Require
                 -- >=4 chars to avoid spurious short hits; longer prefix wins.
                 CASE
                   WHEN length(regexp_replace(replace(unaccent(lower(w.model_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g')) >= 4
                    AND regexp_replace(replace(unaccent(lower(e.exhibit_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g')
                        LIKE regexp_replace(replace(unaccent(lower(w.model_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g') || '%'
                   THEN 0.9 + length(regexp_replace(replace(unaccent(lower(w.model_name)), unaccent(lower(w.company_name)), ''), '[^a-z0-9]', '', 'g')) / 1000.0
                   ELSE 0
                 END
               ) AS score
        FROM wanted w
        ORDER BY score DESC
        LIMIT 1
      ) b
      LEFT JOIN LATERAL (
        SELECT i.storage_key, i.revision
        FROM exhibit_images i
        WHERE i.exhibit_id = e.id
        ORDER BY i.is_primary DESC, i.position ASC
        LIMIT 1
      ) img ON TRUE
      WHERE e.deleted_at IS NULL AND b.score >= 0.62
    `);

    for (const r of rows) {
      const arr = map.get(r.model_id) ?? [];
      arr.push({
        id: r.exhibit_id,
        displayId: r.display_id,
        exhibitName: r.exhibit_name,
        score: Math.round(Number(r.score) * 100),
        thumbnailUrl: r.storage_key ? thumbUrl(r.storage_key, 320, Number(r.revision ?? 0)) : null,
      });
      map.set(r.model_id, arr);
    }
    // Best match first, so callers can use exhibits[0] as the representative.
    for (const arr of map.values()) arr.sort((a, b) => b.score - a.score);
    return map;
  }

  // --- Curator: companies ---
  async createCompany(input: { name: string; wikidataQids: string[]; displayOrder?: number }) {
    return this.db.timelineCompany.create({
      data: {
        name: input.name,
        wikidataQids: input.wikidataQids,
        displayOrder: input.displayOrder ?? 0,
      },
    });
  }

  async updateCompany(
    id: string,
    input: { name?: string; wikidataQids?: string[]; displayOrder?: number },
  ) {
    await this.assertCompany(id);
    return this.db.timelineCompany.update({ where: { id }, data: input });
  }

  async deleteCompany(id: string) {
    await this.assertCompany(id);
    await this.db.timelineCompany.delete({ where: { id } });
    return { deleted: true };
  }

  // Re-ingest a company's catalog from Wikidata. Preserves curator state:
  // manual rows are never touched, and `hidden` flags survive (we only refresh
  // name/year/image on existing wikidata rows).
  async refreshCompany(id: string) {
    const company = await this.assertCompany(id);
    const fetched = await this.wikidata.fetchModelsByManufacturer(company.wikidataQids);

    const existing = await this.db.timelineModel.findMany({
      where: { companyId: id, wikidataQid: { not: null } },
      select: { wikidataQid: true },
    });
    const existingQids = new Set(existing.map((e) => e.wikidataQid));

    for (const f of fetched) {
      await this.db.timelineModel.upsert({
        where: { companyId_wikidataQid: { companyId: id, wikidataQid: f.qid } },
        update: { name: f.name, year: f.year, imageUrl: f.imageUrl },
        create: {
          companyId: id,
          wikidataQid: f.qid,
          name: f.name,
          year: f.year,
          imageUrl: f.imageUrl,
          source: 'wikidata',
        },
      });
    }

    const created = fetched.filter((f) => !existingQids.has(f.qid)).length;
    return { fetched: fetched.length, created, updated: fetched.length - created };
  }

  // --- Curator: models ---
  async createModel(input: {
    companyId: string;
    name: string;
    year?: number | null;
    imageUrl?: string | null;
    type?: string | null;
    country?: string | null;
    description?: string | null;
    wikidataQid?: string | null;
  }) {
    await this.assertCompany(input.companyId);
    return this.db.timelineModel.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        year: input.year ?? null,
        imageUrl: input.imageUrl ?? null,
        type: input.type ?? null,
        country: input.country ?? null,
        description: input.description ?? null,
        wikidataQid: input.wikidataQid ?? null,
        source: 'manual',
      },
    });
  }

  async updateModel(
    id: string,
    input: {
      hidden?: boolean;
      name?: string;
      year?: number | null;
      imageUrl?: string | null;
      type?: string | null;
      country?: string | null;
      description?: string | null;
      wikidataQid?: string | null;
    },
  ) {
    const model = await this.db.timelineModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');
    return this.db.timelineModel.update({ where: { id }, data: input });
  }

  async deleteModel(id: string) {
    const model = await this.db.timelineModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');
    await this.db.timelineModel.delete({ where: { id } });
    return { deleted: true };
  }

  // --- Layer B: bulk Wikidata enrichment sweep -----------------------------
  // Scans a batch of the company's not-yet-linked models (no QID), searches
  // Wikidata by "<company> <model>", and returns a best-match proposal per
  // model for the curator to review. Stateless: applying a proposal sets the
  // model's QID, so it drops out of the next scan. Bounded batch + concurrency
  // keeps a single call within request timeout and polite to Wikidata.
  async enrichScan(companyId: string, limit = 12) {
    const company = await this.assertCompany(companyId);
    const models = await this.db.timelineModel.findMany({
      where: { companyId, hidden: false, wikidataQid: null },
      orderBy: [{ year: 'asc' }, { name: 'asc' }],
      take: limit,
    });
    const totalPending = await this.db.timelineModel.count({
      where: { companyId, hidden: false, wikidataQid: null },
    });

    // Search with a clean brand token: drop anything after "/" or "," and any
    // parenthetical, so display names like "Tandy / RadioShack" search as "Tandy".
    const brand = company.name.split(/[/,(]/)[0]!.trim();
    const proposals = await this.mapWithConcurrency(models, 4, async (m) => {
      try {
        const candidates = await this.wikidata.search(`${brand} ${m.name}`, 1);
        const cand = candidates[0];
        if (!cand) return { modelId: m.id, modelName: m.name, year: m.year, candidate: null, score: 0, proposed: null };
        const e = await this.wikidata.enrich(cand.id);
        const country = e.facts.find((f) => f.key === 'country')?.value ?? null;
        const yr = e.facts.find((f) => f.key === 'year')?.value ?? null;
        return {
          modelId: m.id,
          modelName: m.name,
          year: m.year,
          score: this.nameScore(`${company.name} ${m.name}`, cand.label),
          candidate: { qid: cand.id, label: cand.label, description: cand.description },
          proposed: {
            wikidataQid: cand.id,
            imageUrl: e.image,
            description: e.description.en ?? e.description.el ?? null,
            country,
            year: yr ? parseInt(yr, 10) : null,
          },
        };
      } catch {
        return { modelId: m.id, modelName: m.name, year: m.year, candidate: null, score: 0, proposed: null };
      }
    });

    return { proposals, scanned: models.length, remaining: Math.max(0, totalPending - models.length) };
  }

  // Rough name-match confidence (0..1): Dice coefficient over letter bigrams of
  // the normalized strings. Lets the UI pre-check confident matches.
  private nameScore(a: string, b: string): number {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const bigrams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
    const x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const bx = bigrams(x), by = bigrams(y);
    let inter = 0; let total = 0;
    for (const v of bx.values()) total += v;
    for (const [g, v] of by) { total += v; const c = bx.get(g); if (c) inter += Math.min(c, v); }
    return total ? Math.round((2 * inter / total) * 100) / 100 : 0;
  }

  private async mapWithConcurrency<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); }
    });
    await Promise.all(workers);
    return out;
  }

  private async assertCompany(id: string) {
    const company = await this.db.timelineCompany.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
