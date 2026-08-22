import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// Wikidata is free, keyless, and CC0. We route calls through the API (rather
// than the browser) so we can set a descriptive User-Agent — which Wikimedia
// requires — and cache aggressively, since entities rarely change.
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
// Wikimedia's policy asks for a contact URL or address in the User-Agent so
// they can reach an operator about problem traffic. Set WIKIDATA_CONTACT to
// your own site or email; the fallback identifies the software only.
const CONTACT = process.env.WIKIDATA_CONTACT?.trim();
const USER_AGENT = CONTACT
  ? `MuseumOS/1.0 (${CONTACT}; museum inventory) enrichment`
  : 'MuseumOS/1.0 (https://github.com/museumos/museumos; museum inventory) enrichment';
const ENTITY_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export interface WikidataCandidate {
  id: string; // Q-number
  label: string;
  description: string | null;
}

export interface WikidataFact {
  key: string; // normalized key the frontend maps to a form field
  label: string; // human-readable label for the fact
  value: string; // display + apply value
}

export interface WikidataEntity {
  qid: string;
  url: string; // wikidata.org page
  label: { en: string | null; el: string | null };
  description: { en: string | null; el: string | null };
  wikipedia: { en: string | null; el: string | null };
  image: string | null; // Wikimedia Commons URL
  facts: WikidataFact[];
}

// Properties we extract, in display order. `kind` drives how the raw claim
// value is read; `key` is the normalized name the frontend maps per category.
const PROPERTY_MAP: Array<{
  pid: string;
  key: string;
  label: string;
  kind: 'entity' | 'year' | 'quantity';
}> = [
  { pid: 'P176', key: 'manufacturer', label: 'Manufacturer', kind: 'entity' },
  { pid: 'P495', key: 'country', label: 'Country of origin', kind: 'entity' },
  { pid: 'P17', key: 'country', label: 'Country', kind: 'entity' },
  { pid: 'P571', key: 'year', label: 'Year (introduced)', kind: 'year' },
  { pid: 'P577', key: 'year', label: 'Year (published)', kind: 'year' },
  { pid: 'P178', key: 'developer', label: 'Developer', kind: 'entity' },
  { pid: 'P287', key: 'designer', label: 'Designed by', kind: 'entity' },
  { pid: 'P144', key: 'basedOn', label: 'Based on', kind: 'entity' },
  { pid: 'P306', key: 'operatingSystem', label: 'Operating system', kind: 'entity' },
  { pid: 'P880', key: 'cpu', label: 'CPU', kind: 'entity' },
  { pid: 'P2149', key: 'clockSpeed', label: 'Clock speed', kind: 'quantity' },
];

interface CachedEntity {
  data: WikidataEntity;
  expiresAt: number;
}

@Injectable()
export class WikidataService {
  private readonly logger = new Logger(WikidataService.name);
  private readonly entityCache = new Map<string, CachedEntity>();

