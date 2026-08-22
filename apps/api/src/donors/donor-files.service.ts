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
import {
  generateAllSizes,
  generatePdfThumbnails,
  THUMB_SIZES,
  thumbAbsPath,
  thumbUrl,
  originalUrl,
} from '../exhibits/thumbnails';

const UPLOAD_DIR = path.resolve(__dirname, '../../../../img');
// Scanned donation forms are usually photos/scans; we also accept PDFs.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function isImage(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith('image/');
}

@Injectable()
export class DonorFilesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async assertDonor(donorId: string) {
    const donor = await this.db.donor.findUnique({
      where: { id: donorId },
      select: { id: true },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    return donor;
  }

  // Shapes a DB row into the response the web app expects: absolute-ish URLs
  // for the original and (for images) the 320px thumbnail.
  private present(row: {
    id: string;
    donorId: string;
    storageKey: string;
    originalFilename: string | null;
    mimeType: string | null;
    bytes: bigint | null;
    caption: string | null;
    position: number;
    revision: number;
    uploadedAt: Date;
    uploadedBy?: { id: string; displayName: string } | null;
  }) {
    const image = isImage(row.mimeType);
    // A thumbnail exists for images and (via pdftoppm) PDFs; fall back to the
    // document icon when there's no rendered preview on disk.
    const hasThumb = existsSync(thumbAbsPath(row.storageKey, 320));
    return {
      id: row.id,
      donorId: row.donorId,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      bytes: row.bytes != null ? Number(row.bytes) : null,
      caption: row.caption,
      position: row.position,
      isImage: image,
      url: originalUrl(row.storageKey, row.revision),
      thumbUrl: hasThumb ? thumbUrl(row.storageKey, 320, row.revision) : null,
      uploadedAt: row.uploadedAt.toISOString(),
      uploadedBy: row.uploadedBy ?? null,
    };
  }

  async list(donorId: string) {
    await this.assertDonor(donorId);
    const rows = await this.db.donorFile.findMany({
      where: { donorId },
      orderBy: [{ position: 'asc' }, { uploadedAt: 'asc' }],
      include: { uploadedBy: { select: { id: true, displayName: true } } },
    });
    return rows.map((r) => this.present(r));
  }

  async uploadMany(donorId: string, files: UploadedFile[], actorId: string | null) {
    await this.assertDonor(donorId);
    if (!files?.length) throw new BadRequestException('No files uploaded');

    const existing = await this.db.donorFile.findMany({
      where: { donorId },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
    });
    let nextPosition = existing.length;
    let nextNum = existing.length;

    const dir = path.join(UPLOAD_DIR, 'donor-files', donorId);
    await fs.mkdir(dir, { recursive: true });

    const created: ReturnType<DonorFilesService['present']>[] = [];

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new BadRequestException(
          `${file.originalname} exceeds the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        );
      }
      if (!ALLOWED_MIME.has(file.mimetype)) {
        throw new BadRequestException(
          `${file.originalname}: unsupported type ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF.`,
        );
      }

      const ext = EXT_BY_MIME[file.mimetype] ?? '.bin';
      // donor-files/<donorId>/<n>.<ext>, bumping past any on-disk collision.
      nextNum += 1;
      let rel = path.join('donor-files', donorId, `${nextNum}${ext}`);
      while (existsSync(path.join(UPLOAD_DIR, rel))) {
        nextNum += 1;
        rel = path.join('donor-files', donorId, `${nextNum}${ext}`);
      }
      await fs.writeFile(path.join(UPLOAD_DIR, rel), file.buffer);
      // Generate a preview thumbnail: sharp for images, pdftoppm for PDFs.
      if (isImage(file.mimetype)) await generateAllSizes(rel);
      else if (file.mimetype === 'application/pdf') await generatePdfThumbnails(rel);

      const row = await this.db.donorFile.create({
        data: {
          donorId,
          storageKey: rel,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          bytes: BigInt(file.size),
          position: nextPosition++,
          uploadedById: actorId ?? undefined,
        },
        include: { uploadedBy: { select: { id: true, displayName: true } } },
      });
      created.push(this.present(row));
    }

    return { created: created.length, files: created };
  }

  async update(donorId: string, fileId: string, patch: { caption?: string | null }) {
    const file = await this.db.donorFile.findFirst({ where: { id: fileId, donorId } });
    if (!file) throw new NotFoundException('File not found');

    if (patch.caption !== undefined) {
      await this.db.donorFile.update({
        where: { id: fileId },
        data: { caption: patch.caption },
      });
    }

    const row = await this.db.donorFile.findUnique({
      where: { id: fileId },
      include: { uploadedBy: { select: { id: true, displayName: true } } },
    });
    return this.present(row!);
  }

  // Rotates an image file in place 90° and re-generates thumbnails. Images only.
  async rotate(donorId: string, fileId: string, direction: 'cw' | 'ccw') {
    const file = await this.db.donorFile.findFirst({ where: { id: fileId, donorId } });
    if (!file) throw new NotFoundException('File not found');
    if (!isImage(file.mimeType)) {
      throw new BadRequestException('Only image files can be rotated');
    }

    const absPath = path.join(UPLOAD_DIR, file.storageKey);
    try {
      const buffer = await fs.readFile(absPath);
      const angle = direction === 'cw' ? 90 : -90;
      const rotated = await sharp(buffer)
        .rotate()
        .rotate(angle)
        .withMetadata({ orientation: undefined })
        .toBuffer();
      await fs.writeFile(absPath, rotated);
    } catch (e) {
      throw new BadRequestException(`Rotation failed: ${(e as Error).message}`);
    }
    await generateAllSizes(file.storageKey, { overwrite: true });

    const row = await this.db.donorFile.update({
      where: { id: fileId },
      data: { revision: { increment: 1 } },
      include: { uploadedBy: { select: { id: true, displayName: true } } },
    });
    return this.present(row);
  }

  async delete(donorId: string, fileId: string) {
    const file = await this.db.donorFile.findFirst({ where: { id: fileId, donorId } });
    if (!file) throw new NotFoundException('File not found');

    await this.db.donorFile.delete({ where: { id: fileId } });

    // We always own the bytes under donor-files/, so remove them + any thumbs.
    if (file.storageKey.startsWith('donor-files/')) {
      await fs.unlink(path.join(UPLOAD_DIR, file.storageKey)).catch(() => undefined);
    }
    for (const size of THUMB_SIZES) {
      await fs.unlink(thumbAbsPath(file.storageKey, size)).catch(() => undefined);
    }

    return { deleted: true };
  }
}
