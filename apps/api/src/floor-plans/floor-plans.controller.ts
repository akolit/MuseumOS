import {
  Controller,
  Get,
  Inject,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { FloorPlansService } from './floor-plans.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import {
  createFloorPlanSchema,
  updateFloorPlanSchema,
  upsertPlacementSchema,
  bulkUpsertPlacementsSchema,
} from '@museumos/contracts';

@Controller('floor-plans')
export class FloorPlansController {
  constructor(
    @Inject(FloorPlansService) private readonly service: FloorPlansService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('exhibit:read')
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermission('exhibit:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Post()
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createFloorPlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const plan = await this.service.create(parsed.data.name);

    await this.auditService.log({
      entityType: 'floor_plan',
      entityId: plan.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      diff: { name: [null, plan.name] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return plan;
  }

  @Patch(':id')
  @RequirePermission('exhibit:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = updateFloorPlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const updated = await this.service.update(id, parsed.data);

    await this.auditService.log({
      entityType: 'floor_plan',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return updated;
  }

  @Delete(':id')
  @RequirePermission('exhibit:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    await this.service.delete(id);

    await this.auditService.log({
      entityType: 'floor_plan',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  @Post(':id/image')
  @RequirePermission('exhibit:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.uploadImage(id, file);
  }

  // ── Placements ─────────────────────────────────────────────

  @Post(':id/placements')
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.OK)
  async upsertPlacement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertPlacementSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.service.upsertPlacement(id, parsed.data);
  }

  @Post(':id/placements/bulk')
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.OK)
  async bulkUpsertPlacements(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = bulkUpsertPlacementsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.service.bulkUpsertPlacements(id, parsed.data.placements);
  }

  @Delete(':id/placements/:exhibitId')
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePlacement(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exhibitId', ParseUUIDPipe) exhibitId: string,
  ) {
    await this.service.removePlacement(id, exhibitId);
  }
}
