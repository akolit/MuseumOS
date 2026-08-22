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
import { z } from 'zod';
import { UsersService } from './users.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth';
import type { SessionUser } from '../auth';
import { AuditService, AuditAction } from '../audit';
import { roles } from '@museumos/contracts';

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
  role: z.enum(roles),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  role: z.enum(roles).optional(),
  themePreference: z.string().nullish(),
  langPreference: z.string().nullish(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermission('user:read')
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @RequirePermission('user:read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermission('user:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const user = await this.usersService.create(parsed.data);

    await this.auditService.log({
      entityType: 'user',
      entityId: user.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      diff: { email: [null, user.email], role: [null, user.role] },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return user;
  }

  @Patch(':id')
  @RequirePermission('user:manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const before = await this.usersService.findById(id);
    const updated = await this.usersService.update(id, parsed.data);

    const diff = this.auditService.computeDiff(
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (diff) {
      const action = diff['role'] ? AuditAction.ROLE_CHANGE : AuditAction.UPDATE;
      await this.auditService.log({
        entityType: 'user',
        entityId: id,
        action,
        actorId: actor.id,
        diff,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    }

    return updated;
  }

  @Post(':id/reset-password')
  @RequirePermission('user:manage')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.usersService.resetPassword(id, parsed.data.password);

    await this.auditService.log({
      entityType: 'user',
      entityId: id,
      action: AuditAction.PASSWORD_RESET,
      actorId: actor.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    return result;
  }

  @Patch('me/preferences')
  async updatePreferences(
    @Body() body: unknown,
    @CurrentUser() actor: SessionUser,
  ) {
    const parsed = z
      .object({
        themePreference: z.string().nullish(),
        langPreference: z.string().nullish(),
      })
      .safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.usersService.update(actor.id, parsed.data);
  }
}
