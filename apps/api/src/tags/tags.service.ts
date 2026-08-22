import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database';

@Injectable()
export class TagsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll() {
    return this.db.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { exhibits: true } } },
    });
  }

  async findById(id: string) {
    const tag = await this.db.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  async create(data: { name: string; color?: string }) {
    const existing = await this.db.tag.findUnique({
      where: { name: data.name },
    });
    if (existing) throw new ConflictException('Tag already exists');
    return this.db.tag.create({ data });
  }

  async update(id: string, data: { name?: string; color?: string | null }) {
    await this.findById(id);
    if (data.name) {
      const existing = await this.db.tag.findFirst({
        where: { name: data.name, NOT: { id } },
      });
      if (existing) throw new ConflictException('Tag name already in use');
    }
    return this.db.tag.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db.exhibitTag.deleteMany({ where: { tagId: id } });
    await this.db.tag.delete({ where: { id } });
  }
}
