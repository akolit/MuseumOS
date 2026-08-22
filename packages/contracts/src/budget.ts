import { z } from 'zod';

// 'income' = money in (tickets, sponsorships, grants, …)
// 'expense' = money out (rent, salaries, utilities, …)
// String not enum so adding kinds later doesn't require contract bumps.
export const budgetKinds = ['income', 'expense'] as const;
export type BudgetKind = (typeof budgetKinds)[number];

// Confidence helps separate signed-contract income from hopeful pitches.
// Used by the UI to compute "pessimistic / realistic / optimistic" nets.
export const budgetConfidences = ['confirmed', 'likely', 'aspirational'] as const;
export type BudgetConfidence = (typeof budgetConfidences)[number];

// Decimal-as-number is fine for the UI; the DB column is Decimal(12,2).
// Amounts are nullable in the schema, but the contract requires numbers
// (or null to clear) — the form always sends a number for forecast.
const optionalAmount = z.number().min(0).max(9_999_999_999).nullish();

export const createBudgetItemSchema = z.object({
  kind: z.enum(budgetKinds),
  category: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  forecastAmount: z.number().min(0).max(9_999_999_999),
  actualAmount: optionalAmount,
  minAmount: optionalAmount,
  maxAmount: optionalAmount,
  confidence: z.enum(budgetConfidences).nullish(),
  notes: z.string().max(2000).nullish(),
  position: z.number().int().min(0).optional(),
});

export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;

// All fields optional for partial updates — change any subset.
export const updateBudgetItemSchema = createBudgetItemSchema.partial();
export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemSchema>;

export const budgetItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(budgetKinds),
  category: z.string(),
  name: z.string(),
  forecastAmount: z.number(),
  actualAmount: z.number().nullable(),
  minAmount: z.number().nullable(),
  maxAmount: z.number().nullable(),
  confidence: z.enum(budgetConfidences).nullable(),
  notes: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BudgetItem = z.infer<typeof budgetItemSchema>;

// ─── Budget snapshots ────────────────────────────────────────

export const createBudgetSnapshotSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

export type CreateBudgetSnapshotInput = z.infer<typeof createBudgetSnapshotSchema>;

// Metadata only — what /api/budget/snapshots returns. The actual `data`
// blob is fetched separately on restore.
export const budgetSnapshotMetaSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  itemCount: z.number().int(),
  forecastTotal: z.number(),
  actualTotal: z.number().nullable(),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid().nullable(),
  createdByDisplayName: z.string().nullable(),
});

export type BudgetSnapshotMeta = z.infer<typeof budgetSnapshotMetaSchema>;
