import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.setting.findMany();
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.db.setting.findUnique({ where: { key } });
    return row ? (row.value as T) : null;
  }

  async set(key: string, value: unknown): Promise<{ key: string; value: unknown }> {
    const row = await this.db.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
    return { key: row.key, value: row.value };
  }
}
