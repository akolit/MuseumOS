-- Budget line items for the Financials page. See BudgetItem model in
-- packages/db/prisma/schema.prisma for the rationale on each field.

CREATE TABLE "budget_items" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind"            TEXT NOT NULL,
    "category"        TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "forecast_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "actual_amount"   DECIMAL(12, 2),
    "min_amount"      DECIMAL(12, 2),
    "max_amount"      DECIMAL(12, 2),
    "confidence"      TEXT,
    "notes"           TEXT,
    "position"        INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_items_kind_position_idx"
    ON "budget_items" ("kind", "position");
