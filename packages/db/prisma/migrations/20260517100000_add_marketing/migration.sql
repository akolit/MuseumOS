-- Marketing module — four tables for connected social accounts,
-- post drafts/schedules, per-platform fan-out targets, and a
-- time-series metric store.
--
-- The tokens column on social_accounts is plain text in this revision
-- because OAuth isn't wired up yet. BEFORE PRODUCTION the column must
-- be encrypted (pgcrypto + a per-deployment key from the env, or
-- application-level AES-GCM).

-- ─── social_accounts ────────────────────────────────────────────
CREATE TABLE "social_accounts" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "platform"         TEXT NOT NULL,
    "external_id"      TEXT NOT NULL,
    "handle"           TEXT,
    "display_name"     TEXT,
    "status"           TEXT NOT NULL DEFAULT 'connected',
    "access_token"     TEXT,
    "refresh_token"    TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes"           TEXT,
    "connected_by"     UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "connected_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at"   TIMESTAMP(3),
    "last_error"       TEXT
);
CREATE UNIQUE INDEX "social_accounts_platform_external_id_key" ON "social_accounts" ("platform", "external_id");
CREATE INDEX "social_accounts_platform_idx" ON "social_accounts" ("platform");

-- ─── marketing_posts ────────────────────────────────────────────
CREATE TABLE "marketing_posts" (
    "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "status"            TEXT NOT NULL DEFAULT 'draft',
    "kind"              TEXT NOT NULL DEFAULT 'exhibit',
    "exhibit_id"        UUID REFERENCES "exhibits"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "caption_el"        TEXT,
    "caption_en"        TEXT,
    "hashtags"          JSONB,
    "image_storage_key" TEXT,
    "extra_image_keys"  JSONB,
    "link_url"          TEXT,
    "scheduled_at"      TIMESTAMP(3),
    "published_at"      TIMESTAMP(3),
    "created_by"        UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "updated_by"        UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,
    "deleted_at"        TIMESTAMP(3)
);
CREATE INDEX "marketing_posts_status_idx"       ON "marketing_posts" ("status");
CREATE INDEX "marketing_posts_scheduled_at_idx" ON "marketing_posts" ("scheduled_at");
CREATE INDEX "marketing_posts_exhibit_id_idx"   ON "marketing_posts" ("exhibit_id");
CREATE INDEX "marketing_posts_deleted_at_idx"   ON "marketing_posts" ("deleted_at");

-- ─── marketing_post_targets ────────────────────────────────────
CREATE TABLE "marketing_post_targets" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "post_id"          UUID NOT NULL REFERENCES "marketing_posts"("id")  ON UPDATE CASCADE ON DELETE CASCADE,
    "account_id"       UUID NOT NULL REFERENCES "social_accounts"("id")  ON UPDATE CASCADE ON DELETE CASCADE,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "external_post_id" TEXT,
    "external_url"     TEXT,
    "error_message"    TEXT,
    "attempts"         INTEGER NOT NULL DEFAULT 0,
    "published_at"     TIMESTAMP(3)
);
CREATE UNIQUE INDEX "marketing_post_targets_post_id_account_id_key" ON "marketing_post_targets" ("post_id", "account_id");
CREATE INDEX "marketing_post_targets_account_id_idx" ON "marketing_post_targets" ("account_id");
CREATE INDEX "marketing_post_targets_status_idx"     ON "marketing_post_targets" ("status");

-- ─── social_metrics ─────────────────────────────────────────────
CREATE TABLE "social_metrics" (
    "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "account_id"  UUID REFERENCES "social_accounts"("id")        ON UPDATE CASCADE ON DELETE CASCADE,
    "target_id"   UUID REFERENCES "marketing_post_targets"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "metric_key"  TEXT NOT NULL,
    "value"       DECIMAL(18, 4) NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    -- Every metric row must be scoped to either an account (followers,
    -- page views) OR a target (per-post reach, engagements). XOR-NOT-NULL
    -- enforced here because Prisma can't model it directly.
    CONSTRAINT "social_metrics_scope_chk"
      CHECK ((account_id IS NOT NULL)::INT + (target_id IS NOT NULL)::INT = 1)
);
CREATE INDEX "social_metrics_account_idx" ON "social_metrics" ("account_id", "metric_key", "observed_at" DESC);
CREATE INDEX "social_metrics_target_idx"  ON "social_metrics" ("target_id",  "metric_key", "observed_at" DESC);

-- ─── Permissions ────────────────────────────────────────────────
-- Seed the two new permission strings into the matrix so they're
-- visible in Users → Roles & Permissions. Defaults: admin gets both,
-- curator gets marketing:read, viewer / capture nothing.
INSERT INTO "role_permissions" (role, permission, allowed, updated_at)
VALUES
  ('admin',          'marketing:read',  true,  CURRENT_TIMESTAMP),
  ('admin',          'marketing:write', true,  CURRENT_TIMESTAMP),
  ('senior_curator', 'marketing:read',  true,  CURRENT_TIMESTAMP),
  ('senior_curator', 'marketing:write', true,  CURRENT_TIMESTAMP),
  ('curator',        'marketing:read',  true,  CURRENT_TIMESTAMP),
  ('curator',        'marketing:write', false, CURRENT_TIMESTAMP),
  ('viewer',         'marketing:read',  false, CURRENT_TIMESTAMP),
  ('viewer',         'marketing:write', false, CURRENT_TIMESTAMP)
ON CONFLICT (role, permission) DO NOTHING;
