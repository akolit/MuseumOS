import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import type { SearchQuery, GlobalSearchInput } from '@museumos/contracts';
import { thumbUrl } from './thumbnails';
import {
  resolveAttrSpecs,
  attrSpecsToSql,
  attrFilteredIds,
  type AttrSpec,
} from './attribute-filter';

@Injectable()
export class ExhibitsSearchService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  /**
   * Like `search()` but returns ALL matching rows for export, without pagination.
   * Hard cap at 50_000 to avoid runaway memory if a user has no filters.
   */
  async exportRows(query: SearchQuery) {
    const where: Prisma.ExhibitWhereInput = { deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.donorId) where.donorId = query.donorId;
    if (query.validated !== undefined) where.validated = query.validated;
    if (query.functional !== undefined) where.functional = query.functional;
    if (query.published !== undefined) where.published = query.published;
    if (query.yearFrom !== undefined || query.yearTo !== undefined) {
      where.year = {};
      if (query.yearFrom !== undefined) where.year.gte = query.yearFrom;
      if (query.yearTo !== undefined) where.year.lte = query.yearTo;
    }
    if (query.hasImages !== undefined) {
      where.images = query.hasImages ? { some: {} } : { none: {} };
    }
    if (query.tagIds && query.tagIds.length > 0) {
      where.tags = { some: { tagId: { in: query.tagIds } } };
    }
    if (query.type) {
      where.attributes = { path: ['type'], equals: query.type };
    }

    const attrSpecs = await resolveAttrSpecs(this.db, query);

    // For text search we use the same FTS path then re-fetch full rows.
    if (query.q) {
      const ftsResult = await this.fullTextSearch(
        { ...query, page: 1, limit: 50_000 },
        where,
        attrSpecs,
      );
      const ids = ftsResult.items.map((it: any) => it.id);
      if (ids.length === 0) return [];
      where.id = { in: ids };
    } else if (attrSpecs.length > 0) {
      where.id = { in: await attrFilteredIds(this.db, query.categoryId!, attrSpecs) };
    }

    const rows = await this.db.exhibit.findMany({
      where,
      take: 50_000,
      orderBy: { displayId: 'asc' },
      select: {
        id: true,
        displayId: true,
        legacyId: true,
        exhibitName: true,
        manufacturer: true,
        year: true,
        locSite: true,
        functional: true,
        validated: true,
        published: true,
        collectiblePrice: true,
        comment: true,
        functionalComment: true,
        attributes: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { code: true, nameEn: true, nameEl: true } },
        donor: { select: { name: true } },
        location: { select: { code: true, nameEn: true, nameEl: true } },
        tags: { select: { tag: { select: { name: true } } } },
        _count: { select: { images: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      displayId: r.displayId,
      legacyId: r.legacyId,
      categoryCode: r.category.code,
      categoryNameEn: r.category.nameEn,
      categoryNameEl: r.category.nameEl,
      exhibitName: r.exhibitName,
      manufacturer: r.manufacturer,
      year: r.year,
      donor: r.donor?.name ?? null,
      locationCode: r.location?.code ?? null,
      locationNameEn: r.location?.nameEn ?? null,
      locSite: r.locSite,
      functional: r.functional,
      validated: r.validated,
      published: r.published,
      collectiblePrice: r.collectiblePrice ? Number(r.collectiblePrice) : null,
      comment: r.comment,
      functionalComment: r.functionalComment,
      tags: r.tags.map((t) => t.tag.name),
      imageCount: r._count.images,
      attributes: r.attributes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async search(query: SearchQuery) {
    const where: Prisma.ExhibitWhereInput = { deletedAt: null };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.donorId) where.donorId = query.donorId;
    if (query.validated !== undefined) where.validated = query.validated;
    if (query.functional !== undefined) where.functional = query.functional;
    if (query.published !== undefined) where.published = query.published;

    if (query.yearFrom !== undefined || query.yearTo !== undefined) {
      where.year = {};
      if (query.yearFrom !== undefined) where.year.gte = query.yearFrom;
      if (query.yearTo !== undefined) where.year.lte = query.yearTo;
    }

    if (query.hasImages !== undefined) {
      where.images = query.hasImages ? { some: {} } : { none: {} };
    }

    if (query.tagIds && query.tagIds.length > 0) {
      where.tags = {
        some: { tagId: { in: query.tagIds } },
      };
    }

    if (query.type) {
      where.attributes = { path: ['type'], equals: query.type };
    }

    // Category-specific attribute filters. The full-text path folds them into
    // its raw SQL; the plain path constrains by the matching id set (Prisma
    // can't express accent-insensitive JSONB matching).
    const attrSpecs = await resolveAttrSpecs(this.db, query);

    if (query.q) {
      return this.fullTextSearch(query, where, attrSpecs);
    }

    if (attrSpecs.length > 0) {
      where.id = { in: await attrFilteredIds(this.db, query.categoryId!, attrSpecs) };
    }

    // Plain fields go directly into orderBy; relation-backed fields need a
    // different shape (joined sort by category.nameEn, location.code, or
    // relation _count). See SORT_RESOLVERS below.
    const sortBy = SORT_RESOLVERS[query.sortBy] ? query.sortBy : 'updatedAt';
    const orderBy = SORT_RESOLVERS[sortBy]!(query.sortOrder) as Prisma.ExhibitOrderByWithRelationInput;

    const [items, total] = await Promise.all([
      this.db.exhibit.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          categoryId: true,
          displayId: true,
          exhibitName: true,
          manufacturer: true,
          year: true,
          validated: true,
          published: true,
          functional: true,
          locationId: true,
          attributes: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { code: true, nameEn: true, nameEl: true } },
          location: { select: { code: true } },
          _count: { select: { images: true } },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          images: {
            select: { storageKey: true, revision: true },
            orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
            take: 1,
          },
        },
      }),
      this.db.exhibit.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        ...e,
        tags: e.tags.map((et) => et.tag),
        imageCount: e._count.images,
        primaryImageUrl: e.images[0]
          ? `/img/${e.images[0].storageKey}${e.images[0].revision > 0 ? `?r=${e.images[0].revision}` : ''}`
          : null,
        primaryThumbnailUrl: e.images[0] ? thumbUrl(e.images[0].storageKey, 320, e.images[0].revision) : null,
        primaryGridUrl: e.images[0] ? thumbUrl(e.images[0].storageKey, 640, e.images[0].revision) : null,
        type: (e.attributes as Record<string, unknown> | null)?.type as string ?? null,
        capacity: (e.attributes as Record<string, unknown> | null)?.capacity as string ?? null,
        images: undefined,
        _count: undefined,
        attributes: undefined,
      })),
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }

  private async fullTextSearch(
    query: SearchQuery,
    where: Prisma.ExhibitWhereInput,
    attrSpecs: AttrSpec[] = [],
  ) {
    const sanitized = query.q.replace(/[^\w\sαάβγδεέζηήθικλμνξοόπρσςτυύφχψωώ-]/gi, '').trim();
    if (!sanitized) {
      return { items: [], total: 0, page: query.page, limit: query.limit, pages: 0 };
    }

    const tsQuery = sanitized.split(/\s+/).map(displayIdAwareToken).join(' & ');
    const offset = (query.page - 1) * query.limit;

    const searchParams: unknown[] = [];
    const searchFilters: string[] = ['e.deleted_at IS NULL'];
    let idx = 1;

    // $1 = tsquery text
    searchParams.push(tsQuery);
    const tsqIdx = idx++;

    if (query.categoryId) {
      searchFilters.push(`e.category_id = $${idx}::uuid`);
      searchParams.push(query.categoryId);
      idx++;
    }
    if (query.locationId) {
      searchFilters.push(`e.location_id = $${idx}::uuid`);
      searchParams.push(query.locationId);
      idx++;
    }
    if (query.donorId) {
      searchFilters.push(`e.donor_id = $${idx}::uuid`);
      searchParams.push(query.donorId);
      idx++;
    }
    if (query.validated !== undefined) {
      searchFilters.push(`e.validated = $${idx}`);
      searchParams.push(query.validated);
      idx++;
    }
    if (query.functional !== undefined) {
      searchFilters.push(`e.functional = $${idx}`);
      searchParams.push(query.functional);
      idx++;
    }
    if (query.published !== undefined) {
      searchFilters.push(`e.published = $${idx}`);
      searchParams.push(query.published);
      idx++;
    }
    if (query.yearFrom !== undefined) {
      searchFilters.push(`e.year >= $${idx}`);
      searchParams.push(query.yearFrom);
      idx++;
    }
    if (query.yearTo !== undefined) {
      searchFilters.push(`e.year <= $${idx}`);
      searchParams.push(query.yearTo);
      idx++;
    }
    if (query.hasImages !== undefined) {
      searchFilters.push(
        query.hasImages
          ? `EXISTS (SELECT 1 FROM exhibit_images ei WHERE ei.exhibit_id = e.id)`
          : `NOT EXISTS (SELECT 1 FROM exhibit_images ei WHERE ei.exhibit_id = e.id)`,
      );
    }
    if (query.type) {
      searchFilters.push(`e.attributes->>'type' = $${idx}`);
      searchParams.push(query.type);
      idx++;
    }
    if (attrSpecs.length > 0) {
      const attr = attrSpecsToSql(attrSpecs, idx, 'e');
      searchFilters.push(...attr.conditions);
      searchParams.push(...attr.params);
      idx += attr.params.length;
    }

    const limitIdx = idx++;
    searchParams.push(query.limit);
    const offsetIdx = idx++;
    searchParams.push(offset);

    const filterSql = searchFilters.join(' AND ');
    const tsvCondition = `e.search_tsv @@ to_tsquery('simple', immutable_unaccent($${tsqIdx}))`;

    const countRows = await this.db.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM exhibits e WHERE ${filterSql} AND ${tsvCondition}`,
      ...searchParams.slice(0, -2), // exclude limit/offset
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await this.db.$queryRawUnsafe<any[]>(
      `SELECT
        e.id,
        e.category_id as "categoryId",
        e.display_id as "displayId",
        e.exhibit_name as "exhibitName",
        e.manufacturer,
        e.year,
        e.validated,
        e.published,
        e.functional,
        e.location_id as "locationId",
        e.created_at as "createdAt",
        e.updated_at as "updatedAt",
        e.attributes->>'type' as "type",
        e.attributes->>'capacity' as "capacity",
        c.code as "categoryCode",
        c.name_en as "categoryNameEn",
        c.name_el as "categoryNameEl",
        l.code as "locationCode",
        ts_rank_cd(e.search_tsv, to_tsquery('simple', immutable_unaccent($${tsqIdx}))) as rank,
        (SELECT ei.storage_key FROM exhibit_images ei
          WHERE ei.exhibit_id = e.id
          ORDER BY ei.is_primary DESC, ei.position ASC
          LIMIT 1) as "primaryStorageKey",
        (SELECT ei.revision FROM exhibit_images ei
          WHERE ei.exhibit_id = e.id
          ORDER BY ei.is_primary DESC, ei.position ASC
          LIMIT 1) as "primaryRevision",
        (SELECT COUNT(*)::int FROM exhibit_images ei WHERE ei.exhibit_id = e.id) as "imageCount"
      FROM exhibits e
      JOIN categories c ON c.id = e.category_id
      LEFT JOIN locations l ON l.id = e.location_id
      WHERE ${filterSql} AND ${tsvCondition}
      ORDER BY rank DESC, e.updated_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...searchParams,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        displayId: r.displayId,
        exhibitName: r.exhibitName,
        manufacturer: r.manufacturer,
        year: r.year,
        validated: r.validated,
        published: r.published,
        functional: r.functional,
        locationId: r.locationId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        type: r.type ?? null,
        capacity: r.capacity ?? null,
        category: { code: r.categoryCode, nameEn: r.categoryNameEn, nameEl: r.categoryNameEl },
        location: r.locationCode ? { code: r.locationCode } : null,
        rank: parseFloat(r.rank),
        tags: [],
        imageCount: r.imageCount ?? 0,
        primaryImageUrl: r.primaryStorageKey
          ? `/img/${r.primaryStorageKey}${r.primaryRevision > 0 ? `?r=${r.primaryRevision}` : ''}`
          : null,
        primaryThumbnailUrl: r.primaryStorageKey ? thumbUrl(r.primaryStorageKey, 320, r.primaryRevision ?? 0) : null,
        primaryGridUrl: r.primaryStorageKey ? thumbUrl(r.primaryStorageKey, 640, r.primaryRevision ?? 0) : null,
      })),
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }

  async globalSearch(input: GlobalSearchInput) {
    const sanitized = input.q.replace(/[^\w\sαάβγδεέζηήθικλμνξοόπρσςτυύφχψωώ-]/gi, '').trim();
    if (!sanitized) return [];

    const tsQuery = sanitized.split(/\s+/).map(displayIdAwareToken).join(' & ');

    const rows = await this.db.$queryRawUnsafe<any[]>(
      `SELECT
        e.id,
        e.display_id as "displayId",
        e.exhibit_name as "exhibitName",
        e.manufacturer,
        c.code as "categoryCode",
        c.name_en as "categoryNameEn",
        c.name_el as "categoryNameEl",
        (SELECT ei.storage_key FROM exhibit_images ei
          WHERE ei.exhibit_id = e.id
          ORDER BY ei.is_primary DESC, ei.position ASC
          LIMIT 1) as "primaryStorageKey",
        (SELECT ei.revision FROM exhibit_images ei
          WHERE ei.exhibit_id = e.id
          ORDER BY ei.is_primary DESC, ei.position ASC
          LIMIT 1) as "primaryRevision",
        ts_rank_cd(e.search_tsv, to_tsquery('simple', immutable_unaccent($1))) as rank
      FROM exhibits e
      JOIN categories c ON c.id = e.category_id
      WHERE e.deleted_at IS NULL
        AND e.search_tsv @@ to_tsquery('simple', immutable_unaccent($1))
      ORDER BY rank DESC
      LIMIT $2`,
      tsQuery,
      input.limit,
    );

    return rows.map((r) => ({
      id: r.id,
      displayId: r.displayId,
      exhibitName: r.exhibitName,
      manufacturer: r.manufacturer,
      categoryCode: r.categoryCode,
      categoryNameEn: r.categoryNameEn,
      categoryNameEl: r.categoryNameEl,
      primaryThumbnailUrl: r.primaryStorageKey
        ? thumbUrl(r.primaryStorageKey, 320, r.primaryRevision ?? 0)
        : null,
      rank: parseFloat(r.rank),
    }));
  }

  // Resolves @-mention tokens (e.g. "BK00009", "bk9") found in a comment to the
  // exhibits they point at, so the UI can render them as links. Each token is
  // normalised to the canonical stored display id (uppercase prefix + digits
  // zero-padded to 5) before lookup. Soft-deleted exhibits are excluded.
  async resolveMentions(tokens: string[]) {
    const canonical = new Set<string>();
    for (const tok of tokens) {
      const norm = canonicalDisplayId(tok);
      if (norm) canonical.add(norm);
    }
    if (canonical.size === 0) return [];

    return this.db.exhibit.findMany({
      where: { displayId: { in: [...canonical] }, deletedAt: null },
      select: { id: true, displayId: true, exhibitName: true },
    });
  }
}

