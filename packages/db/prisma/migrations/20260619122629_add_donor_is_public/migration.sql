-- Adds the public-visibility flag for the donor wall on the museum website.
-- Defaults true so all existing donors stay visible; the API's public export
-- (GET /donors/public) filters on this column.
ALTER TABLE "donors" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;
