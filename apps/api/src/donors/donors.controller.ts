import {
  Controller,
  Get,
  Inject,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { z } from 'zod';
import { DonorsService } from './donors.service';
import { DonorFilesService } from './donor-files.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, Public } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import { createDonorSchema, updateDonorSchema, mergeDonorsSchema } from '@museumos/contracts';

@Controller('donors')
export class DonorsController {
  constructor(
    @Inject(DonorsService) private readonly donorsService: DonorsService,
    @Inject(DonorFilesService) private readonly filesService: DonorFilesService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('donor:read')
  async findAll() {
    return this.donorsService.findAll();
  }

  // Public donor list for the external marketing site. Names only, A→Z.
  // Declared before `@Get(':id')` so the static path wins over the param route.
  @Get('public')
  @Public()
  async findAllPublic() {
    return this.donorsService.findAllPublic();
  }

  // Autocomplete for @-mentions (numeric query → donor number, else name).
  @Get('search')
  @RequirePermission('donor:read')
  async search(@Query('q') q?: string, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(parseInt(limit ?? '8', 10) || 8, 1), 50);
    return this.donorsService.search(q ?? '', n);
  }

  // Resolves @-mention donor numbers ("ids" = comma-separated) to {id, legacyId, name}.
  @Get('mentions')
  @RequirePermission('donor:read')
  async resolveMentions(@Query('ids') ids?: string) {
    const tokens = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (tokens.length === 0) return [];
    return this.donorsService.resolveMentions(tokens);
  }

  @Get(':id')
  @RequirePermission('donor:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.donorsService.findById(id);
  }

  @Post()
  @RequirePermission('donor:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createDonorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const donor = await this.donorsService.create(parsed.data);

    await this.auditService.log({
      entityType: 'donor',
      entityId: donor.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return donor;
  }

  @Patch(':id')
  @RequirePermission('donor:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = updateDonorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const before = await this.donorsService.findById(id);
    const updated = await this.donorsService.update(id, parsed.data);

    // Audit diff captures whatever changed — naive snapshot, but enough for
    // an operator to see "this got updated" with a hint of what.
    const diff: Record<string, [unknown, unknown]> = {};
    for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
      const next = parsed.data[key];
      const prev = (before as Record<string, unknown>)[key];
      if (prev !== next) diff[key as string] = [prev, next];
    }

    await this.auditService.log({
      entityType: 'donor',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      diff,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return updated;
  }

  @Post('merge')
  @RequirePermission('donor:merge')
  @HttpCode(HttpStatus.OK)
  async merge(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = mergeDonorsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const result = await this.donorsService.merge(
      parsed.data.targetId,
      parsed.data.sourceIds,
    );

    await this.auditService.log({
      entityType: 'donor',
      entityId: parsed.data.targetId,
      action: 'merge',
      actorId: actor.id,
      diff: { mergedFrom: [null, parsed.data.sourceIds] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return result;
  }

  // ── Donor files (scanned donation forms, photos, PDFs) ──────

  @Get(':id/files')
  @RequirePermission('donor:read')
  async listFiles(@Param('id', ParseUUIDPipe) id: string) {
    return this.filesService.list(id);
  }

  @Post(':id/files')
  @RequirePermission('donor:write')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadFiles(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }>,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const result = await this.filesService.uploadMany(id, files ?? [], actor.id);
    await this.auditService.log({
      entityType: 'donor_file',
      entityId: id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      diff: { uploaded: [null, result.files.map((f) => f.originalFilename)] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return result;
  }

  @Patch(':id/files/:fileId')
  @RequirePermission('donor:write')
  async updateFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ caption: z.string().max(500).nullable().optional() })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.filesService.update(id, fileId, parsed.data);
  }

  @Post(':id/files/:fileId/rotate')
  @RequirePermission('donor:write')
  @HttpCode(HttpStatus.OK)
  async rotateFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ direction: z.enum(['cw', 'ccw']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.filesService.rotate(id, fileId, parsed.data.direction);
  }

  @Delete(':id/files/:fileId')
  @RequirePermission('donor:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    await this.filesService.delete(id, fileId);
    await this.auditService.log({
      entityType: 'donor_file',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      diff: { fileId: [fileId, null] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
}
