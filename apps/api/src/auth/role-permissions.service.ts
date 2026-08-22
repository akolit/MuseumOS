import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import { DatabaseService } from '../database';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
} from './permissions';

const ROLES: ReadonlyArray<Role> = ['viewer', 'curator', 'senior_curator', 'admin'];

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionsService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  // Seed defaults on boot. Idempotent: only inserts rows that don't yet
  // exist, so adding a new permission to ALL_PERMISSIONS in code
  // backfills it into the table on the next deploy without disturbing
  // any admin-edited rows.
  async onModuleInit() {
    const existing = await this.db.rolePermission.findMany({
      select: { role: true, permission: true },
    });
    const seen = new Set(existing.map((r) => `${r.role}:${r.permission}`));

    const toInsert = ROLES.flatMap((role) =>
      ALL_PERMISSIONS.filter((p) => !seen.has(`${role}:${p}`)).map((permission) => ({
        role,
        permission,
        allowed: DEFAULT_ROLE_PERMISSIONS[role].includes(permission),
      })),
    );

    if (toInsert.length === 0) return;

    this.logger.log(
      `Backfilling ${toInsert.length} role_permissions rows for new permissions`,
    );
    await this.db.rolePermission.createMany({ data: toInsert });
  }

  // Returns the list of permissions granted to `role`. Admin is treated as
  // implicitly all-powerful — even if someone manually flipped admin rows in
  // the DB, the API enforces it server-side here.
  async permissionsForRole(role: Role): Promise<Permission[]> {
    if (role === 'admin') return [...ALL_PERMISSIONS];

    const rows = await this.db.rolePermission.findMany({
      where: { role, allowed: true },
      select: { permission: true },
    });
    return rows.map((r) => r.permission);
  }

  // Returns the full matrix (every role × every known permission) for the
  // settings UI. Permissions present in the DB but not in ALL_PERMISSIONS
  // (e.g. left over from a removed feature) are dropped so the UI stays
  // aligned with the live inventory.
  async getMatrix(): Promise<Record<Role, Record<Permission, boolean>>> {
    const rows = await this.db.rolePermission.findMany();
    const byKey = new Map(rows.map((r) => [`${r.role}:${r.permission}`, r.allowed]));

    const matrix = {} as Record<Role, Record<Permission, boolean>>;
    for (const role of ROLES) {
      matrix[role] = {};
      for (const permission of ALL_PERMISSIONS) {
        const key = `${role}:${permission}`;
        // Fall back to the default if no row was seeded for this combination
        // (can happen when a new permission ships in code before a redeploy
        // gets a chance to seed it).
        matrix[role]![permission] =
          byKey.get(key) ?? DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
      }
    }
    return matrix;
  }

  // Bulk-update the matrix from the UI. The admin row is rejected outright
  // to make accidental neutering impossible.
  async updateMatrix(updates: Record<Role, Record<Permission, boolean>>) {
    const ops = [];
    for (const role of ROLES) {
      if (role === 'admin') continue; // admin is implicit; ignore inbound changes
      const roleUpdates = updates[role];
      if (!roleUpdates) continue;
      for (const permission of Object.keys(roleUpdates)) {
        if (!ALL_PERMISSIONS.includes(permission)) {
          throw new BadRequestException(`Unknown permission: ${permission}`);
        }
        ops.push(
          this.db.rolePermission.upsert({
            where: { role_permission: { role, permission } },
            create: { role, permission, allowed: !!roleUpdates[permission] },
            update: { allowed: !!roleUpdates[permission] },
          }),
        );
      }
    }
    await this.db.$transaction(ops);
  }
}
