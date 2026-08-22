import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database';
import { AuditModule } from './audit';
import { AuthModule, AuthGuard, PermissionGuard } from './auth';
import { UsersModule } from './users';
import { CategoriesModule } from './categories';
import { DonorsModule } from './donors';
import { LocationsModule } from './locations';
import { TagsModule } from './tags';
import { ExhibitsModule } from './exhibits';
import { EbayModule } from './integrations/ebay';
import { WikidataModule } from './integrations/wikidata';
import { TimelineModule } from './timeline';
import { SettingsModule } from './settings';
import { FloorPlansModule } from './floor-plans';
import { BudgetModule } from './budget/budget.module';
import { MarketingModule } from './marketing/marketing.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 100,
      },
      // Deliberately generous at this level — endpoints that need a real
      // brute-force ceiling override it with @Throttle({ login: ... }).
      // See auth.controller.ts.
      {
        name: 'login',
        ttl: 15 * 60 * 1000,
        limit: 1000,
      },
    ]),
    DatabaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    DonorsModule,
    LocationsModule,
    TagsModule,
    ExhibitsModule,
    SettingsModule,
    FloorPlansModule,
    BudgetModule,
    MarketingModule,
    EbayModule,
    WikidataModule,
    TimelineModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
