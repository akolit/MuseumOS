import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { MarketingAccountsService } from './marketing-accounts.service';
import { MarketingMetricsService } from './marketing-metrics.service';
import { MarketingController } from './marketing.controller';
import { MetaOAuthService } from './oauth/meta.service';
import { OAuthController } from './oauth/oauth.controller';

@Module({
  providers: [
    MarketingService,
    MarketingAccountsService,
    MarketingMetricsService,
    MetaOAuthService,
  ],
  controllers: [MarketingController, OAuthController],
  exports: [MarketingService, MarketingAccountsService, MarketingMetricsService, MetaOAuthService],
})
export class MarketingModule {}
