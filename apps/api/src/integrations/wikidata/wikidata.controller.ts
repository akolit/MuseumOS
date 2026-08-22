import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
} from '@nestjs/common';
import { WikidataService } from './wikidata.service';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('integrations/wikidata')
export class WikidataController {
  constructor(@Inject(WikidataService) private readonly wikidata: WikidataService) {}

  @Get('search')
  @RequirePermission('exhibit:read')
  async search(@Query('q') q?: string, @Query('limit') limitRaw?: string) {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('q is required');
    const limit = limitRaw ? parseInt(limitRaw, 10) : 7;
    const candidates = await this.wikidata.search(query, isNaN(limit) ? 7 : limit);
    return { candidates };
  }

  @Get('entity/:qid')
  @RequirePermission('exhibit:read')
  async entity(@Param('qid') qid: string) {
    if (!/^Q\d+$/.test(qid)) throw new BadRequestException('qid must look like "Q12345"');
    return this.wikidata.enrich(qid);
  }
}
