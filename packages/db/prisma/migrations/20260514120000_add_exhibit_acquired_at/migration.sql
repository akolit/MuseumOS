-- Acquisition date — separate from created_at (system-level timestamp).
-- Nullable so the bulk-imported rows can stay NULL; new rows are populated
-- by the API at creation time.

ALTER TABLE "exhibits" ADD COLUMN "acquired_at" TIMESTAMP(3);
