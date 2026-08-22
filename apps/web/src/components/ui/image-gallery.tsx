import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Grid2x2, Image, X } from 'lucide-react';

interface ImageGalleryProps {
  // url        = original (multi-MB; used only for the lightbox/zoom)
  // mediumUrl  = 1024px webp (~200-500 KB; used for hero / grid tiles)
  // thumbnailUrl = 320px webp (~30 KB; used for the thumb strip)
  // Falling back to url when mediumUrl is missing keeps older callers safe.
  images: { id: string; url: string; mediumUrl?: string; thumbnailUrl?: string; alt?: string }[];
}

type ViewMode = 'hero' | 'grid';

function Lightbox({
  images,
  index,
  onClose,
  onNav,
}: {
  images: ImageGalleryProps['images'];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && images.length > 1) {
        onNav((index - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        onNav((index + 1) % images.length);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, images.length, onClose, onNav]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav((index - 1 + images.length) % images.length);
            }}
            className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNav((index + 1) % images.length);
            }}
            className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <img
        src={images[index]!.url}
        alt={images[index]!.alt ?? ''}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 text-sm text-white/70">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

function HeroView({
  images,
  onImageClick,
}: {
  images: ImageGalleryProps['images'];
  onImageClick: (i: number) => void;
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div
        className="flex cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-muted"
        style={{ height: 400 }}
        onClick={() => onImageClick(active)}
      >
        <img
          src={images[active]!.mediumUrl ?? images[active]!.url}
          alt={images[active]!.alt ?? ''}
          className="h-full w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActive(i)}
              className={`flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                i === active ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <img
                src={img.thumbnailUrl ?? img.url}
                alt={img.alt ?? ''}
                loading="lazy"
                decoding="async"
                onError={(e) => { const el = e.currentTarget; if (el.src !== img.url) el.src = img.url; }}
                className="h-16 w-20 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GridView({
  images,
  onImageClick,
}: {
  images: ImageGalleryProps['images'];
  onImageClick: (i: number) => void;
}) {
  if (images.length === 1) {
    return (
      <div
        className="cursor-pointer overflow-hidden rounded-lg bg-muted"
        style={{ height: 400 }}
        onClick={() => onImageClick(0)}
      >
        <img
          src={images[0]!.mediumUrl ?? images[0]!.url}
          alt={images[0]!.alt ?? ''}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  const [first, ...rest] = images;

  return (
    <div className="grid grid-cols-2 gap-2" style={{ height: 400 }}>
      <div
        className="cursor-pointer overflow-hidden rounded-lg bg-muted"
        onClick={() => onImageClick(0)}
      >
        <img
          src={first!.mediumUrl ?? first!.url}
          alt={first!.alt ?? ''}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rest.slice(0, 4).map((img, i) => (
          <div
            key={img.id}
            className="relative cursor-pointer overflow-hidden rounded-lg bg-muted"
            onClick={() => onImageClick(i + 1)}
          >
            <img
              src={img.mediumUrl ?? img.url}
              alt={img.alt ?? ''}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
            {i === 3 && rest.length > 4 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
                +{rest.length - 4}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [mode, setMode] = useState<ViewMode>('grid');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex rounded-md border border-border bg-card/80 backdrop-blur-sm">
        <button
          onClick={() => setMode('hero')}
          className={`rounded-l-md p-1.5 transition-colors ${
            mode === 'hero' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          title="Gallery view"
        >
          <Image className="h-4 w-4" />
        </button>
        <button
          onClick={() => setMode('grid')}
          className={`rounded-r-md p-1.5 transition-colors ${
            mode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          title="Grid view"
        >
          <Grid2x2 className="h-4 w-4" />
        </button>
      </div>

      {mode === 'hero' ? (
        <HeroView images={images} onImageClick={setLightboxIndex} />
      ) : (
        <GridView images={images} onImageClick={setLightboxIndex} />
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={setLightboxIndex}
        />
      )}
    </div>
  );
}
