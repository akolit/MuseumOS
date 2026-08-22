import { z } from 'zod';

export const createFloorPlanSchema = z.object({
  name: z.string().min(1).max(200),
});

export type CreateFloorPlanInput = z.infer<typeof createFloorPlanSchema>;

export const updateFloorPlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  calibrationJson: z.record(z.unknown()).nullable().optional(),
});

export type UpdateFloorPlanInput = z.infer<typeof updateFloorPlanSchema>;

export const upsertPlacementSchema = z.object({
  exhibitId: z.string().uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  rotation: z.number().min(0).max(360).default(0),
  scale: z.number().min(0.3).max(3).default(1),
});

export type UpsertPlacementInput = z.infer<typeof upsertPlacementSchema>;

export const bulkUpsertPlacementsSchema = z.object({
  placements: z.array(upsertPlacementSchema).min(1).max(500),
});

export type BulkUpsertPlacementsInput = z.infer<typeof bulkUpsertPlacementsSchema>;
