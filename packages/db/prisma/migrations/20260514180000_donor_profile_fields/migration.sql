-- Donor profile fields imported from the legacy registry. All optional —
-- existing rows stay NULL where the Excel didn't have a value.
-- See packages/db/prisma/schema.prisma for the rationale.

ALTER TABLE "donors"
    ADD COLUMN "father_name"        TEXT,
    ADD COLUMN "address"            TEXT,
    ADD COLUMN "city"               TEXT,
    ADD COLUMN "phone"              TEXT,
    ADD COLUMN "email"              TEXT,
    ADD COLUMN "tax_id"             TEXT,
    ADD COLUMN "comment"            TEXT,
    ADD COLUMN "first_donation_at"  TIMESTAMP(3),
    ADD COLUMN "legacy_id"          TEXT,
    ADD COLUMN "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "donors_legacy_id_key" ON "donors" ("legacy_id");
