ALTER TABLE "timeline_models"
  ADD COLUMN "source_key" TEXT,
  ADD COLUMN "type" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "attributes" JSONB;

CREATE UNIQUE INDEX "timeline_models_company_id_source_key_key" ON "timeline_models"("company_id", "source_key");
