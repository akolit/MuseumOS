import {
  Controller,
  Post,
  Get,
  Body,
  Inject,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { loginSchema } from '@museumos/contracts';
import { Public } from './decorators/public.decorator';
import { AuditAction } from '../audit/audit.service';
import { AuditService } from '../audit/audit.service';
import { RolePermissionsService } from './role-permissions.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(RolePermissionsService) private readonly rolePerms: RolePermissionsService,
  ) {}

  // The global throttle (20/s, 100/10s) is sized for browsing, which would
  // still allow hundreds of password guesses a minute. Credential stuffing is
  // the one thing an internet-facing admin login has to survive, so this
  // endpoint gets its own far tighter bucket: 10 attempts per 15 minutes per
  // client IP. Requires `trust proxy` (set in main.ts) to key on the real IP.
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 10 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Req() req: Request) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { identifier, password } = parsed.data;

    try {
      const user = await this.authService.validateUser(identifier, password);

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;
      // Snapshot permissions into the session so the per-request hot path
      // (AuthGuard → PermissionGuard) doesn't hit the DB for them.
      req.session.permissions = await this.rolePerms.permissionsForRole(user.role);

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await this.auditService.log({
        entityType: 'user',
        entityId: user.id,
        action: AuditAction.LOGIN,
        actorId: user.id,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        themePreference: user.themePreference,
        langPreference: user.langPreference,
        permissions: req.session.permissions,
      };
    } catch {
      await this.auditService.log({
        entityType: 'user',
        entityId: '00000000-0000-0000-0000-000000000000',
        action: AuditAction.LOGIN_FAILED,
        actorId: null,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        diff: { identifier: [null, identifier] },
      });

      throw new UnauthorizedException('Invalid credentials');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const userId = req.session.userId;

    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (userId) {
      await this.auditService.log({
        entityType: 'user',
        entityId: userId,
        action: 'logout',
        actorId: userId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    }

    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const userId = req.session.userId;

    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    // Older sessions (from before this feature shipped) may have an empty
    // permissions array. Top up from the live matrix so the UI gets correct
    // affordances without forcing a logout/login cycle.
    if (!req.session.permissions || req.session.permissions.length === 0) {
      req.session.permissions = await this.rolePerms.permissionsForRole(user.role);
    }

    return { ...user, permissions: req.session.permissions };
  }
}
