import { z } from 'zod';

// ─── Enumerations ─────────────────────────────────────────────────────
//
// Stored as strings in the DB rather than Prisma/PG enums so we can
// add platforms or statuses later without a migration. Adding a value
// here is the only place that needs to change.

export const socialPlatforms = ['facebook', 'instagram', 'youtube', 'x', 'linkedin'] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export const socialAccountStatuses = ['connected', 'expired', 'revoked', 'disabled'] as const;
export type SocialAccountStatus = (typeof socialAccountStatuses)[number];

export const marketingPostStatuses = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;
export type MarketingPostStatus = (typeof marketingPostStatuses)[number];

export const marketingPostKinds = ['exhibit', 'event', 'announcement', 'custom'] as const;
export type MarketingPostKind = (typeof marketingPostKinds)[number];

export const marketingTargetStatuses = ['pending', 'publishing', 'published', 'failed', 'skipped'] as const;
export type MarketingTargetStatus = (typeof marketingTargetStatuses)[number];

// ─── SocialAccount ────────────────────────────────────────────────────

export const socialAccountSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(socialPlatforms),
  externalId: z.string(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  status: z.enum(socialAccountStatuses),
  tokenExpiresAt: z.string().datetime().nullable(),
  scopes: z.string().nullable(),
  connectedById: z.string().uuid().nullable(),
  connectedByDisplayName: z.string().nullable(),
  connectedAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
});
export type SocialAccount = z.infer<typeof socialAccountSchema>;

// Manual create payload — used by the (future) "Connect" button on
// the Channels tab once OAuth lands. The body matches what the OAuth
// callback would normally fill in; for now a curator can paste it
// to seed an account row for testing.
export const createSocialAccountSchema = z.object({
  platform: z.enum(socialPlatforms),
  externalId: z.string().min(1).max(200),
  handle: z.string().max(200).nullish(),
  displayName: z.string().max(200).nullish(),
  accessToken: z.string().min(1).max(8000),
  refreshToken: z.string().max(8000).nullish(),
  tokenExpiresAt: z.string().datetime().nullish(),
  scopes: z.string().max(2000).nullish(),
});
export type CreateSocialAccountInput = z.infer<typeof createSocialAccountSchema>;

// ─── MarketingPost ────────────────────────────────────────────────────

const captionSchema = z.string().max(2200).nullish(); // 2,200 = IG limit
const hashtagsSchema = z.array(z.string().max(120)).max(30).nullish();
const storageKeysSchema = z.array(z.string().max(500)).max(10).nullish();

export const createMarketingPostSchema = z.object({
  kind: z.enum(marketingPostKinds).default('exhibit'),
  exhibitId: z.string().uuid().nullish(),
  captionEl: captionSchema,
  captionEn: captionSchema,
  hashtags: hashtagsSchema,
  imageStorageKey: z.string().max(500).nullish(),
  extraImageKeys: storageKeysSchema,
  linkUrl: z.string().url().max(500).nullish(),
  scheduledAt: z.string().datetime().nullish(),
  // Which connected accounts this post should fan out to. May be empty
  // for a "save as draft, decide targets later" flow.
  targetAccountIds: z.array(z.string().uuid()).max(20).default([]),
});
export type CreateMarketingPostInput = z.infer<typeof createMarketingPostSchema>;

// Partial of the create payload; targetAccountIds replaces the existing
// target list when provided, otherwise leaves it untouched.
export const updateMarketingPostSchema = createMarketingPostSchema.partial().extend({
  status: z.enum(marketingPostStatuses).optional(),
});
export type UpdateMarketingPostInput = z.infer<typeof updateMarketingPostSchema>;

// Returned shape from /api/marketing/posts. Includes nested targets so
// the Calendar / Composer can render per-platform status without a
// second round-trip per post.
export const marketingPostTargetSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  platform: z.enum(socialPlatforms),
  handle: z.string().nullable(),
  status: z.enum(marketingTargetStatuses),
  externalPostId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attempts: z.number().int(),
  publishedAt: z.string().datetime().nullable(),
});
export type MarketingPostTarget = z.infer<typeof marketingPostTargetSchema>;

export const marketingPostSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(marketingPostStatuses),
  kind: z.enum(marketingPostKinds),
  exhibitId: z.string().uuid().nullable(),
  exhibitDisplayId: z.string().nullable(),
  exhibitName: z.string().nullable(),
  captionEl: z.string().nullable(),
  captionEn: z.string().nullable(),
  hashtags: z.array(z.string()).nullable(),
  imageStorageKey: z.string().nullable(),
  extraImageKeys: z.array(z.string()).nullable(),
  linkUrl: z.string().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdById: z.string().uuid().nullable(),
  createdByDisplayName: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  targets: z.array(marketingPostTargetSchema),
});
export type MarketingPost = z.infer<typeof marketingPostSchema>;

// ─── SocialMetric ─────────────────────────────────────────────────────

// One observation. Either accountId or targetId is set (DB CHECK).
export const socialMetricSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  targetId: z.string().uuid().nullable(),
  metricKey: z.string(),
  value: z.number(),
  observedAt: z.string().datetime(),
});
export type SocialMetric = z.infer<typeof socialMetricSchema>;

// Aggregated payload returned by /api/marketing/analytics — used by
// the Analytics tab to render KPI tiles, the per-platform breakdown
// table, and sparklines. Stays flexible so we can shape it for the
// frontend without DB churn.
export const marketingAnalyticsSchema = z.object({
  totals: z.object({
    reach30d: z.number(),
    reachDelta: z.number(),
    engagementPct: z.number(),
    engagementDelta: z.number(),
    followers: z.number(),
    followerDelta: z.number(),
  }),
  byPlatform: z.array(z.object({
    platform: z.enum(socialPlatforms),
    followers: z.number(),
    reach30d: z.number(),
    engagementPct: z.number(),
    growthPct: z.number(),
  })),
  topPosts: z.array(z.object({
    postId: z.string().uuid(),
    title: z.string(),
    platform: z.enum(socialPlatforms),
    reach: z.number(),
    engagements: z.number(),
    publishedAt: z.string().datetime().nullable(),
  })),
});
export type MarketingAnalytics = z.infer<typeof marketingAnalyticsSchema>;
