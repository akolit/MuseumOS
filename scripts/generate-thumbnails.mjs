// Generate 320px WebP thumbnails for every exhibit_images row.
//
// Idempotent — skips files that already exist on disk. Safe to re-run any time
// (after bulk imports, periodic safety sweep, etc.).
//
// Outputs to: img/thumbs/<size>/<storage_key>.webp
//
// Usage:
//   node scripts/generate-thumbnails.mjs           # 320px only, skip existing
//   node scripts/generate-thumbnails.mjs --force   # regenerate even if exists
//   node scripts/generate-thumbnails.mjs --size=480 --size=320

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://museumos:museumos@localhost:5432/museumos?schema=public';
const IMG_ROOT = '/Users/akolit/Sites/MuseumOS/img';

const args = process.argv.slice(2);
const force = args.includes('--force');
const sizes = args
  .filter(a => a.startsWith('--size='))
  .map(a => parseInt(a.slice('--size='.length)));
if (sizes.length === 0) sizes.push(320);

function thumbAbs(storageKey, size) {
  return path.join(IMG_ROOT, 'thumbs', String(size), `${storageKey}.webp`);
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query('SELECT storage_key FROM exhibit_images');
  await pool.end();

  console.log(`Rows: ${rows.length} • Sizes: ${sizes.join(', ')} • Force: ${force}`);
  console.log(`Output root: ${path.join(IMG_ROOT, 'thumbs')}`);

  let generated = 0;
  let skipped = 0;
  let missingSource = 0;
  let errors = 0;

  const t0 = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const { storage_key: storageKey } = rows[i];
    const srcAbs = path.join(IMG_ROOT, storageKey);

    if (!fs.existsSync(srcAbs)) {
      missingSource++;
      continue;
    }

    for (const size of sizes) {
      const outAbs = thumbAbs(storageKey, size);
      if (!force && fs.existsSync(outAbs)) {
        skipped++;
        continue;
      }
      try {
        await fs.promises.mkdir(path.dirname(outAbs), { recursive: true });
        await sharp(srcAbs)
          .rotate() // honor EXIF orientation — phone photos come out sideways without this
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(outAbs);
        generated++;
      } catch (e) {
        errors++;
        if (errors < 10) console.error(`  ✗ ${storageKey} @ ${size}: ${e.message}`);
      }
    }

    if ((i + 1) % 500 === 0) {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${rows.length} processed (gen=${generated}, skip=${skipped}, miss=${missingSource}, err=${errors}) — ${sec}s`);
    }
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════`);
  console.log(`Generated:        ${generated}`);
  console.log(`Skipped (exists): ${skipped}`);
  console.log(`Missing source:   ${missingSource}`);
  console.log(`Errors:           ${errors}`);
  console.log(`Total time:       ${sec}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
