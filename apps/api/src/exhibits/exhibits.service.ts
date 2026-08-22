import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import { CategoriesService } from '../categories';
import type { CreateExhibitInput, UpdateExhibitInput } from '@museumos/contracts';
import { thumbUrl, originalUrl } from './thumbnails';
import { resolveAttrSpecs, attrFilteredIds } from './attribute-filter';

const EXHIBIT_SELECT = {
  id: true,
  categoryId: true,
  displayId: true,
  legacyId: true,
  exhibitName: true,
  manufacturer: true,
  year: true,
  donorId: true,
  locationId: true,
  locSite: true,
  functional: true,
  functionalComment: true,
  validated: true,
  collectiblePrice: true,
  comment: true,
  attributes: true,
  published: true,
  acquiredAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdById: true,
  updatedById: true,
  category: { select: { id: true, code: true, nameEn: true, nameEl: true, idPrefix: true } },
  donor: { select: { id: true, name: true } },
  location: { select: { id: true, code: true, nameEn: true, nameEl: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  images: {
    select: {
      id: true,
      storageKey: true,
      originalFilename: true,
      mimeType: true,
      isPrimary: true,
      position: true,
      revision: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
  },
  _count: { select: { images: true } },
} satisfies Prisma.ExhibitSelect;

@Injectable()
export class ExhibitsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CategoriesService) private readonly categoriesService: CategoriesService,
  ) {}

  private formatExhibit(raw: any) {
    const { tags, _count, images, ...rest } = raw;
    return {
      ...rest,
      tags: tags?.map((et: any) => et.tag) ?? [],
      images: (images ?? []).map((img: any) => ({
        id: img.id,
        filename: img.originalFilename ?? img.storageKey,
        mimeType: img.mimeType,
        url: originalUrl(img.storageKey, img.revision),
        thumbnailUrl: thumbUrl(img.storageKey, 320, img.revision),
        mediumUrl: thumbUrl(img.storageKey, 1024, img.revision),
        isPrimary: img.isPrimary,
      })),
      imageCount: _count?.images ?? 0,
    };
  }

  async generateDisplayId(categoryId: string): Promise<string> {
    const category = await this.categoriesService.findById(categoryId);
    const prefix = category.idPrefix;

    // Compute the highest numeric suffix among ALL existing exhibits in this category
    // (including soft-deleted ones, so we never collide on retired IDs).
    // Only rows where the suffix is purely digits are considered — anything else is ignored.
    const start = prefix.length + 1;
    const result = await this.db.$queryRawUnsafe<[{ max_num: number | null }]>(
      `SELECT COALESCE(MAX(SUBSTRING(display_id FROM ${start})::INTEGER), 0) AS max_num
       FROM exhibits
       WHERE category_id = $1::uuid
         AND SUBSTRING(display_id FROM 1 FOR ${prefix.length}) = $2
         AND SUBSTRING(display_id FROM ${start}) ~ '^[0-9]+$'`,
      categoryId,
      prefix,
    );

    const maxNum = Number(result[0]?.max_num ?? 0);
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  async create(input: CreateExhibitInput, actorId: string) {
    const displayId = await this.generateDisplayId(input.categoryId);

    const exhibit = await this.db.exhibit.create({
      data: {
        categoryId: input.categoryId,
        displayId,
        exhibitName: input.exhibitName,
        manufacturer: input.manufacturer ?? null,
        year: input.year ?? null,
        donorId: input.donorId ?? null,
        locationId: input.locationId ?? null,
        locSite: input.locSite ?? null,
        functional: input.functional ?? null,
        functionalComment: input.functionalComment ?? null,
        collectiblePrice: input.collectiblePrice ?? null,
        comment: input.comment ?? null,
        attributes: (input.attributes ?? {}) as Prisma.InputJsonValue,
        // Auto-fill acquisition date with now() if the operator didn't set
        // one. Bulk-imported rows stay NULL.
        acquiredAt: input.acquiredAt ? new Date(input.acquiredAt) : new Date(),
        createdById: actorId,
        updatedById: actorId,
      },
      select: EXHIBIT_SELECT,
    });

    return this.formatExhibit(exhibit);
  }

  async stats() {
    const where = { deletedAt: null };
    const [total, validated, published, withImages] = await Promise.all([
      this.db.exhibit.count({ where }),
      this.db.exhibit.count({ where: { ...where, validated: true } }),
      this.db.exhibit.count({ where: { ...where, published: true } }),
      this.db.exhibit.count({ where: { ...where, images: { some: {} } } }),
    ]);

    // Daily counts for the last 30 days (UTC).
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);

    const rows = await this.db.$queryRawUnsafe<{ d: Date; c: bigint }[]>(
      `SELECT date_trunc('day', created_at)::date AS d, COUNT(*)::bigint AS c
       FROM exhibits
       WHERE deleted_at IS NULL AND created_at >= $1
       GROUP BY 1 ORDER BY 1`,
      since,
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = (r.d instanceof Date ? r.d : new Date(r.d as unknown as string))
        .toISOString().slice(0, 10);
      map.set(key, Number(r.c));
    }
    const timeline: { date: string; count: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      timeline.push({ date: key, count: map.get(key) ?? 0 });
    }

    return {
      total,
      validated,
      notValidated: total - validated,
      published,
      notPublished: total - published,
      withImages,
      withoutImages: total - withImages,
      timeline,
    };
  }

  // Distinct non-null manufacturers across all (non-deleted) exhibits,
  // sorted alphabetically. Used as the list-of-values for the manufacturer
  // input on edit / create forms.
  async listManufacturers(): Promise<string[]> {
    const rows = await this.db.exhibit.findMany({
      where: { deletedAt: null, manufacturer: { not: null } },
      select: { manufacturer: true },
      distinct: ['manufacturer'],
      orderBy: { manufacturer: 'asc' },
    });
    return rows
      .map((r) => r.manufacturer!)
      .filter((m) => m.trim().length > 0);
  }

  // Distinct values for given JSONB attribute keys within one category, most
  // common first — powers the in-form autocomplete dropdowns for high-cardinality
  // fields (e.g. Books author / publishers / language). Free-text stays allowed;
  // this is just suggestions, kept live so new values appear without a redeploy.
  async listAttributeValues(
    categoryId: string,
    keys: string[],
  ): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    for (const key of keys) {
      const rows = await this.db.$queryRaw<Array<{ v: string }>>`
        SELECT attributes->>${key} AS v
        FROM exhibits
        WHERE category_id = ${categoryId}::uuid
          AND deleted_at IS NULL
          AND attributes->>${key} <> ''
        GROUP BY 1
        ORDER BY count(*) DESC, 1 ASC
        LIMIT 1000`;
      result[key] = rows.map((r) => r.v);
    }
    return result;
  }

  // Minimal multi-fetch for the label-printing page.
  async lookupMany(ids: string[]) {
    const rows = await this.db.exhibit.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        displayId: true,
        exhibitName: true,
        manufacturer: true,
        year: true,
      },
    });
    // Preserve the requested order so labels print in the order the user
    // selected them. findMany doesn't guarantee order.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  }

  async findById(id: string) {
    const exhibit = await this.db.exhibit.findFirst({
      where: { id, deletedAt: null },
      select: EXHIBIT_SELECT,
    });
    if (!exhibit) throw new NotFoundException('Exhibit not found');
    return this.formatExhibit(exhibit);
  }

  // Duplicate / related-item detection for one exhibit. Scores every other
  // exhibit 0..1 from a blend of pg_trgm name similarity and metadata matches,
  // then buckets into a human relation tier. Name uses both similarity() (good
  // for "Amiga 500 1" vs "Amiga 500 2") and word_similarity() (good for the
  // source name appearing inside a longer one, e.g. "Amiga 500 Memory Card").
  // The manufacturer word is stripped from both names before comparison so the
  // brand isn't double-counted (once in the name, once in the manufacturer
  // match) — otherwise any two Commodore machines look alike on name alone.
  async findSimilar(id: string, limit = 20) {
    const src = await this.db.exhibit.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, exhibitName: true, manufacturer: true, year: true, categoryId: true },
    });
    if (!src) throw new NotFoundException('Exhibit not found');

    const name = src.exhibitName ?? '';
    const manufacturer = src.manufacturer ?? '';
    const year = src.year ?? null;

    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        display_id: string;
        exhibit_name: string;
        manufacturer: string | null;
        year: number | null;
        category_code: string;
        category_name_en: string;
        category_name_el: string;
        same_category: boolean;
        storage_key: string | null;
        revision: number | null;
        name_score: number;
        score: number;
      }>
    >`
      WITH scored AS (
        SELECT
          e.id, e.display_id, e.exhibit_name, e.manufacturer, e.year,
          c.code AS category_code, c.name_en AS category_name_en, c.name_el AS category_name_el,
          (e.category_id = ${src.categoryId}::uuid) AS same_category,
          img.storage_key, img.revision,
          GREATEST(
            similarity(
              btrim(replace(unaccent(lower(e.exhibit_name)), unaccent(lower(${manufacturer})), '')),
              btrim(replace(unaccent(lower(${name})), unaccent(lower(${manufacturer})), ''))
            ),
            word_similarity(
              btrim(replace(unaccent(lower(${name})), unaccent(lower(${manufacturer})), '')),
              btrim(replace(unaccent(lower(e.exhibit_name)), unaccent(lower(${manufacturer})), ''))
            )
          ) AS name_score,
          (CASE WHEN ${manufacturer} <> '' AND unaccent(lower(coalesce(e.manufacturer,''))) = unaccent(lower(${manufacturer})) THEN 1 ELSE 0 END) AS mfr_match,
          (CASE WHEN ${year}::int IS NOT NULL AND e.year = ${year}::int THEN 1 ELSE 0 END) AS year_match,
          (CASE WHEN e.category_id = ${src.categoryId}::uuid THEN 1 ELSE 0 END) AS cat_match
        FROM exhibits e
        JOIN categories c ON c.id = e.category_id
        LEFT JOIN LATERAL (
          SELECT i.storage_key, i.revision FROM exhibit_images i
          WHERE i.exhibit_id = e.id
          ORDER BY i.is_primary DESC, i.position ASC
          LIMIT 1
        ) img ON true
        WHERE e.deleted_at IS NULL AND e.id <> ${id}::uuid
      )
      SELECT id, display_id, exhibit_name, manufacturer, year,
             category_code, category_name_en, category_name_el, same_category,
             storage_key, revision, name_score,
             (0.6 * name_score + 0.2 * mfr_match + 0.1 * year_match + 0.1 * cat_match) AS score
      FROM scored
      WHERE name_score > 0.2
      ORDER BY score DESC
      LIMIT ${limit}`;

    return rows
      .map((r) => {
        const score = Number(r.score);
        const nameScore = Number(r.name_score);
        // "Duplicate" needs the names to be near-identical (same model), not just
        // a shared brand prefix — otherwise "Amiga 600" looks like an "Amiga 1200"
        // duplicate because manufacturer/year/category all match. Metadata only
        // helps ranking; name near-equality + same category is the real signal.
        const relation =
          r.same_category && nameScore >= 0.82
            ? 'duplicate'
            : score >= 0.5
              ? 'strong'
              : score >= 0.4
                ? 'possible'
                : 'weak';
        return {
          id: r.id,
          displayId: r.display_id,
          exhibitName: r.exhibit_name,
          manufacturer: r.manufacturer,
          year: r.year,
          category: { code: r.category_code, nameEn: r.category_name_en, nameEl: r.category_name_el },
          thumbnailUrl: r.storage_key ? thumbUrl(r.storage_key, 320, r.revision ?? 0) : null,
          score: Math.round(score * 100),
          relation,
        };
      })
      .filter((r) => r.relation !== 'weak');
  }

  async update(id: string, input: UpdateExhibitInput, actorId: string) {
    await this.findById(id);

    const data: Record<string, unknown> = { updatedById: actorId };

    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.exhibitName !== undefined) data.exhibitName = input.exhibitName;
    if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer;
    if (input.year !== undefined) data.year = input.year;
    if (input.donorId !== undefined) data.donorId = input.donorId;
    if (input.locationId !== undefined) data.locationId = input.locationId;
    if (input.locSite !== undefined) data.locSite = input.locSite;
    if (input.functional !== undefined) data.functional = input.functional;
    if (input.functionalComment !== undefined) data.functionalComment = input.functionalComment;
    if (input.collectiblePrice !== undefined) data.collectiblePrice = input.collectiblePrice;
    if (input.comment !== undefined) data.comment = input.comment;
    if (input.attributes !== undefined) data.attributes = input.attributes as Prisma.InputJsonValue;
    if (input.validated !== undefined) data.validated = input.validated;
    if (input.published !== undefined) data.published = input.published;
    // null clears the field; undefined leaves it alone; string sets it.
    if (input.acquiredAt !== undefined) {
      data.acquiredAt = input.acquiredAt === null ? null : new Date(input.acquiredAt);
    }

    const updated = await this.db.exhibit.update({
      where: { id },
      data,
      select: EXHIBIT_SELECT,
    });

    return this.formatExhibit(updated);
  }

  async softDelete(id: string, actorId: string) {
    await this.findById(id);
    await this.db.exhibit.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actorId },
    });
  }

  async restore(id: string, actorId: string) {
    const exhibit = await this.db.exhibit.findUnique({ where: { id } });
    if (!exhibit) throw new NotFoundException('Exhibit not found');
    if (!exhibit.deletedAt) throw new BadRequestException('Exhibit is not deleted');

    const restored = await this.db.exhibit.update({
      where: { id },
      data: { deletedAt: null, updatedById: actorId },
      select: EXHIBIT_SELECT,
    });

    return this.formatExhibit(restored);
  }

  async setTags(exhibitId: string, tagIds: string[]) {
    await this.findById(exhibitId);

    await this.db.$transaction(async (tx) => {
      await tx.exhibitTag.deleteMany({ where: { exhibitId } });
      if (tagIds.length > 0) {
        await tx.exhibitTag.createMany({
          data: tagIds.map((tagId) => ({ exhibitId, tagId })),
        });
      }
    });

    return this.findById(exhibitId);
  }

  async bulkUpdate(
    ids: string[],
    update: {
      locationId?: string | null;
      locSite?: string;
      functional?: boolean;
      validated?: boolean;
      published?: boolean;
      tags?: { mode: 'add' | 'remove' | 'replace'; tagIds: string[] };
    },
    actorId: string,
  ) {
    const { tags, ...rawFields } = update;

    await this.db.$transaction(async (tx) => {
      const data: Record<string, unknown> = { updatedById: actorId };
      // locationId: undefined => leave; null => clear; uuid => set.
      if (rawFields.locationId !== undefined) data.locationId = rawFields.locationId;
      if (rawFields.locSite !== undefined) data.locSite = rawFields.locSite;
      if (rawFields.functional !== undefined) data.functional = rawFields.functional;
      if (rawFields.validated !== undefined) data.validated = rawFields.validated;
      if (rawFields.published !== undefined) data.published = rawFields.published;

      await tx.exhibit.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: data as any,
      });

      if (tags) {
        const { mode, tagIds } = tags;
        if (mode === 'replace') {
          await tx.exhibitTag.deleteMany({ where: { exhibitId: { in: ids } } });
          if (tagIds.length > 0) {
            const records = ids.flatMap((exhibitId) =>
              tagIds.map((tagId) => ({ exhibitId, tagId })),
            );
            await tx.exhibitTag.createMany({ data: records });
          }
        } else if (mode === 'remove' && tagIds.length > 0) {
          await tx.exhibitTag.deleteMany({
            where: { exhibitId: { in: ids }, tagId: { in: tagIds } },
          });
        } else if (mode === 'add' && tagIds.length > 0) {
          const records = ids.flatMap((exhibitId) =>
            tagIds.map((tagId) => ({ exhibitId, tagId })),
          );
          // skipDuplicates so existing pairs don't blow up.
          await tx.exhibitTag.createMany({ data: records, skipDuplicates: true });
        }
      }
    });

    return { updated: ids.length };
  }

  /**
   * Returns up to `cap` exhibit IDs matching the supplied filters.
   * Used by "select all matching" in the bulk action bar.
   */
  async findMatchingIds(
    filters: {
      categoryId?: string;
      locationId?: string;
      donorId?: string;
      validated?: boolean;
      functional?: boolean;
      published?: boolean;
      hasImages?: boolean;
      yearFrom?: number;
      yearTo?: number;
      tagIds?: string[];
      attrs?: Record<string, string>;
    },
    cap = 500,
  ): Promise<string[]> {
    const where: Prisma.ExhibitWhereInput = { deletedAt: null };
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.donorId) where.donorId = filters.donorId;
    if (filters.validated !== undefined) where.validated = filters.validated;
    if (filters.functional !== undefined) where.functional = filters.functional;
    if (filters.published !== undefined) where.published = filters.published;
    if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
      where.year = {};
      if (filters.yearFrom !== undefined) where.year.gte = filters.yearFrom;
      if (filters.yearTo !== undefined) where.year.lte = filters.yearTo;
    }
    if (filters.hasImages !== undefined) {
      where.images = filters.hasImages ? { some: {} } : { none: {} };
    }
    if (filters.tagIds && filters.tagIds.length > 0) {
      where.tags = { some: { tagId: { in: filters.tagIds } } };
    }

    const attrSpecs = await resolveAttrSpecs(this.db, filters);
    if (attrSpecs.length > 0) {
      where.id = { in: await attrFilteredIds(this.db, filters.categoryId!, attrSpecs) };
    }

    const rows = await this.db.exhibit.findMany({
      where,
      take: cap,
      orderBy: { displayId: 'asc' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
