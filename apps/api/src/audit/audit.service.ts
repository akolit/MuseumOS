import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore',
  LOGIN = 'login',
  LOGIN_FAILED = 'login_failed',
  ROLE_CHANGE = 'role_change',
  PASSWORD_RESET = 'password_reset',
}

export interface AuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  diff?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async log(input: AuditLogInput): Promise<void> {
    await this.db.auditLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        diff: input.diff ? (input.diff as Prisma.InputJsonValue) : undefined,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  }

  computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, [unknown, unknown]> | null {
    const diff: Record<string, [unknown, unknown]> = {};

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      const oldVal = before[key];
      const newVal = after[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = [oldVal ?? null, newVal ?? null];
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }
}
