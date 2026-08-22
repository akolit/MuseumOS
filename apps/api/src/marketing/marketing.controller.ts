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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MarketingService } from './marketing.service';
import { MarketingAccountsService } from './marketing-accounts.service';
import { MarketingMetricsService } from './marketing-metrics.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { AuditAction, AuditService } from '../audit/audit.service';

@Controller('marketing')
export class MarketingController {
  constructor(
    @Inject(MarketingService) private readonly posts: MarketingService,
    @Inject(MarketingAccountsService) private readonly accounts: MarketingAccountsService,
    @Inject(MarketingMetricsService) private readonly metrics: MarketingMetricsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─── Posts ─────────────────────────────────────────────────

  @Get('posts')
  @RequirePermission('marketing:read')
  async listPosts(@Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.posts.list({
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('posts/:id')
  @RequirePermission('marketing:read')
  async getPost(@Param('id') id: string) {
    return this.posts.get(id);
  }

  @Post('posts')
  @RequirePermission('marketing:write')
  async createPost(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const post = await this.posts.create(body, user.id);
    await this.audit.log({
      entityType: 'marketing_post',
      entityId: post.id,
      action: AuditAction.CREATE,
      actorId: user.id,
      diff: { status: post.status, kind: post.kind, exhibitId: post.exhibitId, targets: post.targets.length },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return post;
  }

  @Patch('posts/:id')
  @RequirePermission('marketing:write')
  async updatePost(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ) {
    const post = await this.posts.update(id, body, user.id);
    await this.audit.log({
      entityType: 'marketing_post',
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: user.id,
      diff: body as Record<string, unknown>,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return post;
  }

  @Delete('posts/:id')
  @RequirePermission('marketing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePost(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: Request) {
    await this.posts.remove(id);
    await this.audit.log({
      entityType: 'marketing_post',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: user.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // ─── Accounts ──────────────────────────────────────────────

  @Get('accounts')
  @RequirePermission('marketing:read')
  async listAccounts() {
    return this.accounts.list();
  }

  @Post('accounts')
  @RequirePermission('marketing:write')
  async connectAccount(@Body() body: unknown, @CurrentUser() user: SessionUser, @Req() req: Request) {
    const acct = await this.accounts.create(body, user.id);
    await this.audit.log({
      entityType: 'social_account',
      entityId: acct.id,
      action: AuditAction.CREATE,
      actorId: user.id,
      diff: { platform: acct.platform, handle: acct.handle },
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return acct;
  }

  @Delete('accounts/:id')
  @RequirePermission('marketing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectAccount(@Param('id') id: string, @CurrentUser() user: SessionUser, @Req() req: Request) {
    await this.accounts.remove(id);
    await this.audit.log({
      entityType: 'social_account',
      entityId: id,
      action: AuditAction.DELETE,
      actorId: user.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // ─── Analytics ────────────────────────────────────────────

  @Get('analytics')
  @RequirePermission('marketing:read')
  async analytics() {
    return this.metrics.overview();
  }
}
