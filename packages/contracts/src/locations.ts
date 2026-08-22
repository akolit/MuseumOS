import { z } from 'zod';

export const createLocationSchema = z.object({
  code: z.string().min(1).max(50),
  nameEn: z.string().max(200).optional(),
  nameEl: z.string().max(200).optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const locationSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nameEn: z.string().nullable(),
  nameEl: z.string().nullable(),
});

export type Location = z.infer<typeof locationSchema>;
