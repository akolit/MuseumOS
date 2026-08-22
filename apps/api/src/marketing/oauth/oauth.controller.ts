import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MetaOAuthService } from './meta.service';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { SessionUser } from '../../auth/auth.service';
import { AuditAction, AuditService } from '../../audit/audit.service';

// The OAuth flow uses two endpoints under /api/marketing/oauth/<platform>:
//
//   GET /start    → 302 to the platform's authorise URL
//   GET /callback → handles the redirect back, exchanges code for tokens,
//                   creates social_accounts rows, then 302s to the
//                   Channels tab so the operator sees the new entry.
//
// Only the start endpoint is gated by marketing:write; the callback is
// reached via redirect from a third-party domain, so we authenticate
// via the same session cookie the operator already carries plus the
// CSRF-style state token stored at /start.
@Controller('marketing/oauth')
export class OAuthController {
  constructor(
    @Inject(MetaOAuthService) private readonly meta: MetaOAuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─── Meta (Facebook Pages + Instagram Business) ────────────

  @Get('meta/start')
  @RequirePermission('marketing:write')
  startMeta(@CurrentUser() user: SessionUser, @Res() res: Response) {
    const url = this.meta.startUrl(user.id);
    res.redirect(url);
  }

  @Get('meta/callback')
  async callbackMeta(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @CurrentUser() user: SessionUser | null,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const webBase = process.env.WEB_BASE_URL || 'http://localhost:5173';

    if (error) {
      // Operator cancelled or denied a scope. Bounce them back to the
      // Channels tab with a query flag the UI can pick up.
      res.redirect(`${webBase}/marketing?oauth_error=${encodeURIComponent(errorReason ?? error)}`);
      return;
    }
    if (!code || !state) throw new BadRequestException('Missing code or state');

    try {
      const result = await this.meta.handleCallback({ code, state });
      for (const id of result.created) {
        await this.audit.log({
          entityType: 'social_account',
          entityId: id,
          action: AuditAction.CREATE,
          actorId: user?.id ?? null,
          diff: { source: 'meta_oauth' },
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        });
      }
      res.redirect(`${webBase}/marketing?oauth_connected=${result.created.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'OAuth failed';
      res.redirect(`${webBase}/marketing?oauth_error=${encodeURIComponent(msg)}`);
    }
  }
}