  private async fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.error(`Wikidata request failed: ${res.status} ${txt.slice(0, 200)}`);
      throw new ServiceUnavailableException(`Wikidata request failed (${res.status}).`);
    }
    return res.json();
  }

  // Free-text search constrained, when given, to entities of a certain type so
  // "Spectrum" the computer isn't confused with unrelated entities. `type` is a
  // human hint appended to the query — wbsearchentities has no type filter, so
  // we keep it lightweight and let the curator pick the right match.
  async search(q: string, limit = 7): Promise<WikidataCandidate[]> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: q,
      language: 'en',
      uselang: 'en',
      format: 'json',
      limit: String(Math.min(Math.max(limit, 1), 20)),
      origin: '*',
    });
    const data = (await this.fetchJson(`${WIKIDATA_API}?${params.toString()}`)) as {
      search?: Array<{ id: string; label?: string; description?: string }>;
    };
    return (data.search ?? []).map((s) => ({
      id: s.id,
      label: s.label ?? s.id,
      description: s.description ?? null,
    }));
  }

  async enrich(qid: string): Promise<WikidataEntity> {
    const cached = this.entityCache.get(qid);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: qid,
      props: 'labels|descriptions|claims|sitelinks',
      languages: 'en|el',
      sitefilter: 'enwiki|elwiki',
      format: 'json',
      origin: '*',
    });
    const data = (await this.fetchJson(`${WIKIDATA_API}?${params.toString()}`)) as {
      entities?: Record<string, RawEntity>;
    };
    const entity = data.entities?.[qid];
    if (!entity) throw new ServiceUnavailableException(`Wikidata entity ${qid} not found.`);

    const result = await this.normalize(qid, entity);
    this.entityCache.set(qid, { data: result, expiresAt: Date.now() + ENTITY_TTL_MS });
    return result;
  }

  private async normalize(qid: string, entity: RawEntity): Promise<WikidataEntity> {
    const claims = entity.claims ?? {};

    // First pass: collect every referenced entity-id (and quantity unit) so we
    // can resolve all their labels in a single batched call.
    const refIds = new Set<string>();
    for (const { pid, kind } of PROPERTY_MAP) {
      for (const snak of claims[pid] ?? []) {
        const dv = snak.mainsnak?.datavalue;
        if (!dv) continue;
        if (kind === 'entity' && dv.type === 'wikibase-entityid') {
          const id = (dv.value as { id?: string }).id;
          if (id) refIds.add(id);
        } else if (kind === 'quantity' && dv.type === 'quantity') {
          const unit = (dv.value as { unit?: string }).unit;
          const unitQid = unit?.match(/Q\d+$/)?.[0];
          if (unitQid) refIds.add(unitQid);
        }
      }
    }
    const labels = await this.resolveLabels([...refIds]);

    // Second pass: build the normalized fact list. Only the first occurrence of
    // each key wins (e.g. introduced-year beats published-year).
    const facts: WikidataFact[] = [];
    const seenKeys = new Set<string>();
    for (const { pid, key, label, kind } of PROPERTY_MAP) {
      if (seenKeys.has(key)) continue;
      const snaks = claims[pid] ?? [];
      const values: string[] = [];
      for (const snak of snaks) {
        const dv = snak.mainsnak?.datavalue;
        if (!dv) continue;
        const v = this.readValue(dv, kind, labels);
        if (v) values.push(v);
      }
      if (values.length === 0) continue;
      // Cap multi-valued fields (e.g. many second-source manufacturers).
      facts.push({ key, label, value: values.slice(0, 4).join(', ') });
      seenKeys.add(key);
    }

    return {
      qid,
      url: `https://www.wikidata.org/wiki/${qid}`,
      label: {
        en: entity.labels?.en?.value ?? null,
        el: entity.labels?.el?.value ?? null,
      },
      description: {
        en: entity.descriptions?.en?.value ?? null,
        el: entity.descriptions?.el?.value ?? null,
      },
      wikipedia: {
        en: entity.sitelinks?.enwiki
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title.replace(/ /g, '_'))}`
          : null,
        el: entity.sitelinks?.elwiki
          ? `https://el.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.elwiki.title.replace(/ /g, '_'))}`
          : null,
      },
      image: this.imageUrl(claims),
    facts,
    };
  }

  private readValue(
    dv: RawDataValue,
    kind: 'entity' | 'year' | 'quantity',
    labels: Map<string, string>,
  ): string | null {
    if (kind === 'entity' && dv.type === 'wikibase-entityid') {
      const id = (dv.value as { id?: string }).id;
      return id ? labels.get(id) ?? id : null;
    }
    if (kind === 'year' && dv.type === 'time') {
      const time = (dv.value as { time?: string }).time ?? '';
      const m = time.match(/^[+-](\d{4})/);
      return m ? m[1] : null;
    }
    if (kind === 'quantity' && dv.type === 'quantity') {
      const value = dv.value as { amount?: string; unit?: string };
      const amount = (value.amount ?? '').replace(/^\+/, '');
      if (!amount) return null;
      const unitQid = value.unit?.match(/Q\d+$/)?.[0];
      const unit = unitQid ? labels.get(unitQid) ?? '' : '';
      return unit ? `${amount} ${unit}` : amount;
    }
    return null;
  }

  // P18 (image) is a Commons filename; build the canonical Special:FilePath URL.
  private imageUrl(claims: Record<string, RawSnak[]>): string | null {
    const snak = (claims['P18'] ?? [])[0];
    const file = snak?.mainsnak?.datavalue?.value;
    if (typeof file !== 'string' || !file) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`;
  }

  private async resolveLabels(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    // wbgetentities accepts up to 50 ids per call.
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels',
        languages: 'en|el',
        format: 'json',
        origin: '*',
      });
      const data = (await this.fetchJson(`${WIKIDATA_API}?${params.toString()}`)) as {
        entities?: Record<string, RawEntity>;
      };
      for (const [id, ent] of Object.entries(data.entities ?? {})) {
        const label = ent.labels?.en?.value ?? ent.labels?.el?.value;
        if (label) out.set(id, label);
      }
    }
    return out;
  }

  // All computer *models* manufactured by any of the given company QIDs, via
  // SPARQL. We match on the "computer model" / "computer model series" classes
  // (Q55990535 / Q60484681) rather than "computer" (Q68): the famous machines
  // are instances of the former, and Q68 both misses them and floods us with
  // mainframes/supercomputers. Powers the timeline catalog ingest.
  async fetchModelsByManufacturer(
    qids: string[],
  ): Promise<Array<{ qid: string; name: string; year: number | null; imageUrl: string | null }>> {
    const clean = qids.filter((q) => /^Q\d+$/.test(q));
    if (clean.length === 0) return [];
    const values = clean.map((q) => `wd:${q}`).join(' ');
    const sparql = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?year ?image WHERE {
      VALUES ?mfr { ${values} }
      VALUES ?cls { wd:Q55990535 wd:Q60484681 }
      ?item wdt:P176 ?mfr .
      ?item wdt:P31/wdt:P279* ?cls .
      OPTIONAL { ?item wdt:P571 ?inc. }
      OPTIONAL { ?item wdt:P577 ?pub. }
      OPTIONAL { ?item wdt:P580 ?start. }
      OPTIONAL { ?item wdt:P5204 ?comm. }
      BIND(YEAR(COALESCE(?inc, ?pub, ?start, ?comm)) AS ?year)
      OPTIONAL { ?item wdt:P18 ?image. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY ?year`;

    const res = await fetch(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.error(`Wikidata SPARQL failed: ${res.status} ${txt.slice(0, 200)}`);
      throw new ServiceUnavailableException(`Wikidata SPARQL failed (${res.status}).`);
    }
    const data = (await res.json()) as {
      results?: { bindings?: Array<Record<string, { value: string }>> };
    };

    const out = new Map<string, { qid: string; name: string; year: number | null; imageUrl: string | null }>();
    for (const b of data.results?.bindings ?? []) {
      const qid = b.item?.value.split('/').pop() ?? '';
      const name = b.itemLabel?.value ?? '';
      // Skip entities with no English label (SPARQL returns the QID as label).
      if (!qid || !name || /^Q\d+$/.test(name)) continue;
      if (out.has(qid)) continue;
      let yearNum = b.year?.value ? parseInt(b.year.value, 10) : NaN;
      // Many computer models carry no structured date property — the release
      // year only appears in the English description (e.g. "1984 home
      // computer"). Fall back to the first 4-digit year found there.
      if (Number.isNaN(yearNum)) {
        const m = b.itemDescription?.value?.match(/\b(19\d{2}|20\d{2})\b/);
        if (m) yearNum = parseInt(m[1], 10);
      }
      const rawImg = b.image?.value ?? null;
      out.set(qid, {
        qid,
        name,
        year: Number.isNaN(yearNum) ? null : yearNum,
        imageUrl: rawImg ? `${rawImg}${rawImg.includes('?') ? '&' : '?'}width=400` : null,
      });
    }
    return [...out.values()];
  }
}

// --- Loosely-typed shapes for the Wikidata JSON we read. The payload is deeply
// dynamic, so these capture only the fields we touch. ---
interface RawEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, RawSnak[]>;
  sitelinks?: Record<string, { title: string }>;
}
interface RawSnak {
  mainsnak?: { datavalue?: RawDataValue };
}
interface RawDataValue {
  type: string;
  value: unknown;
}
