import { Module } from '@nestjs/common';
import { DonorsService } from './donors.service';
import { DonorFilesService } from './donor-files.service';
import { DonorsController } from './donors.controller';

@Module({
  providers: [DonorsService, DonorFilesService],
  controllers: [DonorsController],
  exports: [DonorsService],
})
export class DonorsModule {}
