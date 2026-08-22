import { z } from 'zod';

// `z.coerce.boolean()` uses Boolean(v), which treats the string "false" as truthy.
// This helper interprets URL-style strings: "true"/"1" → true, "false"/"0" → false.
const queryBool = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return v;
}, z.boolean().optional());

export const searchQuerySchema = z.object({
  q: z.string().max(500).default(''),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  donorId: z.string().uuid().optional(),
  validated: queryBool,
  functional: queryBool,
  published: queryBool,
  hasImages: queryBool,
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  type: z.string().max(200).optional(),
  // Category-specific attribute filters, encoded as a JSON object string in the
  // URL (e.g. attrs={"author":"Knuth"}). Keys are attribute names, values are
  // the (string) filter terms. Match mode (exact vs contains) is decided
  // server-side from the category schema.
  attrs: z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'object') return v;
    try {
      const parsed = JSON.parse(String(v));
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, z.record(z.string(), z.string()).optional()),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  sortBy: z.string().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const globalSearchSchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;

export interface SearchResult {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  categoryCode: string;
  categoryNameEn: string;
  categoryNameEl: string;
  rank: number;
}
