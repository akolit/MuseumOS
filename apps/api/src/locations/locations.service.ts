import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database';

@Injectable()
export class LocationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll() {
    return this.db.location.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { exhibits: true } } },
    });
  }

  async findById(id: string) {
    const loc = await this.db.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }

  async create(data: { code: string; nameEn?: string; nameEl?: string }) {
    const existing = await this.db.location.findUnique({
      where: { code: data.code },
    });
    if (existing) throw new ConflictException('Location code already exists');
    return this.db.location.create({ data });
  }

  async update(id: string, data: { code?: string; nameEn?: string; nameEl?: string }) {
    await this.findById(id);
    if (data.code) {
      const existing = await this.db.location.findFirst({
        where: { code: data.code, NOT: { id } },
      });
      if (existing) throw new ConflictException('Location code already in use');
    }
    return this.db.location.update({ where: { id }, data });
  }
}