// Turns a mention token into the canonical display id stored in the DB:
// "bk9" / "BK9" / "BK00009" → "BK00009". Returns null for non-display-id tokens.
export function canonicalDisplayId(token: string): string | null {
  const m = token.match(/^([A-Za-z]{2})(\d+)$/);
  if (!m) return null;
  return `${m[1]!.toUpperCase()}${m[2]!.padStart(5, '0')}`;
}

// Maps each allowed sort field to a function that builds the Prisma orderBy
// shape. Plain columns go in directly; relation-backed columns (`category`,
// `location`) sort by a joined field; count-based fields (`imageCount`,
// `tagCount`) use the `_count` aggregation.
type SortDir = 'asc' | 'desc';
type OrderBuilder = (dir: SortDir) => Prisma.ExhibitOrderByWithRelationInput;
const SORT_RESOLVERS: Record<string, OrderBuilder> = {
  displayId:    (d) => ({ displayId: d }),
  exhibitName:  (d) => ({ exhibitName: d }),
  manufacturer: (d) => ({ manufacturer: d }),
  year:         (d) => ({ year: d }),
  validated:    (d) => ({ validated: d }),
  published:    (d) => ({ published: d }),
  createdAt:    (d) => ({ createdAt: d }),
  updatedAt:    (d) => ({ updatedAt: d }),
  // Relation-backed:
  category:     (d) => ({ category: { nameEn: d } }),
  location:     (d) => ({ location: { code: d } }),
  imageCount:   (d) => ({ images: { _count: d } }),
  tagCount:     (d) => ({ tags: { _count: d } }),
};

// Build a tsquery token for a single search word.
// For display-id-like inputs (two letters + digits, e.g. "BK4" or "pc509"),
// also try the zero-padded canonical form ("bk00004", "pc00509") so users
// don't have to type the leading zeros stored in the DB.
function displayIdAwareToken(word: string): string {
  const m = word.match(/^([A-Za-z]{2})(\d+)$/);
  if (!m) return `${word}:*`;
  const prefix = m[1]!.toLowerCase();
  const digits = m[2]!;
  const padded = `${prefix}${digits.padStart(5, '0')}`;
  if (padded === word.toLowerCase()) return `${word}:*`;
  // OR the two forms so "BK4" matches both an exact prefix and the padded form.
  return `(${word}:* | ${padded}:*)`;
}
