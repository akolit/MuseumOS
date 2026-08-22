import { z } from 'zod';

// Shared field-level rules. Used by both create and update schemas.
const profileFields = {
  fatherName: z.string().max(300).nullish(),
  address: z.string().max(500).nullish(),
  city: z.string().max(200).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().max(300).nullish().or(z.literal('')),
  taxId: z.string().max(50).nullish(),
  comment: z.string().max(5000).nullish(),
  firstDonationAt: z.string().datetime().nullish(),
  legacyId: z.string().max(50).nullish(),
  // Whether the donor shows on the public website / public API export.
  isPublic: z.boolean().optional(),
};

export const createDonorSchema = z.object({
  name: z.string().min(1).max(300),
  ...profileFields,
});

export type CreateDonorInput = z.infer<typeof createDonorSchema>;

// All fields optional for partial updates — including name (rename), but the
// API rejects an empty name when set.
export const updateDonorSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  ...profileFields,
});

export type UpdateDonorInput = z.infer<typeof updateDonorSchema>;

export const donorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  fatherName: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  taxId: z.string().nullable(),
  comment: z.string().nullable(),
  firstDonationAt: z.string().datetime().nullable(),
  legacyId: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Donor = z.infer<typeof donorSchema>;

export const mergeDonorsSchema = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1),
});

export type MergeDonorsInput = z.infer<typeof mergeDonorsSchema>;
