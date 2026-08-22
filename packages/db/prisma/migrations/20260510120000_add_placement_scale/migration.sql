-- CreateTable (was previously created outside migrations)
CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- Add search_tsv column to exhibits
ALTER TABLE "exhibits" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;

-- Add indexes on exhibits for search
CREATE INDEX IF NOT EXISTS "exhibits_attributes_idx" ON "exhibits" USING GIN ("attributes");
CREATE INDEX IF NOT EXISTS "exhibits_manufacturer_idx" ON "exhibits" ("manufacturer");
CREATE INDEX IF NOT EXISTS "exhibits_exhibit_name_idx" ON "exhibits" ("exhibit_name");
CREATE INDEX IF NOT EXISTS "exhibits_search_tsv_idx" ON "exhibits" USING GIN ("search_tsv");

-- AlterTable
ALTER TABLE "exhibit_placements" ADD COLUMN "scale" DOUBLE PRECISION NOT NULL DEFAULT 1;
