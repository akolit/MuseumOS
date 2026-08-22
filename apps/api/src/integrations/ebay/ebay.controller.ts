import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { EbayService } from './ebay.service';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('integrations/ebay')
export class EbayController {
  constructor(@Inject(EbayService) private readonly ebay: EbayService) {}

  @Get('search')
  @RequirePermission('exhibit:read')
  async search(
    @Query('q') q?: string,
    @Query('isbn') isbn?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('q is required');
    const limit = limitRaw ? parseInt(limitRaw, 10) : 24;
    const items = await this.ebay.search({ q: query, isbn, limit: isNaN(limit) ? 24 : limit });
    return { items, marketplace: await this.ebay.getMarketplace() };
  }
}
