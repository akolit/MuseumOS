import { z } from 'zod';

// `identifier` is either an email address or a user's displayName. The API
// resolves it to a user via a case-insensitive lookup on both columns.
export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const roles = ['viewer', 'curator', 'senior_curator', 'admin'] as const;
export type Role = (typeof roles)[number];

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(roles),
  themePreference: z.string().nullable(),
  langPreference: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;
