// Central permission inventory.
//
// This is the single source of truth for:
//   1. The full list of permissions that exist in the app (used by the
//      Roles & Permissions UI to render the matrix).
//   2. The default role → permissions matrix seeded into the
//      `role_permissions` table on first boot (or when a role has no rows).
//
// To add a new permission: add it here, then use it in a
// @RequirePermission('resource:verb') decorator on the endpoint.

import type { Role } from '@prisma/client';

export type Permission = string;

// Listed in the order they appear in the UI. Grouping by resource matters —
// the matrix UI shows them as `<Resource>: read | write | delete | …`.
export const PERMISSIONS_BY_RESOURCE: ReadonlyArray<{
  resource: string;
  verbs: ReadonlyArray<string>;
}> = [
  { resource: 'exhibit',  verbs: ['read', 'write', 'delete', 'validate', 'publish'] },
  { resource: 'category', verbs: ['read', 'write'] },
  { resource: 'donor',    verbs: ['read', 'write', 'merge'] },
  { resource: 'location', verbs: ['read', 'write'] },
  { resource: 'tag',      verbs: ['read', 'write', 'delete'] },
  { resource: 'image',    verbs: ['read', 'write', 'delete'] },
  { resource: 'user',     verbs: ['read', 'write', 'manage'] },
  { resource: 'report',   verbs: ['read'] },
  { resource: 'audit',    verbs: ['read'] },
  { resource: 'settings',  verbs: ['write'] },
  { resource: 'budget',    verbs: ['read', 'write'] },
  { resource: 'marketing', verbs: ['read', 'write'] },
  { resource: 'timeline',  verbs: ['read', 'write'] },
];

export const ALL_PERMISSIONS: ReadonlyArray<Permission> =
  PERMISSIONS_BY_RESOURCE.flatMap((g) => g.verbs.map((v) => `${g.resource}:${v}`));

// Default role → permissions matrix. Reproduces the original hardcoded
// matrix that lived in permission.guard.ts before this was made editable.
// Used only for first-boot seeding; once the table has rows for a role,
// the DB is the source of truth.
//
// `admin` is special: it always implicitly has every permission, and the
// matrix UI shows the admin row as locked. Even so we seed it so a fresh
// DB has a complete matrix to render.
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  viewer: [
    'exhibit:read',
    'category:read',
    'donor:read',
    'location:read',
    'tag:read',
    'image:read',
    'report:read',
    'budget:read',
    'timeline:read',
  ],
  curator: [
    'exhibit:read',
    'exhibit:write',
    'category:read',
    'donor:read',
    'donor:write',
    'location:read',
    'tag:read',
    'tag:write',
    'image:read',
    'image:write',
    'report:read',
    'budget:read',
    'budget:write',
    'marketing:read',
    'timeline:read',
  ],
  senior_curator: [
    'exhibit:read',
    'exhibit:write',
    'exhibit:delete',
    'exhibit:validate',
    'category:read',
    'donor:read',
    'donor:write',
    'donor:merge',
    'location:read',
    'location:write',
    'tag:read',
    'tag:write',
    'tag:delete',
    'image:read',
    'image:write',
    'image:delete',
    'report:read',
    'audit:read',
    'budget:read',
    'budget:write',
    'marketing:read',
    'marketing:write',
    'timeline:read',
    'timeline:write',
  ],
  admin: ALL_PERMISSIONS as ReadonlyArray<Permission>,
};
