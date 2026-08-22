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
  Res,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ExhibitsService } from './exhibits.service';
import { ExhibitsSearchService } from './exhibits-search.service';
import { ExhibitImagesService } from './exhibit-images.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import {
  createExhibitSchema,
  updateExhibitSchema,
  bulkUpdateSchema,
  searchQuerySchema,
  globalSearchSchema,
} from '@museumos/contracts';

@Controller('exhibits')
export class ExhibitsController {
  constructor(
    @Inject(ExhibitsService) private readonly exhibitsService: ExhibitsService,
    @Inject(ExhibitsSearchService) private readonly searchService: ExhibitsSearchService,
    @Inject(ExhibitImagesService) private readonly imagesService: ExhibitImagesService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('exhibit:read')
  async search(@Query() query: Record<string, unknown>) {
    if (query.tagIds && typeof query.tagIds === 'string') {
      query.tagIds = (query.tagIds as string).split(',');
    }
    const parsed = searchQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.search(parsed.data);
  }

  @Get('export')
  @RequirePermission('exhibit:read')
  async export(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const format = (typeof query.format === 'string' ? query.format : 'csv').toLowerCase();
    if (!['csv', 'json'].includes(format)) {
      throw new BadRequestException("format must be 'csv' or 'json'");
    }
    if (query.tagIds && typeof query.tagIds === 'string') {
      query.tagIds = (query.tagIds as string).split(',');
    }
    // pagination irrelevant for export, drop them so the parser doesn't complain about huge limit
    delete query.page;
    delete query.limit;
    const parsed = searchQuerySchema.safeParse({ ...query, page: 1, limit: 1 });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const rows = await this.searchService.exportRows(parsed.data);
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `exhibits_${stamp}_${rows.length}rows`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
      res.send(JSON.stringify(rows, null, 2));
      return;
    }

    // CSV
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
    // BOM so Excel recognises UTF-8 (Greek characters)
    res.send('﻿' + csv);
  }

  @Get('stats')
  @RequirePermission('exhibit:read')
  async stats() {
    return this.exhibitsService.stats();
  }

  // List of distinct non-null manufacturers for autocomplete inputs.
  @Get('manufacturers')
  @RequirePermission('exhibit:read')
  async manufacturers() {
    return this.exhibitsService.listManufacturers();
  }

