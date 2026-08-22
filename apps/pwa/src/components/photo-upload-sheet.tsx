import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, X, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage, type CompressedFile } from '@/lib/compress-image';

interface Props {
  open: boolean;
  exhibitId: string;
  onClose: () => void;
  onUploaded: () => void;
}

interface Selected {
  id: string;
  preview: string;
  compressing: boolean;
  result?: CompressedFile;
  error?: string;
}

export function PhotoUploadSheet({ open, exhibitId, onClose, onUploaded }: Props) {
  const { t } = useTranslation();
  const inputCameraRef = useRef<HTMLInputElement | null>(null);
  const inputLibraryRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Selected[]>([]);
  const [uploading, setUploading] = useState(false);

  // Revoke object URLs when the sheet closes or items change.
  useEffect(() => () => { items.forEach((i) => URL.revokeObjectURL(i.preview)); }, [items]);
  useEffect(() => {
    if (!open) setItems([]);
  }, [open]);

  function pick(via: 'camera' | 'library') {
    const ref = via === 'camera' ? inputCameraRef : inputLibraryRef;
    ref.current?.click();
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const newItems: Selected[] = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
      compressing: true,
    }));
    setItems((prev) => [...prev, ...newItems]);

    // Compress each in parallel and update state per-result.
    await Promise.all(
      Array.from(fileList).map(async (f, idx) => {
        const itemId = newItems[idx]!.id;
        try {
          const result = await compressImage(f);
          setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, compressing: false, result } : it));
        } catch (err) {
          setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, compressing: false, error: (err as Error).message } : it));
        }
      }),
    );
  }

  function remove(id: string) {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function upload() {
    const ready = items.filter((i) => i.result && !i.error);
    if (ready.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const it of ready) fd.append('files', it.result!.file);
      const res = await fetch(`/api/exhibits/${exhibitId}/images`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Upload failed (${res.status})`);
      }
      toast.success(t('pwa.upload.uploaded', { count: ready.length }));
      onUploaded();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  const readyCount = items.filter((i) => i.result && !i.error).length;
  const compressingCount = items.filter((i) => i.compressing).length;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-auto" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-t-2xl bg-card pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl">
          {/* Drag handle */}
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />

          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="text-base font-semibold">{t('pwa.upload.title')}</h2>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-2">
              <button
                onClick={() => pick('camera')}
                className="flex flex-col items-center gap-2 rounded-xl border border-input bg-background py-6 active:bg-muted"
              >
                <Camera className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{t('pwa.upload.takePhoto')}</span>
              </button>
              <button
                onClick={() => pick('library')}
                className="flex flex-col items-center gap-2 rounded-xl border border-input bg-background py-6 active:bg-muted"
              >
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{t('pwa.upload.fromLibrary')}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 px-4 pt-4">
                {items.map((it) => (
                  <div key={it.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                    <img src={it.preview} alt="" className="h-full w-full object-cover" />
                    {it.compressing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    {it.error && (
                      <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 p-1 text-center text-[10px] text-white">
                        {it.error}
                      </div>
                    )}
                    <button
                      onClick={() => remove(it.id)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => pick('library')}
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-input text-2xl text-muted-foreground active:bg-muted"
                >
                  +
                </button>
              </div>

              <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
                {compressingCount > 0
                  ? t('pwa.upload.compressing', { count: compressingCount })
                  : t('pwa.upload.readyToUpload', { count: readyCount })}
              </div>

              <div className="px-4 pt-3">
                <button
                  onClick={upload}
                  disabled={readyCount === 0 || compressingCount > 0 || uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground active:bg-primary/90 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t('pwa.upload.upload')}
                </button>
              </div>
            </>
          )}

          {/* Hidden file inputs — one for camera, one for library, so we control
              the iOS behavior precisely per button rather than letting iOS show
              its combined chooser. */}
          <input
            ref={inputCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={inputLibraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>
    </div>
  );
}
