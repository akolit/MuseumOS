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
} from '@nestjs/common';
import type { Request } from 'express';
import { TagsService } from './tags.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import { createTagSchema } from '@museumos/contracts';

@Controller('tags')
export class TagsController {
  constructor(
    @Inject(TagsService) private readonly tagsService: TagsService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('tag:read')
  async findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @RequirePermission('tag:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.findById(id);
  }

  @Post()
  @RequirePermission('tag:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const tag = await this.tagsService.create(parsed.data);

    await this.auditService.log({
      entityType: 'tag',
      entityId: tag.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return tag;
  }

  @Patch(':id')
  @RequirePermission('tag:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createTagSchema.partial().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const before = await this.tagsService.findById(id);
    const updated = await this.tagsService.update(id, parsed.data);

    const diff = this.auditService.computeDiff(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (diff) {
      await this.auditService.log({
        entityType: 'tag',
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

  @Delete(':id')
  @RequirePermission('tag:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    await this.tagsService.delete(id);

    await this.auditService.log({
      entityType: 'tag',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
}
