import { z } from 'zod';

export const uploadImageSchema = z.object({
  exhibitId: z.string().uuid(),
  caption: z.string().max(500).optional(),
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;

export const reorderImagesSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1),
});

export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;

export const exhibitImageSchema = z.object({
  id: z.string().uuid(),
  exhibitId: z.string().uuid(),
  storageKey: z.string(),
  originalFilename: z.string().nullable(),
  mimeType: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bytes: z.number().nullable(),
  isPrimary: z.boolean(),
  position: z.number(),
  caption: z.string().nullable(),
  uploadedAt: z.string().datetime(),
});

export type ExhibitImage = z.infer<typeof exhibitImageSchema>;
