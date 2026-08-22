import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameEn: z.string(),
  nameEl: z.string(),
  idPrefix: z.string(),
  schema: z.record(z.unknown()),
  sortOrder: z.number(),
});

export type Category = z.infer<typeof categorySchema>;

export const updateCategorySchemaInput = z.object({
  nameEn: z.string().min(1).optional(),
  nameEl: z.string().min(1).optional(),
  schema: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchemaInput>;

// Payload for the "rename a value everywhere it appears" flow. Renames
// a value in the enum of a category schema property AND cascades to
// every exhibit whose attributes[key] currently equals `from`.
// `dryRun` returns the counts without touching anything so the UI can
// show "N exhibits will be updated" before the operator confirms.
export const renameAttributeValueInput = z.object({
  attributeKey: z.string().min(1).max(100),
  from: z.string().min(1).max(500),
  to: z.string().min(1).max(500),
  dryRun: z.boolean().optional(),
});

export type RenameAttributeValueInput = z.infer<typeof renameAttributeValueInput>;

export const renameAttributeValueResult = z.object({
  dryRun: z.boolean(),
  exhibitsAffected: z.number().int(),
  enumRenamed: z.boolean(),
});

export type RenameAttributeValueResult = z.infer<typeof renameAttributeValueResult>;
