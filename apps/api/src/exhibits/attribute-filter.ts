import type { DatabaseService } from '../database';

// Category attribute keys are constrained to this shape by the field manager.
// We interpolate the key directly into raw SQL (JSONB keys can't be bound as
// parameters), so validate every key defensively against injection.
export const ATTR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export interface AttrSpec {
  key: string;
  mode: 'exact' | 'contains';
  value: string;
}

interface AttrQuery {
  categoryId?: string;
  attrs?: Record<string, string>;
}

interface FieldDef {
  type?: string;
  enum?: unknown[];
}

// Resolve the requested attribute filters into specs, deciding the match mode
// from the category schema: enum / boolean / number fields match exactly,
// everything else (free text, suggestions, autocomplete) matches by
// accent-insensitive substring. Returns [] when there is nothing to filter
// (no attrs, no category, or all keys/values blank or malformed).
export async function resolveAttrSpecs(
  db: DatabaseService,
  query: AttrQuery,
): Promise<AttrSpec[]> {
  const { attrs, categoryId } = query;
  if (!attrs || !categoryId) return [];

  const entries = Object.entries(attrs).filter(
    ([k, v]) => ATTR_KEY_RE.test(k) && typeof v === 'string' && v.trim() !== '',
  );
  if (entries.length === 0) return [];

  const cat = await db.category.findUnique({
    where: { id: categoryId },
    select: { schema: true },
  });
  const props =
    (cat?.schema as { properties?: Record<string, FieldDef> } | null)?.properties ?? {};

  return entries.map(([key, value]) => {
    const def = props[key] ?? {};
    const exact = Array.isArray(def.enum) || def.type === 'boolean' || def.type === 'number';
    return { key, mode: exact ? 'exact' : 'contains', value: value.trim() };
  });
}

// Build raw SQL conditions for the given specs, numbering bind params from
// `startIdx`. `alias` is the exhibits-table alias (e.g. 'e').
export function attrSpecsToSql(
  specs: AttrSpec[],
  startIdx: number,
  alias = 'e',
): { conditions: string[]; params: unknown[] } {
  const col = (key: string) => `${alias ? `${alias}.` : ''}attributes->>'${key}'`;
  // Normalise for contains matching: case-fold, strip accents, and fold the
  // Greek final sigma (ς) to a medial sigma (σ) so "κλειδαριθμοσ" matches a
  // stored "Κλειδάριθμος".
  const norm = (expr: string) => `immutable_unaccent(lower(translate(${expr}, 'ς', 'σ')))`;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;
  for (const s of specs) {
    if (s.mode === 'exact') {
      conditions.push(`${col(s.key)} = $${idx}`);
      params.push(s.value);
    } else {
      conditions.push(`${norm(col(s.key))} LIKE ${norm(`$${idx}`)}`);
      params.push(`%${s.value}%`);
    }
    idx++;
  }
  return { conditions, params };
}

// IDs of exhibits in `categoryId` whose attributes satisfy every spec. Used to
// constrain the Prisma query paths, which can't express raw JSONB operators.
export async function attrFilteredIds(
  db: DatabaseService,
  categoryId: string,
  specs: AttrSpec[],
): Promise<string[]> {
  const { conditions, params } = attrSpecsToSql(specs, 2, 'e');
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT e.id FROM exhibits e
     WHERE e.deleted_at IS NULL AND e.category_id = $1::uuid AND ${conditions.join(' AND ')}`,
    categoryId,
    ...params,
  );
  return rows.map((r) => r.id);
}
