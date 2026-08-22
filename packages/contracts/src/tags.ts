import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
});

export type Tag = z.infer<typeof tagSchema>;
