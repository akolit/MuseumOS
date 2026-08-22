-- Saved budget snapshots — see BudgetSnapshot model in
-- packages/db/prisma/schema.prisma for the rationale.

CREATE TABLE "budget_snapshots" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "data"        JSONB NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"  UUID,
    CONSTRAINT "budget_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_snapshots_created_at_idx"
    ON "budget_snapshots" ("created_at" DESC);

ALTER TABLE "budget_snapshots"
    ADD CONSTRAINT "budget_snapshots_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