  // Distinct values for given attribute keys within a category — powers the
  // in-form autocomplete dropdowns for high-cardinality fields.
  @Get('attribute-values')
  @RequirePermission('exhibit:read')
  async attributeValues(@Query() query: Record<string, unknown>) {
    const parsed = z
      .object({ categoryId: z.string().uuid(), keys: z.string().min(1) })
      .safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const keys = parsed.data.keys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20);
    return this.exhibitsService.listAttributeValues(parsed.data.categoryId, keys);
  }

  // Minimal lookup for many exhibits at once (e.g. label-printing).
  // POST body avoids URL-length limits when fetching hundreds of UUIDs.
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('exhibit:read')
  async lookup(@Body() body: unknown) {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(2000) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.exhibitsService.lookupMany(parsed.data.ids);
  }

  @Get('match-ids')
  @RequirePermission('exhibit:read')
  async matchIds(@Query() query: Record<string, unknown>) {
    if (query.tagIds && typeof query.tagIds === 'string') {
      query.tagIds = (query.tagIds as string).split(',');
    }
    delete query.page;
    delete query.limit;
    const parsed = searchQuerySchema.safeParse({ ...query, page: 1, limit: 1 });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // For text search, defer to FTS-aware exportRows (capped). For non-text filters,
    // use the lighter findMatchingIds.
    if (parsed.data.q) {
      const rows = await this.searchService.exportRows(parsed.data);
      const ids = rows.map((r: any) => r.id).filter(Boolean).slice(0, 500);
      return { ids, total: rows.length, capped: rows.length > 500 };
    }
    const ids = await this.exhibitsService.findMatchingIds(parsed.data, 500);
    return { ids, total: ids.length, capped: ids.length === 500 };
  }

  @Get('search')
  @RequirePermission('exhibit:read')
  async globalSearch(@Query() query: Record<string, unknown>) {
    const parsed = globalSearchSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.globalSearch(parsed.data);
  }

  // Resolves @-mention tokens from a comment ("ids" = comma-separated display
  // ids) to {id, displayId, exhibitName} so the web app can link them.
  @Get('mentions')
  @RequirePermission('exhibit:read')
  async resolveMentions(@Query('ids') ids?: string) {
    const tokens = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (tokens.length === 0) return [];
    return this.searchService.resolveMentions(tokens);
  }

  @Get(':id')
  @RequirePermission('exhibit:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.exhibitsService.findById(id);
  }

  @Get(':id/similar')
  @RequirePermission('exhibit:read')
  async similar(@Param('id', ParseUUIDPipe) id: string) {
    const items = await this.exhibitsService.findSimilar(id);
    return { items };
  }

  @Post()
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createExhibitSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const exhibit = await this.exhibitsService.create(parsed.data, actor.id);

    await this.auditService.log({
      entityType: 'exhibit',
      entityId: exhibit.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      diff: { displayId: [null, exhibit.displayId], exhibitName: [null, exhibit.exhibitName] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return exhibit;
  }

  @Patch(':id')
  @RequirePermission('exhibit:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = updateExhibitSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const before = await this.exhibitsService.findById(id);
    const updated = await this.exhibitsService.update(id, parsed.data, actor.id);

    const diff = this.auditService.computeDiff(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (diff) {
      await this.auditService.log({
        entityType: 'exhibit',
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
  @RequirePermission('exhibit:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    await this.exhibitsService.softDelete(id, actor.id);

    await this.auditService.log({
      entityType: 'exhibit',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  @Post(':id/restore')
  @RequirePermission('exhibit:delete')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const exhibit = await this.exhibitsService.restore(id, actor.id);

    await this.auditService.log({
      entityType: 'exhibit',
      entityId: id,
      action: AuditAction.RESTORE,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return exhibit;
  }

  @Patch(':id/tags')
  @RequirePermission('exhibit:write')
  async setTags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({
      tagIds: z.array(z.string().uuid()),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.exhibitsService.setTags(id, parsed.data.tagIds);
  }

  // ── Image management ──────────────────────────────────────

  @Post(':id/images')
  @RequirePermission('exhibit:write')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadImages(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }>,
    @CurrentUser() actor: SessionUser,
  ) {
    return this.imagesService.uploadMany(id, files ?? [], actor.id);
  }

  @Patch(':id/images/reorder')
  @RequirePermission('exhibit:write')
  async reorderImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({
      imageIds: z.array(z.string().uuid()).min(1),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.imagesService.reorder(id, parsed.data.imageIds);
  }

  @Patch(':id/images/:imageId')
  @RequirePermission('exhibit:write')
  async updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({
      isPrimary: z.boolean().optional(),
      caption: z.string().max(500).nullable().optional(),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.imagesService.update(id, imageId, parsed.data);
  }

  @Post(':id/images/:imageId/rotate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('exhibit:write')
  async rotateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ direction: z.enum(['cw', 'ccw']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.imagesService.rotate(id, imageId, parsed.data.direction);
  }

  @Delete(':id/images/:imageId')
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    await this.imagesService.delete(id, imageId);
  }

  @Post('bulk')
  @RequirePermission('exhibit:write')
  @HttpCode(HttpStatus.OK)
  async bulkUpdate(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = bulkUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const result = await this.exhibitsService.bulkUpdate(
      parsed.data.ids,
      parsed.data.update,
      actor.id,
    );

    await this.auditService.log({
      entityType: 'exhibit',
      entityId: parsed.data.ids[0]!,
      action: 'bulk_update',
      actorId: actor.id,
      diff: { ids: [null, parsed.data.ids], fields: [null, Object.keys(parsed.data.update)] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return result;
  }
}

// ── CSV helper ──────────────────────────────────────────────

const CSV_COLUMNS = [
  'displayId', 'legacyId',
  'categoryCode', 'categoryNameEn', 'categoryNameEl',
  'exhibitName', 'manufacturer', 'year',
  'donor', 'locationCode', 'locationNameEn', 'locSite',
  'functional', 'validated', 'published',
  'collectiblePrice', 'comment', 'functionalComment',
  'tags', 'imageCount', 'attributes',
  'createdAt', 'updatedAt',
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (Array.isArray(value)) s = value.join('; ');
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}
