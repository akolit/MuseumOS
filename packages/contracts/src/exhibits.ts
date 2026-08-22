import { z } from 'zod';

export const createExhibitSchema = z.object({
  categoryId: z.string().uuid(),
  exhibitName: z.string().min(1).max(500),
  manufacturer: z.string().max(300).nullish(),
  year: z.number().int().min(1800).max(2100).nullish(),
  donorId: z.string().uuid().nullish(),
  locationId: z.string().uuid().nullish(),
  locSite: z.string().max(50).nullish(),
  functional: z.boolean().nullish(),
  functionalComment: z.string().max(5000).nullish(),
  collectiblePrice: z.number().nonnegative().nullish(),
  comment: z.string().max(5000).nullish(),
  attributes: z.record(z.unknown()).default({}),
  // ISO date string of when the exhibit was acquired by the museum. The
  // API auto-fills with `now()` on create if omitted. Old (bulk-imported)
  // rows have this as NULL because the real acquisition date is unknown;
  // an operator can backfill via the edit form.
  acquiredAt: z.string().datetime().nullish(),
});

export type CreateExhibitInput = z.infer<typeof createExhibitSchema>;

export const updateExhibitSchema = createExhibitSchema.partial().extend({
  validated: z.boolean().optional(),
  published: z.boolean().optional(),
});

export type UpdateExhibitInput = z.infer<typeof updateExhibitSchema>;

export const exhibitSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  displayId: z.string(),
  legacyId: z.string().nullable(),
  exhibitName: z.string(),
  manufacturer: z.string().nullable(),
  year: z.number().nullable(),
  donorId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable(),
  locSite: z.string().nullable(),
  functional: z.boolean().nullable(),
  functionalComment: z.string().nullable(),
  validated: z.boolean(),
  collectiblePrice: z.number().nullable(),
  comment: z.string().nullable(),
  attributes: z.record(z.unknown()),
  published: z.boolean(),
  acquiredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type Exhibit = z.infer<typeof exhibitSchema>;

export const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  update: z.object({
    // null explicitly clears the location; undefined leaves it alone.
    locationId: z.string().uuid().nullable().optional(),
    locSite: z.string().max(50).optional(),
    functional: z.boolean().optional(),
    validated: z.boolean().optional(),
    published: z.boolean().optional(),
    // Tag operations: replace = full replace; add = ensure present; remove = remove if present.
    tags: z
      .object({
        mode: z.enum(['add', 'remove', 'replace']),
        tagIds: z.array(z.string().uuid()),
      })
      .optional(),
  }),
});

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;
