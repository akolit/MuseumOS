import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll() {
    return this.db.category.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string) {
    const cat = await this.db.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async findByCode(code: string) {
    const cat = await this.db.category.findUnique({ where: { code } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(id: string, data: { nameEn?: string; nameEl?: string; schema?: Record<string, unknown>; sortOrder?: number }) {
    await this.findById(id);
    const { schema, ...rest } = data;
    const updateData: Prisma.CategoryUpdateInput = {
      ...rest,
      ...(schema !== undefined ? { schema: schema as Prisma.InputJsonValue } : {}),
    };
    return this.db.category.update({ where: { id }, data: updateData });
  }

  // Rename a value that appears in a category schema property AND cascade
  // the change to every exhibit whose attributes[key] equals the old value.
  //
  // If `dryRun` is true, no writes happen — we just count the exhibits
  // that would be affected. That drives the "N exhibits will change"
  // preview in the modal before the operator confirms.
  //
  // If the old value was in the property's `enum`, it's rewritten there
  // too (or dropped when `to` was already present, to avoid dupes).
  async renameAttributeValue(
    id: string,
    input: { attributeKey: string; from: string; to: string; dryRun?: boolean },
  ) {
    const cat = await this.findById(id);
    const { attributeKey, from, to, dryRun } = input;

    if (from === to) {
      throw new BadRequestException('`to` must differ from `from`');
    }

    // Count exhibits whose attributes[key] currently matches `from`.
    // Raw SQL because Prisma's `attributes` filter doesn't have a
    // "->>text = value" primitive.
    const rows = await this.db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM exhibits
      WHERE category_id = ${id}::uuid
        AND deleted_at IS NULL
        AND (attributes ->> ${attributeKey}) = ${from}
    `;
    const exhibitsAffected = Number(rows[0]?.count ?? 0);

    // Would the enum be rewritten? Check without actually mutating.
    const schema = (cat.schema as { properties?: Record<string, { enum?: unknown }> } | null) ?? {};
    const prop = schema.properties?.[attributeKey] ?? {};
    const enumList = Array.isArray(prop.enum) ? (prop.enum as string[]) : null;
    const enumWouldChange = !!(enumList && enumList.includes(from));

    if (dryRun) {
      return { dryRun: true, exhibitsAffected, enumRenamed: enumWouldChange };
    }

    // ── Live path ── mutate schema first (small), then cascade. Single
    // transaction so a partial failure never leaves the enum out of
    // sync with the underlying data.
    await this.db.$transaction(async (tx) => {
      if (enumWouldChange && enumList) {
        const rewritten = enumList
          .map((v) => (v === from ? to : v))
          // Dedupe in case `to` was already present alongside `from`.
          .filter((v, idx, arr) => arr.indexOf(v) === idx);
        const nextSchema: Record<string, unknown> = { ...(cat.schema as object) };
        const nextProps = { ...((nextSchema.properties as Record<string, unknown>) ?? {}) };
        nextProps[attributeKey] = { ...(prop as object), enum: rewritten };
        nextSchema.properties = nextProps;
        await tx.category.update({
          where: { id },
          data: { schema: nextSchema as Prisma.InputJsonValue },
        });
      }
      if (exhibitsAffected > 0) {
        await tx.$executeRaw`
          UPDATE exhibits
          SET attributes = jsonb_set(attributes, ARRAY[${attributeKey}]::text[], to_jsonb(${to}::text)),
              updated_at = NOW()
          WHERE category_id = ${id}::uuid
            AND deleted_at IS NULL
            AND (attributes ->> ${attributeKey}) = ${from}
        `;
      }
    });

    return { dryRun: false, exhibitsAffected, enumRenamed: enumWouldChange };
  }
}
