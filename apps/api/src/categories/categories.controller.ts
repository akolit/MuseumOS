import {
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CategoriesService } from './categories.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  renameAttributeValueInput,
  updateCategorySchemaInput,
} from '@museumos/contracts';

@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CategoriesService) private readonly categoriesService: CategoriesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('category:read')
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @RequirePermission('category:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('category:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateCategorySchemaInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.categoriesService.update(id, parsed.data);
  }

  // Rename a value in a category schema property AND cascade the change
  // to every exhibit currently using the old value. Supports dryRun so
  // the UI can preview the impact before committing.
  @Post(':id/rename-attribute-value')
  @RequirePermission('category:write')
  async renameAttributeValue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = renameAttributeValueInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.categoriesService.renameAttributeValue(id, parsed.data);
    if (!result.dryRun) {
      await this.audit.log({
        entityType: 'category',
        entityId: id,
        action: AuditAction.UPDATE,
        actorId: user.id,
        diff: {
          op: 'rename_attribute_value',
          key: parsed.data.attributeKey,
          from: parsed.data.from,
          to: parsed.data.to,
          exhibitsAffected: result.exhibitsAffected,
          enumRenamed: result.enumRenamed,
        },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    }
    return result;
  }
}
