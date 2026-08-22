import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { BudgetService } from './budget.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { AuditAction, AuditService } from '../audit/audit.service';

@Controller('budget')
export class BudgetController {
  constructor(
    @Inject(BudgetService) private readonly budget: BudgetService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('budget:read')
  async list() {
    return this.budget.list();
  }

  @Post()
  @RequirePermission('budget:write')
  async create(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const item = await this.budget.create(body);
    await this.audit.log({
      entityType: 'budget_item',
      entityId: item.id,
      action: AuditAction.CREATE,
      actorId: user.id,
      diff: { kind: item.kind, name: item.name },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return item;
  }

  @Patch(':id')
  @RequirePermission('budget:write')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ) {
    const item = await this.budget.update(id, body);
    await this.audit.log({
      entityType: 'budget_item',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: user.id,
      diff: body as Record<string, unknown>,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return item;
  }

  @Delete(':id')
  @RequirePermission('budget:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: Request) {
    await this.budget.remove(id);
    await this.audit.log({
      entityType: 'budget_item',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: user.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // Bulk reposition by drag-drop. Body: { orderedIds: string[] }.
  @Post('reorder')
  @RequirePermission('budget:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(@Body() body: { orderedIds?: unknown }, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const ids = body.orderedIds;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return;
    await this.budget.reorder(ids as string[]);
    await this.audit.log({
      entityType: 'budget_item',
      entityId: '00000000-0000-0000-0000-000000000000',
      action: 'reorder',
      actorId: user.id,
      diff: { count: ids.length },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // Seeds the standard set of starter line items. Refuses if the table is
  // not empty so we never silently overwrite an operator's work.
  @Post('template')
  @RequirePermission('budget:write')
  async template(@CurrentUser() user: SessionUser, @Req() req: Request) {
    const items = await this.budget.seedTemplates();
    await this.audit.log({
      entityType: 'budget_item',
      entityId: '00000000-0000-0000-0000-000000000000',
      action: 'template_seed',
      actorId: user.id,
      diff: { count: items.length },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return items;
  }

  // ─── Snapshots ────────────────────────────────────────────

  @Get('snapshots')
  @RequirePermission('budget:read')
  async listSnapshots() {
    return this.budget.listSnapshots();
  }

  @Post('snapshots')
  @RequirePermission('budget:write')
  async createSnapshot(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const snap = await this.budget.createSnapshot(body, user.id);
    await this.audit.log({
      entityType: 'budget_snapshot',
      entityId: snap.id,
      action: AuditAction.CREATE,
      actorId: user.id,
      diff: { name: snap.name },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return snap;
  }

  // Restore wipes the live items and recreates from the snapshot's data.
  // The UI shows a destructive-action confirm before calling this.
  @Post('snapshots/:id/restore')
  @RequirePermission('budget:write')
  async restoreSnapshot(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const items = await this.budget.restoreSnapshot(id);
    await this.audit.log({
      entityType: 'budget_snapshot',
      entityId: id,
      action: 'restore',
      actorId: user.id,
      diff: { itemCount: items.length },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return items;
  }

  @Delete('snapshots/:id')
  @RequirePermission('budget:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSnapshot(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: Request) {
    await this.budget.deleteSnapshot(id);
    await this.audit.log({
      entityType: 'budget_snapshot',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: user.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
}
