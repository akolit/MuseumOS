-- Search infrastructure for exhibits table
-- Run after Prisma migrations have created the base tables

-- Create an immutable wrapper for unaccent (required for generated columns).
-- The body uses `public.unaccent` (schema-qualified) because pg_dump restores
-- generated-column expressions under `search_path=''` — an unqualified call
-- would fail with "function unaccent(text) does not exist".
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Add tsvector column for full-text search
ALTER TABLE exhibits ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(display_id, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(legacy_id, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(exhibit_name, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(manufacturer, ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(comment, ''))), 'C') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(attributes::text, ''))), 'C')
  ) STORED;

-- GIN index on the tsvector column for full-text queries
CREATE INDEX IF NOT EXISTS exhibits_search_tsv_idx ON exhibits USING gin(search_tsv);

-- GIN index on attributes JSONB for category-specific field queries
CREATE INDEX IF NOT EXISTS exhibits_attributes_gin_idx ON exhibits USING gin(attributes jsonb_path_ops);

-- Trigram index on exhibit_name for fuzzy/typo-tolerant search
CREATE INDEX IF NOT EXISTS exhibits_name_trgm_idx ON exhibits USING gin(exhibit_name gin_trgm_ops);

-- Trigram index on manufacturer for fuzzy search
CREATE INDEX IF NOT EXISTS exhibits_manufacturer_trgm_idx ON exhibits USING gin(manufacturer gin_trgm_ops);

-- Partial index for active (non-deleted) exhibits by category
CREATE INDEX IF NOT EXISTS exhibits_active_category_idx ON exhibits(category_id) WHERE deleted_at IS NULL;

-- Index for soft-delete filtering
CREATE INDEX IF NOT EXISTS exhibits_deleted_at_idx ON exhibits(deleted_at) WHERE deleted_at IS NOT NULL;
