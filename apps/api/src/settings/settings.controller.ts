import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('settings:write')
  async findAll() {
    return this.settings.findAll();
  }

  @Patch(':key')
  @RequirePermission('settings:write')
  async set(@Param('key') key: string, @Body() body: { value: unknown }) {
    if (!key.trim()) throw new BadRequestException('key is required');
    if (body == null || !('value' in body)) {
      throw new BadRequestException('value is required');
    }
    return this.settings.set(key, body.value);
  }
}
