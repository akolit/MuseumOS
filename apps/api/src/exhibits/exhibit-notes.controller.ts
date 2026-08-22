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
  Query,
} from '@nestjs/common';
import { ExhibitNotesService } from './exhibit-notes.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';

@Controller('exhibits/:exhibitId/notes')
export class ExhibitNotesController {
  constructor(
    @Inject(ExhibitNotesService) private readonly notes: ExhibitNotesService,
  ) {}

  // List notes for an exhibit. `order=asc` for oldest-first, default desc.
  @Get()
  @RequirePermission('exhibit:read')
  async list(
    @Param('exhibitId') exhibitId: string,
    @Query('order') order?: string,
  ) {
    return this.notes.list(exhibitId, order === 'asc' ? 'asc' : 'desc');
  }

  @Post()
  @RequirePermission('exhibit:write')
  async create(
    @Param('exhibitId') exhibitId: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ) {
    return this.notes.create(exhibitId, body, user.id);
  }

  @Patch(':noteId')
  @RequirePermission('exhibit:write')
  async update(
    @Param('exhibitId') exhibitId: string,
    @Param('noteId') noteId: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ) {
    // exhibit:delete unlocks editing notes you didn't author.
    const canEditOthers = user.role === 'admin' || user.permissions.includes('exhibit:delete');
    return this.notes.update(exhibitId, noteId, body, user.id, canEditOthers);
  }

  @Delete(':noteId')
  @RequirePermission('exhibit:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('exhibitId') exhibitId: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: SessionUser,
  ) {
    await this.notes.delete(exhibitId, noteId, user.id);
  }
}
