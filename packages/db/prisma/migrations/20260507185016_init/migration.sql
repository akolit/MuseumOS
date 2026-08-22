-- CreateEnum
CREATE TYPE "Role" AS ENUM ('viewer', 'curator', 'senior_curator', 'admin');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "theme_preference" TEXT,
    "lang_preference" TEXT DEFAULT 'el',
    "totp_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_el" TEXT NOT NULL,
    "id_prefix" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT,
    "name_el" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibits" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "legacy_id" TEXT,
    "exhibit_name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "year" INTEGER,
    "donor_id" UUID,
    "location_id" UUID,
    "loc_site" TEXT,
    "functional" BOOLEAN,
    "functional_comment" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "collectible_price" DECIMAL(10,2),
    "comment" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "exhibits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibit_tags" (
    "exhibit_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "exhibit_tags_pkey" PRIMARY KEY ("exhibit_id","tag_id")
);

-- CreateTable
CREATE TABLE "exhibit_images" (
    "id" UUID NOT NULL,
    "exhibit_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BIGINT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID,

    CONSTRAINT "exhibit_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "diff" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "svg_storage_key" TEXT NOT NULL,
    "calibration_json" JSONB,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibit_placements" (
    "id" UUID NOT NULL,
    "exhibit_id" UUID NOT NULL,
    "floor_plan_id" UUID NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "exhibit_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "donors_name_key" ON "donors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "exhibits_category_id_idx" ON "exhibits"("category_id");

-- CreateIndex
CREATE INDEX "exhibits_display_id_idx" ON "exhibits"("display_id");

-- CreateIndex
CREATE INDEX "exhibits_legacy_id_idx" ON "exhibits"("legacy_id");

-- CreateIndex
CREATE INDEX "exhibits_deleted_at_idx" ON "exhibits"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "exhibit_images_exhibit_id_idx" ON "exhibit_images"("exhibit_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exhibit_placements_exhibit_id_floor_plan_id_key" ON "exhibit_placements"("exhibit_id", "floor_plan_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibits" ADD CONSTRAINT "exhibits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_tags" ADD CONSTRAINT "exhibit_tags_exhibit_id_fkey" FOREIGN KEY ("exhibit_id") REFERENCES "exhibits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_tags" ADD CONSTRAINT "exhibit_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_images" ADD CONSTRAINT "exhibit_images_exhibit_id_fkey" FOREIGN KEY ("exhibit_id") REFERENCES "exhibits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_images" ADD CONSTRAINT "exhibit_images_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibit_placements" ADD CONSTRAINT "exhibit_placements_floor_plan_id_fkey" FOREIGN KEY ("floor_plan_id") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
