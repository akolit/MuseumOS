import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, Upload as UploadIcon, Loader2, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { compressImage, type CompressedFile } from '@/lib/compress-image';

interface Category { id: string; code: string; nameEn: string; nameEl: string }
interface LocationOption { id: string; code: string; nameEn: string | null; nameEl: string | null }

interface PendingPhoto {
  id: string;
  preview: string;
  compressing: boolean;
  result?: CompressedFile;
  error?: string;
}

export function AddPage() {
  const { t, i18n } = useTranslation();
  const isEl = i18n.language.startsWith('el');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [exhibitName, setExhibitName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  // Defaults to today; operator can backfill an earlier acquisition date.
  const [acquiredAt, setAcquiredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationOption[]>('/locations'),
    staleTime: 5 * 60_000,
  });

  // Clean up object URLs when the component unmounts.
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const newItems: PendingPhoto[] = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
      compressing: true,
    }));
    setPhotos((prev) => [...prev, ...newItems]);
    await Promise.all(
      Array.from(fileList).map(async (f, idx) => {
        const itemId = newItems[idx]!.id;
        try {
          const result = await compressImage(f);
          setPhotos((prev) => prev.map((it) => it.id === itemId ? { ...it, compressing: false, result } : it));
        } catch (err) {
          setPhotos((prev) => prev.map((it) => it.id === itemId ? { ...it, compressing: false, error: (err as Error).message } : it));
        }
      }),
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  function resetForm() {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setExhibitName('');
    setCategoryId('');
    setLocationId('');
    setAcquiredAt(new Date().toISOString().slice(0, 10));
  }

  const compressingCount = photos.filter((p) => p.compressing).length;
  const readyPhotos = photos.filter((p) => p.result && !p.error);
  const nameValid = exhibitName.trim().length > 0;
  const canSave =
    nameValid &&
    categoryId !== '' &&
    compressingCount === 0 &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      // 1. Create the exhibit shell.
      const created = await api.post<{ id: string; displayId: string }>('/exhibits', {
        categoryId,
        exhibitName: exhibitName.trim(),
        ...(locationId ? { locationId } : {}),
        ...(acquiredAt ? { acquiredAt: new Date(acquiredAt + 'T00:00:00Z').toISOString() } : {}),
      });

      // 2. If we have any photos, upload them in one multipart request.
      if (readyPhotos.length > 0) {
        const fd = new FormData();
        for (const it of readyPhotos) fd.append('files', it.result!.file);
        const res = await fetch(`/api/exhibits/${created.id}/images`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `Photo upload failed (${res.status})`);
        }
      }

      toast.success(t('pwa.add.created', { displayId: created.displayId }));
      qc.invalidateQueries({ queryKey: ['inventory'] });
      resetForm();
      navigate(`/exhibit/${created.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col pb-24">
      <header className="border-b border-border bg-card/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <h1 className="font-display text-xl font-bold">{t('pwa.add.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('pwa.add.hint')}</p>
      </header>

      <div className="space-y-6 px-4 py-4">
        {/* Photos */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('pwa.add.photosSection')}
          </h2>
          {photos.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border border-input bg-card py-6 active:bg-muted"
              >
                <Camera className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{t('pwa.upload.takePhoto')}</span>
              </button>
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border border-input bg-card py-6 active:bg-muted"
              >
                <UploadIcon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{t('pwa.upload.fromLibrary')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, idx) => (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                  {p.compressing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  {p.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 p-1 text-center text-[10px] text-white">
                      {p.error}
                    </div>
                  )}
                  {idx === 0 && !p.compressing && !p.error && (
                    <span className="absolute left-1 top-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      {t('pwa.add.primary')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-input text-2xl text-muted-foreground active:bg-muted"
              >
                +
              </button>
            </div>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </section>

        {/* Category */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('pwa.add.categorySection')} <span className="text-destructive">*</span>
          </h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  c.id === categoryId
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card hover:bg-muted'
                }`}
              >
                {isEl ? c.nameEl : c.nameEn}
              </button>
            ))}
          </div>
        </section>

        {/* Name */}
        <section>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('pwa.add.nameSection')} <span className="text-destructive">*</span>
            </span>
            <input
              value={exhibitName}
              onChange={(e) => setExhibitName(e.target.value)}
              placeholder={t('pwa.add.namePlaceholder') as string}
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
        </section>

        {/* Location (optional) */}
        <section>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('exhibit.location')}
            </span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-base focus:border-primary focus:outline-none"
            >
              <option value="">—</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}{l.nameEn ? ` — ${l.nameEn}` : ''}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Acquisition date — pre-filled with today, editable for backfill */}
        <section>
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('exhibit.acquiredAt')}
            </span>
            <input
              type="date"
              value={acquiredAt}
              onChange={(e) => setAcquiredAt(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-base focus:border-primary focus:outline-none"
            />
          </label>
        </section>
      </div>

      {/* Sticky save bar — sits above the tab bar */}
      <div
        className="fixed inset-x-0 z-30 flex gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={resetForm}
          disabled={photos.length === 0 && !exhibitName && !categoryId && !locationId}
          className="flex items-center justify-center gap-1 rounded-lg border border-input bg-background px-4 py-3 text-sm font-medium disabled:opacity-40"
        >
          <X className="h-4 w-4" /> {t('common.clear')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground active:bg-primary/90 disabled:opacity-50"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Check className="h-5 w-5" />}
          {t('pwa.add.save')}
        </button>
      </div>
    </div>
  );
}
