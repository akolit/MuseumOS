#!/usr/bin/env node
// Generate preview thumbnails for donor_files rows:
//   - images -> sharp (rotate + resize)
//   - PDFs   -> pdftoppm renders page 1, then sharp resizes to webp
// Output: img/thumbs/<size>/<storage_key>.webp  (same scheme as exhibit images)
//
// Idempotent — skips sizes that already exist. Safe to re-run after an import.
// Needs poppler's `pdftoppm` on PATH for the PDF previews.
//
// Usage:
//   node scripts/generate-donor-file-thumbs.mjs            # missing only
//   node scripts/generate-donor-file-thumbs.mjs --force    # regenerate all
//   DATABASE_URL=... node scripts/generate-donor-file-thumbs.mjs

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { argv, env } from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_ROOT = path.join(REPO_ROOT, 'img');
const DATABASE_URL =
  env.DATABASE_URL || 'postgresql://museumos:museumos@localhost:5432/museumos?schema=public';
const THUMB_SIZES = [320, 640, 1024];
const force = argv.includes('--force');

const thumbAbs = (key, size) => path.join(IMG_ROOT, 'thumbs', String(size), `${key}.webp`);

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows } = await pool.query('SELECT storage_key, mime_type FROM donor_files ORDER BY storage_key');
await pool.end();

console.error(`donor_files rows: ${rows.length} • force: ${force}`);
let img = 0, pdf = 0, skipped = 0, failed = 0;

for (const { storage_key: key, mime_type: mime } of rows) {
  const src = path.join(IMG_ROOT, key);
  if (!existsSync(src)) { failed++; console.error(`  missing source: ${key}`); continue; }
  if (!force && THUMB_SIZES.every((s) => existsSync(thumbAbs(key, s)))) { skipped++; continue; }
  try {
    if (mime === 'application/pdf') { await pdfThumbs(src, key); pdf++; }
    else if (mime?.startsWith('image/')) { await imgThumbs(src, key); img++; }
    else skipped++;
  } catch (e) { failed++; console.error(`  fail ${key}: ${e.message}`); }
  if ((img + pdf) % 50 === 0 && (img + pdf) > 0) console.error(`  …${img + pdf} done`);
}

console.error(`\nimages: ${img} • pdfs: ${pdf} • skipped: ${skipped} • failed: ${failed}`);

async function imgThumbs(src, key) {
  for (const s of THUMB_SIZES) {
    const out = thumbAbs(key, s);
    if (!force && existsSync(out)) continue;
    mkdirSync(path.dirname(out), { recursive: true });
    await sharp(src).rotate().resize(s, s, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(out);
  }
}

async function pdfThumbs(src, key) {
  const prefix = path.join(os.tmpdir(), `dft_${process.pid}_${Date.now()}`);
  const png = `${prefix}.png`;
  await execFileAsync('pdftoppm', ['-png', '-singlefile', '-r', '150', '-f', '1', '-l', '1', src, prefix]);
  if (!existsSync(png)) throw new Error('pdftoppm produced no output');
  try {
    for (const s of THUMB_SIZES) {
      const out = thumbAbs(key, s);
      if (!force && existsSync(out)) continue;
      mkdirSync(path.dirname(out), { recursive: true });
      await sharp(png).resize(s, s, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(out);
    }
  } finally {
    try { unlinkSync(png); } catch { /* ignore */ }
  }
}
