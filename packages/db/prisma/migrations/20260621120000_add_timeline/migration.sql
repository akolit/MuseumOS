-- CreateTable
CREATE TABLE "timeline_companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wikidata_qids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timeline_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_models" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "wikidata_qid" TEXT,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "image_url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'wikidata',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timeline_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timeline_companies_name_key" ON "timeline_companies"("name");

-- CreateIndex
CREATE INDEX "timeline_models_company_id_idx" ON "timeline_models"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_models_company_id_wikidata_qid_key" ON "timeline_models"("company_id", "wikidata_qid");

-- AddForeignKey
ALTER TABLE "timeline_models" ADD CONSTRAINT "timeline_models_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "timeline_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
