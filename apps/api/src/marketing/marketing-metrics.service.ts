import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database';
import type { MarketingAnalytics, SocialPlatform } from '@museumos/contracts';

// Aggregator for the Analytics tab.
// Production: pulls observations out of `social_metrics` and computes
// totals + deltas vs the previous 30-day window. The wireframe phase
// just returns zeros so the UI binds cleanly to the eventual real shape.
@Injectable()
export class MarketingMetricsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async overview(): Promise<MarketingAnalytics> {
    // Accounts are needed for the per-platform breakdown even when no
    // metrics have been ingested yet (zeros across the board).
    const accounts = await this.db.socialAccount.findMany({
      select: { id: true, platform: true },
    });
    const platforms = Array.from(new Set(accounts.map((a) => a.platform as SocialPlatform)));

    return {
      totals: {
        reach30d: 0,
        reachDelta: 0,
        engagementPct: 0,
        engagementDelta: 0,
        followers: 0,
        followerDelta: 0,
      },
      byPlatform: platforms.map((platform) => ({
        platform,
        followers: 0,
        reach30d: 0,
        engagementPct: 0,
        growthPct: 0,
      })),
      topPosts: [],
    };
  }
}
