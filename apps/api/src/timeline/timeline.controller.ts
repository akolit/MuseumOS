import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { TimelineService } from './timeline.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('timeline')
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly timeline: TimelineService) {}

  @Get()
  @RequirePermission('timeline:read')
  async list(@Query('includeHidden') includeHidden?: string) {
    return this.timeline.listTimeline(includeHidden === 'true' || includeHidden === '1');
  }

  @Post('companies')
  @RequirePermission('timeline:write')
  async createCompany(@Body() body: unknown) {
    const parsed = z
      .object({
        name: z.string().min(1).max(120),
        wikidataQids: z.array(z.string().regex(/^Q\d+$/)).default([]),
        displayOrder: z.number().int().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.timeline.createCompany(parsed.data);
  }

  @Patch('companies/:id')
  @RequirePermission('timeline:write')
  async updateCompany(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z
      .object({
        name: z.string().min(1).max(120).optional(),
        wikidataQids: z.array(z.string().regex(/^Q\d+$/)).optional(),
        displayOrder: z.number().int().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.timeline.updateCompany(id, parsed.data);
  }

  @Delete('companies/:id')
  @RequirePermission('timeline:write')
  async deleteCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.timeline.deleteCompany(id);
  }

  @Post('companies/:id/refresh')
  @RequirePermission('timeline:write')
  async refresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.timeline.refreshCompany(id);
  }

  @Post('companies/:id/enrich-scan')
  @RequirePermission('timeline:write')
  async enrichScan(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ limit: z.number().int().min(1).max(40).optional() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.timeline.enrichScan(id, parsed.data.limit ?? 12);
  }

  @Post('models')
  @RequirePermission('timeline:write')
  async createModel(@Body() body: unknown) {
    const parsed = z
      .object({
        companyId: z.string().uuid(),
        name: z.string().min(1).max(200),
        year: z.number().int().min(1800).max(2100).nullable().optional(),
        imageUrl: z.string().max(1000).nullable().optional(),
        type: z.string().max(120).nullable().optional(),
        country: z.string().max(120).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        wikidataQid: z.string().regex(/^Q\d+$/).nullable().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.timeline.createModel(parsed.data);
  }

  @Patch('models/:id')
  @RequirePermission('timeline:write')
  async updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z
      .object({
        hidden: z.boolean().optional(),
        name: z.string().min(1).max(200).optional(),
        year: z.number().int().min(1800).max(2100).nullable().optional(),
        imageUrl: z.string().max(1000).nullable().optional(),
        type: z.string().max(120).nullable().optional(),
        country: z.string().max(120).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        wikidataQid: z.string().regex(/^Q\d+$/).nullable().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.timeline.updateModel(id, parsed.data);
  }

  @Delete('models/:id')
  @RequirePermission('timeline:write')
  async deleteModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.timeline.deleteModel(id);
  }
}
