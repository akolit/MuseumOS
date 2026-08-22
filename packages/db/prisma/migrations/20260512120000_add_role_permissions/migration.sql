-- Editable role → permission matrix. Defaults are seeded in code at API
-- boot so this migration only has to create the table shape.

CREATE TABLE "role_permissions" (
    "role"       "Role"    NOT NULL,
    "permission" TEXT      NOT NULL,
    "allowed"    BOOLEAN   NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permission")
);
