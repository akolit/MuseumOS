import { Module } from '@nestjs/common';
import { WikidataService } from './wikidata.service';
import { WikidataController } from './wikidata.controller';

@Module({
  providers: [WikidataService],
  controllers: [WikidataController],
  exports: [WikidataService],
})
export class WikidataModule {}
