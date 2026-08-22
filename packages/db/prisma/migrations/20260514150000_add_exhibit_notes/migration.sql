-- Conservation log: per-exhibit timestamped events. See ExhibitNote model
-- in schema.prisma for the rationale.

CREATE TABLE "exhibit_notes" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "exhibit_id"  UUID         NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "type"        TEXT         NOT NULL,
    "text"        TEXT         NOT NULL,
    "author_id"   UUID,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exhibit_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exhibit_notes_exhibit_id_occurred_at_idx"
    ON "exhibit_notes" ("exhibit_id", "occurred_at" DESC);

ALTER TABLE "exhibit_notes"
    ADD CONSTRAINT "exhibit_notes_exhibit_id_fkey"
    FOREIGN KEY ("exhibit_id") REFERENCES "exhibits" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exhibit_notes"
    ADD CONSTRAINT "exhibit_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
