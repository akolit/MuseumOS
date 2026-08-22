import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories';
import { ExhibitsService } from './exhibits.service';
import { ExhibitsSearchService } from './exhibits-search.service';
import { ExhibitImagesService } from './exhibit-images.service';
import { ExhibitNotesService } from './exhibit-notes.service';
import { ExhibitsController } from './exhibits.controller';
import { ExhibitNotesController } from './exhibit-notes.controller';

@Module({
  imports: [CategoriesModule],
  providers: [ExhibitsService, ExhibitsSearchService, ExhibitImagesService, ExhibitNotesService],
  controllers: [ExhibitsController, ExhibitNotesController],
  exports: [ExhibitsService, ExhibitsSearchService, ExhibitImagesService, ExhibitNotesService],
})
export class ExhibitsModule {}
