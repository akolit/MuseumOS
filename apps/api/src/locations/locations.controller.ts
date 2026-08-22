import {
  Controller,
  Get,
  Inject,
  Post,
  Patch,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { LocationsService } from './locations.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import { createLocationSchema } from '@museumos/contracts';

@Controller('locations')
export class LocationsController {
  constructor(
    @Inject(LocationsService) private readonly locationsService: LocationsService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('location:read')
  async findAll() {
    return this.locationsService.findAll();
  }

  @Get(':id')
  @RequirePermission('location:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.findById(id);
  }

  @Post()
  @RequirePermission('location:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createLocationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const location = await this.locationsService.create(parsed.data);

    await this.auditService.log({
      entityType: 'location',
      entityId: location.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return location;
  }

  @Patch(':id')
  @RequirePermission('location:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createLocationSchema.partial().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const before = await this.locationsService.findById(id);
    const updated = await this.locationsService.update(id, parsed.data);

    const diff = this.auditService.computeDiff(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (diff) {
      await this.auditService.log({
        entityType: 'location',
        entityId: id,
        action: AuditAction.UPDATE,
        actorId: actor.id,
        diff,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    }

    return updated;
  }
}
