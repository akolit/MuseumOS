import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('audit')
export class AuditController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get('recent')
  @RequirePermission('exhibit:read')
  async recent(@Query('limit') limitRaw?: string) {
    const parsed = parseInt(limitRaw ?? '20', 10);
    const limit = Math.min(Math.max(isNaN(parsed) ? 20 : parsed, 1), 100);

    const rows = await this.db.auditLog.findMany({
      take: limit,
      orderBy: { at: 'desc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        diff: true,
        at: true,
        actor: { select: { id: true, displayName: true, email: true } },
      },
    });

    return rows.map((r) => ({
      id: String(r.id),
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      diff: r.diff,
      createdAt: r.at.toISOString(),
      actor: r.actor ? { id: r.actor.id, displayName: r.actor.displayName } : null,
    }));
  }

  @Get()
  @RequirePermission('settings:write')
  async list(
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
    const where: Prisma.AuditLogWhereInput = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { at: 'desc' },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          action: true,
          diff: true,
          at: true,
          ip: true,
          actor: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      items: items.map((r) => ({
        id: String(r.id),
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        diff: r.diff,
        createdAt: r.at.toISOString(),
        ip: r.ip ?? null,
        actor: r.actor ? { id: r.actor.id, displayName: r.actor.displayName } : null,
      })),
    };
  }

  @Get('facets')
  @RequirePermission('settings:write')
  async facets() {
    const [entityTypes, actions, actors] = await Promise.all([
      this.db.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
      this.db.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      this.db.user.findMany({
        where: { auditActions: { some: {} } },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
      }),
    ]);
    return {
      entityTypes: entityTypes.map((g) => g.entityType),
      actions: actions.map((g) => g.action),
      actors: actors.map((u) => ({ id: u.id, displayName: u.displayName })),
    };
  }
}
