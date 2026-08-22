import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../../database';

// State store for the OAuth round-trip — protects against CSRF by
// requiring the callback to present the same opaque token that was
// minted at /start. In-memory works for single-instance dev; production
// needs Redis or a DB row with TTL because Coolify rolling deploys
// would otherwise drop in-flight states. Keep entries for 10 minutes.
const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, { issuedAt: number; userId: string | null }>();
function purgeExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (now - v.issuedAt > STATE_TTL_MS) stateStore.delete(k);
  }
}

// Scope list: Facebook Pages + Instagram Business posting + insights.
// "instagram_basic" is required for the IG <-> FB Page linkage check
// even if we only post via Instagram Graph endpoints.
const META_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'read_insights',
].join(',');

const META_API = 'https://graph.facebook.com/v21.0';
const META_AUTH = 'https://www.facebook.com/v21.0/dialog/oauth';

@Injectable()
export class MetaOAuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // Build the authorise URL the operator's browser will be redirected to.
  // Throws if Meta app credentials aren't configured — surfaced as a 400
  // back to the UI so the operator gets a clear error rather than a
  // confusing redirect to Facebook's error page.
  startUrl(userId: string | null): string {
    const appId = process.env.META_APP_ID;
    const redirect = process.env.META_OAUTH_REDIRECT_URI;
    if (!appId || !redirect) {
      throw new BadRequestException(
        'Meta OAuth is not configured. Set META_APP_ID, META_APP_SECRET and META_OAUTH_REDIRECT_URI in the API env. See apps/api/src/marketing/oauth/README.md.',
      );
    }
    purgeExpiredStates();
    const state = randomBytes(24).toString('hex');
    stateStore.set(state, { issuedAt: Date.now(), userId });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirect,
      state,
      scope: META_SCOPES,
      response_type: 'code',
      // auth_type=rerequest forces the consent screen even if the user
      // previously denied a scope, which is what we want during dev.
      auth_type: 'rerequest',
    });
    return `${META_AUTH}?${params.toString()}`;
  }

  // Handle the `?code=…&state=…` redirect from Facebook. Returns an
  // array of account IDs that were created — typically 1 (the FB Page)
  // + 1 (the linked IG Business account) when both are connected.
  async handleCallback(args: { code: string; state: string; }): Promise<{ created: string[] }> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirect = process.env.META_OAUTH_REDIRECT_URI;
    if (!appId || !appSecret || !redirect) {
      throw new BadRequestException('Meta OAuth not configured');
    }
    purgeExpiredStates();
    const stateEntry = stateStore.get(args.state);
    if (!stateEntry) throw new BadRequestException('OAuth state invalid or expired');
    stateStore.delete(args.state);

    // 1) Code → short-lived user access token
    const tokenRes = await fetch(
      `${META_API}/oauth/access_token?` + new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirect,
        code: args.code,
      }).toString(),
    );
    if (!tokenRes.ok) {
      throw new BadRequestException(`Meta token exchange failed: ${tokenRes.status}`);
    }
    const tokenJson = await tokenRes.json() as { access_token: string };
    const shortToken: string = tokenJson.access_token;

    // 2) Exchange for long-lived user token (≈60 days).
    const longRes = await fetch(
      `${META_API}/oauth/access_token?` + new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      }).toString(),
    );
    if (!longRes.ok) {
      throw new BadRequestException(`Long-lived token exchange failed: ${longRes.status}`);
    }
    const longJson = await longRes.json() as { access_token: string; expires_in?: number };

    // 3) List user's Pages. The Page access_token returned alongside
    //    each page is what we actually want — Page tokens never expire
    //    (when minted from a long-lived user token).
    const pagesRes = await fetch(
      `${META_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(longJson.access_token)}`,
    );
    if (!pagesRes.ok) {
      throw new BadRequestException(`Failed to list Pages: ${pagesRes.status}`);
    }
    const pagesJson = await pagesRes.json() as {
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
    };

    const createdIds: string[] = [];
    for (const page of pagesJson.data) {
      const fbAccount = await this.upsertAccount({
        platform: 'facebook',
        externalId: page.id,
        handle: page.name,
        displayName: page.name,
        accessToken: page.access_token, // never-expires Page token
        userId: stateEntry.userId,
      });
      createdIds.push(fbAccount.id);

      // 4) If the Page is linked to an Instagram Business account, we
      //    can post to IG through the same token — store as a separate
      //    social_accounts row so the UI lists IG independently.
      if (page.instagram_business_account?.id) {
        const igAccount = await this.upsertAccount({
          platform: 'instagram',
          externalId: page.instagram_business_account.id,
          handle: page.instagram_business_account.username
            ? `@${page.instagram_business_account.username}`
            : null,
          displayName: page.name,
          accessToken: page.access_token, // IG uses the linked Page token
          userId: stateEntry.userId,
        });
        createdIds.push(igAccount.id);
      }
    }

    return { created: createdIds };
  }

  // Idempotent — upsert by (platform, externalId) so reconnecting just
  // refreshes the token instead of duplicating the row.
  private async upsertAccount(args: {
    platform: 'facebook' | 'instagram';
    externalId: string;
    handle: string | null;
    displayName: string | null;
    accessToken: string;
    userId: string | null;
  }) {
    return this.db.socialAccount.upsert({
      where: { platform_externalId: { platform: args.platform, externalId: args.externalId } },
      create: {
        platform: args.platform,
        externalId: args.externalId,
        handle: args.handle,
        displayName: args.displayName,
        accessToken: args.accessToken,
        status: 'connected',
        scopes: META_SCOPES,
        connectedById: args.userId,
        connectedAt: new Date(),
      },
      update: {
        handle: args.handle,
        displayName: args.displayName,
        accessToken: args.accessToken,
        status: 'connected',
        lastError: null,
        scopes: META_SCOPES,
      },
    });
  }
}
