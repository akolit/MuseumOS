// Client-side image compression for upload.
//
// Phones produce 4-8 MB JPEGs which crawl over museum wifi. We resize to a
// max edge of 1600 px (sharp enough for the detail-page carousel and any
// future re-encoding) and re-encode at JPEG quality 0.82. Typical output:
// 250-600 KB per photo, ~20× smaller than the original.

export interface CompressOptions {
  maxEdge?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

export interface CompressedFile {
  file: File;
  /** original bytes before compression, for the upload summary */
  originalBytes: number;
  /** width × height of the compressed output */
  width: number;
  height: number;
}

export async function compressImage(input: File, opts: CompressOptions = {}): Promise<CompressedFile> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;
  const mimeType = opts.mimeType ?? 'image/jpeg';

  // Non-image files (or HEIC, etc. on older browsers) — pass through unchanged.
  // The API will reject anything we don't want; this client-side compressor
  // only handles common decodable formats.
  if (!input.type.startsWith('image/')) {
    return { file: input, originalBytes: input.size, width: 0, height: 0 };
  }

  const bitmap = await createBitmapWithFallback(input);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      mimeType,
      quality,
    );
  });

  const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
  const baseName = input.name.replace(/\.[^.]+$/, '') || 'photo';
  const out = new File([blob], `${baseName}${ext}`, { type: mimeType, lastModified: Date.now() });
  return { file: out, originalBytes: input.size, width: w, height: h };
}

// `createImageBitmap` is the fast path. Falls back to an <img> element for
// browsers without it or for HEIC on iOS where the bitmap call fails.
async function createBitmapWithFallback(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' tells the browser to apply EXIF rotation
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
  } finally {
    // Note: object URL must persist while drawImage uses the <img>; revoke later.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
