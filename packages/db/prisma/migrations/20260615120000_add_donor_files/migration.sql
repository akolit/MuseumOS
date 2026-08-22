-- AlterTable: link a donor to its container in a previous system (for form import)
ALTER TABLE "donors" ADD COLUMN "legacy_container_uuid" TEXT;

-- CreateTable
CREATE TABLE "donor_files" (
    "id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "bytes" BIGINT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "legacy_source" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "donor_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donor_files_donor_id_idx" ON "donor_files"("donor_id");

-- AddForeignKey
ALTER TABLE "donor_files" ADD CONSTRAINT "donor_files_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_files" ADD CONSTRAINT "donor_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
