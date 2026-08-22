import { Module } from '@nestjs/common';
import { EbayService } from './ebay.service';
import { EbayController } from './ebay.controller';
import { SettingsModule } from '../../settings';

@Module({
  imports: [SettingsModule],
  providers: [EbayService],
  controllers: [EbayController],
  exports: [EbayService],
})
export class EbayModule {}
