import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { DatabaseService } from '../database';
import { generateAllSizes, THUMB_SIZES, thumbAbsPath } from './thumbnails';

const UPLOAD_DIR = path.resolve(__dirname, '../../../../img');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

// Fields safe to return to the client. Deliberately omits `bytes` (a Prisma
// BigInt), which the default JSON serializer cannot stringify — returning a
// full row would throw and surface as a 500.
const IMAGE_RETURN_SELECT = {
  id: true,
  exhibitId: true,
  storageKey: true,
  originalFilename: true,
  mimeType: true,
  width: true,
  height: true,
  isPrimary: true,
  position: true,
  caption: true,
  revision: true,
  uploadedAt: true,
} as const;

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ExhibitImagesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private async assertExhibit(exhibitId: string) {
    const ex = await this.db.exhibit.findFirst({
      where: { id: exhibitId, deletedAt: null },
      select: { id: true, displayId: true },
    });
    if (!ex) throw new NotFoundException('Exhibit not found');
    return ex;
  }

  async uploadMany(exhibitId: string, files: UploadedFile[], actorId: string | null) {
    const exhibit = await this.assertExhibit(exhibitId);
    if (!files?.length) throw new BadRequestException('No files uploaded');

    // New uploads are named <ExhibitCode>_<n> (e.g. PC00544_1.jpg).
    const safeId = exhibit.displayId.replace(/[^A-Za-z0-9._-]/g, '_');

    // Compute starting position from existing images.
    const existing = await this.db.exhibitImage.findMany({
      where: { exhibitId },
      select: { id: true, position: true, isPrimary: true },
      orderBy: { position: 'asc' },
    });
    let nextPosition = existing.length;
    let nextNum = existing.length; // running counter for the <code>_<n> filename
    const hasPrimary = existing.some((e) => e.isPrimary);

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const created: { id: string; storageKey: string }[] = [];
    let isFirstNew = !hasPrimary;

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new BadRequestException(
          `${file.originalname} exceeds the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        );
      }
      if (!ALLOWED_MIME.has(file.mimetype)) {
        throw new BadRequestException(
          `${file.originalname}: unsupported type ${file.mimetype}. Allowed: JPEG, PNG, WebP.`,
        );
      }

      const ext = file.mimetype === 'image/png' ? '.png'
        : file.mimetype === 'image/webp' ? '.webp'
        : '.jpg';
      // <ExhibitCode>_<n>, continuing after existing images. Bump past any
      // on-disk collision so we never overwrite (covers deletions and the rare
      // duplicate display_id).
      nextNum += 1;
      let storageKey = `${safeId}_${nextNum}${ext}`;
      while (existsSync(path.join(UPLOAD_DIR, storageKey))) {
        nextNum += 1;
        storageKey = `${safeId}_${nextNum}${ext}`;
      }
      const fullPath = path.join(UPLOAD_DIR, storageKey);
      await fs.writeFile(fullPath, file.buffer);
      await generateAllSizes(storageKey);

      const row = await this.db.exhibitImage.create({
        data: {
          exhibitId,
          storageKey,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          bytes: BigInt(file.size),
          isPrimary: isFirstNew,
          position: nextPosition++,
          uploadedById: actorId ?? undefined,
        },
        select: { id: true, storageKey: true },
      });
      created.push(row);
      isFirstNew = false;
    }

    return { created: created.length, images: created };
  }

  async update(
    exhibitId: string,
    imageId: string,
    patch: { isPrimary?: boolean; caption?: string | null },
  ) {
    const img = await this.db.exhibitImage.findFirst({
      where: { id: imageId, exhibitId },
    });
    if (!img) throw new NotFoundException('Image not found');

    if (patch.isPrimary === true) {
      // Unset previous primary, set this one.
      await this.db.$transaction([
        this.db.exhibitImage.updateMany({
          where: { exhibitId, isPrimary: true },
          data: { isPrimary: false },
        }),
        this.db.exhibitImage.update({
          where: { id: imageId },
          data: { isPrimary: true },
        }),
      ]);
    } else if (patch.isPrimary === false) {
      await this.db.exhibitImage.update({
        where: { id: imageId },
        data: { isPrimary: false },
      });
    }

    if (patch.caption !== undefined) {
      await this.db.exhibitImage.update({
        where: { id: imageId },
        data: { caption: patch.caption },
      });
    }

    return this.db.exhibitImage.findUnique({
      where: { id: imageId },
      select: IMAGE_RETURN_SELECT,
    });
  }

  async reorder(exhibitId: string, orderedIds: string[]) {
    await this.assertExhibit(exhibitId);
    const existing = await this.db.exhibitImage.findMany({
      where: { exhibitId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Image ${id} does not belong to this exhibit`);
      }
    }
    if (orderedIds.length !== existing.length) {
      throw new BadRequestException(
        `Reorder list must include all ${existing.length} image(s); received ${orderedIds.length}.`,
      );
    }

    await this.db.$transaction(
      orderedIds.map((id, idx) =>
        this.db.exhibitImage.update({ where: { id }, data: { position: idx } }),
      ),
    );

    return { reordered: orderedIds.length };
  }

  // Rotates the original file in-place by 90° clockwise or counter-clockwise,
  // re-generates all thumbnail sizes, and bumps the image's revision counter
  // so cached browser copies miss and re-fetch the new orientation.
  async rotate(exhibitId: string, imageId: string, direction: 'cw' | 'ccw') {
    const img = await this.db.exhibitImage.findFirst({
      where: { id: imageId, exhibitId },
    });
    if (!img) throw new NotFoundException('Image not found');

    const absPath = path.join(UPLOAD_DIR, img.storageKey);
    try {
      const buffer = await fs.readFile(absPath);
      const angle = direction === 'cw' ? 90 : -90;
      // Apply EXIF orientation first so we work in the visual frame the
      // user sees, then rotate by the requested angle and strip EXIF so
      // future tools (including our thumb generator) don't double-rotate.
      const rotated = await sharp(buffer).rotate().rotate(angle).withMetadata({ orientation: undefined }).toBuffer();
      await fs.writeFile(absPath, rotated);
    } catch (e) {
      throw new BadRequestException(`Rotation failed: ${(e as Error).message}`);
    }

    // Force-regenerate all thumbnail sizes from the rotated original.
    await generateAllSizes(img.storageKey, { overwrite: true });

    const updated = await this.db.exhibitImage.update({
      where: { id: imageId },
      data: { revision: { increment: 1 } },
      select: IMAGE_RETURN_SELECT,
    });
    return updated;
  }

  async delete(exhibitId: string, imageId: string) {
    const img = await this.db.exhibitImage.findFirst({
      where: { id: imageId, exhibitId },
    });
    if (!img) throw new NotFoundException('Image not found');

    await this.db.exhibitImage.delete({ where: { id: imageId } });

    // Best-effort delete on disk; only delete files we wrote (prefix "up_").
    if (img.storageKey.startsWith('up_')) {
      const fullPath = path.join(UPLOAD_DIR, img.storageKey);
      await fs.unlink(fullPath).catch(() => undefined);
    }
    // Always remove thumbnails for any storage_key (cheap, safe to attempt).
    for (const size of THUMB_SIZES) {
      await fs.unlink(thumbAbsPath(img.storageKey, size)).catch(() => undefined);
    }

    // If we removed the primary, promote the first remaining (by position).
    if (img.isPrimary) {
      const next = await this.db.exhibitImage.findFirst({
        where: { exhibitId },
        orderBy: { position: 'asc' },
      });
      if (next) {
        await this.db.exhibitImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { deleted: true };
  }
}
