import { Module } from '@nestjs/common';
import { FloorPlansService } from './floor-plans.service';
import { FloorPlansController } from './floor-plans.controller';

@Module({
  providers: [FloorPlansService],
  controllers: [FloorPlansController],
  exports: [FloorPlansService],
})
export class FloorPlansModule {}
