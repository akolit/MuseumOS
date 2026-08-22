// Thumbnail generation — single source of truth used by both the upload
// service and the bulk regeneration script in scripts/generate-thumbnails.mjs.
//
// Layout (under img/, which is a symlink to images/):
//   img/Sites/10001/foo.jpg              ← original
//   img/thumbs/320/Sites/10001/foo.jpg.webp ← thumbnail
//
// 320px is currently the only size in use (grid view). Add more sizes by
// pushing new entries into THUMB_SIZES; the generator will keep them in sync.

import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

// 320  — tiny avatar for list rows + PWA inventory rows (low bandwidth)
// 640  — grid-tile thumbnail for the web admin's larger grid zoom levels
// 1024 — medium for mobile detail pages (sharp on phones, ~10× smaller than the
//        original 4-8 MB phone photo so detail-page swipes feel instant)
export const THUMB_SIZES = [320, 640, 1024] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

// Bump this whenever the thumbnail encoder/transform changes in a way
// that requires browsers to re-download already-cached thumbnails (e.g.
// EXIF rotation fix, encoder upgrade, size change). Appended as ?v=N
// to every thumbnail URL — purely cache-busting, doesn't change disk paths.
export const THUMB_CACHE_VERSION = 4;

// Originals live here; thumbs live in img/thumbs/<size>/<key>.webp
export const IMG_ROOT = path.resolve(__dirname, '../../../../img');

export function thumbRelPath(storageKey: string, size: ThumbSize): string {
  return path.join('thumbs', String(size), `${storageKey}.webp`);
}

export function thumbAbsPath(storageKey: string, size: ThumbSize): string {
  return path.join(IMG_ROOT, thumbRelPath(storageKey, size));
}

export function thumbUrl(storageKey: string, size: ThumbSize, revision = 0): string {
  // `v` is the global encoder version (bump when transform changes for all images).
  // `r` is the per-image revision (bumped on in-place rotation) — omitted when 0
  // so unmodified images keep their stable URL and the cache stays warm.
  const suffix = revision > 0 ? `&r=${revision}` : '';
  return `/img/${thumbRelPath(storageKey, size)}?v=${THUMB_CACHE_VERSION}${suffix}`;
}

/** URL for the full-resolution original image, with the same per-image cache busting. */
export function originalUrl(storageKey: string, revision = 0): string {
  const suffix = revision > 0 ? `?r=${revision}` : '';
  return `/img/${storageKey}${suffix}`;
}

// Generate one thumbnail file. Skips if it already exists (idempotent).
// Returns true if a file was written, false if it was skipped or the
// source was missing.
export async function generateThumbnail(
  storageKey: string,
  size: ThumbSize = 320,
  opts: { overwrite?: boolean } = {},
): Promise<boolean> {
  const srcAbs = path.join(IMG_ROOT, storageKey);
  if (!existsSync(srcAbs)) return false;

  const outAbs = thumbAbsPath(storageKey, size);
  if (!opts.overwrite && existsSync(outAbs)) return false;

  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await sharp(srcAbs)
    .rotate() // honor EXIF orientation — without this, phone photos come out sideways
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(outAbs);
  return true;
}

// Convenience: generate all configured sizes for one storage key.
export async function generateAllSizes(
  storageKey: string,
  opts: { overwrite?: boolean } = {},
): Promise<number> {
  let written = 0;
  for (const size of THUMB_SIZES) {
    if (await generateThumbnail(storageKey, size, opts)) written++;
  }
  return written;
}

// Render a PDF's first page to webp thumbnails (poppler's pdftoppm → sharp), so
// documents like scanned donation forms get a real preview in the grid. Returns
// the number of sizes written; 0 if pdftoppm is unavailable or the render fails
// (callers fall back to a document icon). The thumbnail key keeps the ".pdf"
// suffix, so thumbUrl()/thumbAbsPath() resolve it the same as any other file.
export async function generatePdfThumbnails(
  storageKey: string,
  opts: { overwrite?: boolean } = {},
): Promise<number> {
  const srcAbs = path.join(IMG_ROOT, storageKey);
  if (!existsSync(srcAbs)) return 0;

  // pdftoppm appends ".png" to this prefix for a single page.
  const prefix = path.join(os.tmpdir(), `pdfthumb_${process.pid}_${Date.now()}`);
  const pngPath = `${prefix}.png`;
  try {
    await execFileAsync('pdftoppm', [
      '-png', '-singlefile', '-r', '150', '-f', '1', '-l', '1', srcAbs, prefix,
    ]);
  } catch {
    return 0; // pdftoppm missing or render failed — caller shows the icon
  }
  if (!existsSync(pngPath)) return 0;

  let written = 0;
  try {
    for (const size of THUMB_SIZES) {
      const outAbs = thumbAbsPath(storageKey, size);
      if (!opts.overwrite && existsSync(outAbs)) continue;
      await fs.mkdir(path.dirname(outAbs), { recursive: true });
      await sharp(pngPath)
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(outAbs);
      written++;
    }
  } finally {
    await fs.unlink(pngPath).catch(() => undefined);
  }
  return written;
}
