import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import type { UpsertPlacementInput } from '@museumos/contracts';

const UPLOAD_DIR = path.resolve(__dirname, '../../../../img');
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

@Injectable()
export class FloorPlansService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll() {
    const plans = await this.db.floorPlan.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { placements: true } } },
    });
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      svgStorageKey: p.svgStorageKey,
      imageUrl: `/img/${p.svgStorageKey}`,
      calibrationJson: p.calibrationJson,
      placementCount: p._count.placements,
    }));
  }

  async findById(id: string) {
    const plan = await this.db.floorPlan.findUnique({
      where: { id },
      include: {
        placements: {
          include: {
            exhibit: {
              select: {
                id: true,
                displayId: true,
                exhibitName: true,
                manufacturer: true,
                year: true,
                categoryId: true,
                category: { select: { code: true, nameEn: true, nameEl: true } },
                images: {
                  select: { storageKey: true },
                  orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Floor plan not found');

    return {
      id: plan.id,
      name: plan.name,
      svgStorageKey: plan.svgStorageKey,
      imageUrl: `/img/${plan.svgStorageKey}`,
      calibrationJson: plan.calibrationJson,
      placements: plan.placements.map((p) => ({
        id: p.id,
        exhibitId: p.exhibitId,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        scale: p.scale,
        exhibit: {
          ...p.exhibit,
          primaryImageUrl: p.exhibit.images[0]
            ? `/img/${p.exhibit.images[0].storageKey}`
            : null,
          images: undefined,
        },
      })),
    };
  }

  async create(name: string) {
    return this.db.floorPlan.create({
      data: { name, svgStorageKey: '' },
    });
  }

  async update(id: string, data: { name?: string; calibrationJson?: Record<string, unknown> | null }) {
    await this.assertExists(id);
    const prismaData: Prisma.FloorPlanUpdateInput = {};
    if (data.name !== undefined) prismaData.name = data.name;
    if (data.calibrationJson !== undefined) {
      prismaData.calibrationJson = data.calibrationJson === null
        ? Prisma.JsonNull
        : data.calibrationJson as Prisma.InputJsonValue;
    }
    return this.db.floorPlan.update({ where: { id }, data: prismaData });
  }

  async delete(id: string) {
    const plan = await this.assertExists(id);
    await this.db.floorPlan.delete({ where: { id } });
    if (plan.svgStorageKey) {
      const fullPath = path.join(UPLOAD_DIR, plan.svgStorageKey);
      await fs.unlink(fullPath).catch(() => undefined);
    }
  }

  async uploadImage(
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    await this.assertExists(id);

    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported image type ${file.mimetype}. Allowed: PNG, JPEG, WebP, SVG.`,
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Floor plan image must be under 10 MB.');
    }

    const ext = file.mimetype === 'image/svg+xml' ? '.svg'
      : file.mimetype === 'image/png' ? '.png'
      : file.mimetype === 'image/webp' ? '.webp'
      : '.jpg';
    const storageKey = `fp_${randomUUID()}${ext}`;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, storageKey), file.buffer);

    const updated = await this.db.floorPlan.update({
      where: { id },
      data: { svgStorageKey: storageKey },
    });

    return {
      id: updated.id,
      svgStorageKey: storageKey,
      imageUrl: `/img/${storageKey}`,
    };
  }

  // ── Placements ─────────────────────────────────────────────

  async upsertPlacement(floorPlanId: string, input: UpsertPlacementInput) {
    await this.assertExists(floorPlanId);
    return this.db.exhibitPlacement.upsert({
      where: {
        exhibitId_floorPlanId: {
          exhibitId: input.exhibitId,
          floorPlanId,
        },
      },
      create: {
        floorPlanId,
        exhibitId: input.exhibitId,
        x: input.x,
        y: input.y,
        rotation: input.rotation ?? 0,
        scale: input.scale ?? 1,
      },
      update: {
        x: input.x,
        y: input.y,
        rotation: input.rotation ?? 0,
        scale: input.scale ?? 1,
      },
    });
  }

  async bulkUpsertPlacements(floorPlanId: string, placements: UpsertPlacementInput[]) {
    await this.assertExists(floorPlanId);
    const results = await this.db.$transaction(
      placements.map((p) =>
        this.db.exhibitPlacement.upsert({
          where: {
            exhibitId_floorPlanId: {
              exhibitId: p.exhibitId,
              floorPlanId,
            },
          },
          create: {
            floorPlanId,
            exhibitId: p.exhibitId,
            x: p.x,
            y: p.y,
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1,
          },
          update: {
            x: p.x,
            y: p.y,
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1,
          },
        }),
      ),
    );
    return { upserted: results.length };
  }

  async removePlacement(floorPlanId: string, exhibitId: string) {
    const placement = await this.db.exhibitPlacement.findUnique({
      where: { exhibitId_floorPlanId: { exhibitId, floorPlanId } },
    });
    if (!placement) throw new NotFoundException('Placement not found');
    await this.db.exhibitPlacement.delete({ where: { id: placement.id } });
  }

  private async assertExists(id: string) {
    const plan = await this.db.floorPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Floor plan not found');
    return plan;
  }
}
