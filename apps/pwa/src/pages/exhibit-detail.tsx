import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ImageOff, Loader2, Camera, Trash2, X, Pencil, Save, ShoppingBag } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PhotoUploadSheet } from '@/components/photo-upload-sheet';
import { EbaySheet } from '@/components/ebay-sheet';
import { ConservationLog } from '@/components/conservation-log';

interface LocationOption { id: string; code: string; nameEn: string | null; nameEl: string | null }

interface Image { id: string; url: string; thumbnailUrl?: string; mediumUrl?: string; isPrimary: boolean }
interface Exhibit {
  id: string;
  displayId: string;
  legacyId: string | null;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  comment: string | null;
  locationId: string | null;
  locSite: string | null;
  functional: boolean | null;
  validated: boolean;
  published: boolean;
  acquiredAt: string | null;
  attributes: Record<string, unknown>;
  category: { code: string; nameEn: string; nameEl: string };
  location: { id: string; code: string; nameEn: string | null } | null;
  donor: { name: string } | null;
  images: Image[];
}

interface EditForm {
  exhibitName: string;
  manufacturer: string;
  year: string; // string so the input doesn't fight blank state
  comment: string;
  locationId: string;
  locSite: string;
  functional: boolean | null;
  validated: boolean;
  published: boolean;
  // yyyy-mm-dd for <input type="date">; empty = no date
  acquiredAt: string;
}

function exhibitToForm(ex: Exhibit): EditForm {
  return {
    exhibitName: ex.exhibitName,
    manufacturer: ex.manufacturer ?? '',
    year: ex.year ? String(ex.year) : '',
    comment: ex.comment ?? '',
    locationId: ex.locationId ?? '',
    locSite: ex.locSite ?? '',
    functional: ex.functional,
    validated: ex.validated,
    published: ex.published,
    acquiredAt: ex.acquiredAt ? ex.acquiredAt.slice(0, 10) : '',
  };
}

function formToPayload(form: EditForm) {
  return {
    exhibitName: form.exhibitName.trim(),
    manufacturer: form.manufacturer.trim() || null,
    year: form.year.trim() ? parseInt(form.year.trim()) : null,
    comment: form.comment.trim() || null,
    locationId: form.locationId || null,
    locSite: form.locSite.trim() || null,
    functional: form.functional,
    validated: form.validated,
    published: form.published,
    acquiredAt: form.acquiredAt ? new Date(form.acquiredAt + 'T00:00:00Z').toISOString() : null,
  };
}

export function ExhibitDetailPage() {
  const { t, i18n } = useTranslation();
  const isEl = i18n.language.startsWith('el');
  const { id } = useParams<{ id: string }>();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ebayOpen, setEbayOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const qc = useQueryClient();

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationOption[]>('/locations'),
    staleTime: 5 * 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      api.patch(`/exhibits/${id}`, payload),
    onSuccess: () => {
      toast.success(t('common.saved'));
      setEditing(false);
      setForm(null);
      qc.invalidateQueries({ queryKey: ['exhibit', id] });
      qc.invalidateQueries({ queryKey: ['inventory'] }); // list might show name/year
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Reset the form when we exit edit mode without saving, and when the
  // underlying exhibit changes.
  useEffect(() => {
    if (!editing) setForm(null);
  }, [editing]);

  async function deleteImage(exhibitId: string, imageId: string) {
    if (!window.confirm(t('pwa.upload.confirmDelete') as string)) return;
    setDeletingId(imageId);
    try {
      await api.delete(`/exhibits/${exhibitId}/images/${imageId}`);
      toast.success(t('pwa.upload.deleted'));
      setLightbox(null);
      qc.invalidateQueries({ queryKey: ['exhibit', exhibitId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const { data: ex, isLoading } = useQuery({
    queryKey: ['exhibit', id],
    queryFn: () => api.get<Exhibit>(`/exhibits/${id}`),
    enabled: !!id,
  });

  if (isLoading || !ex) {
    return (
      <div className="flex h-full items-center justify-center pt-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const attrs = Object.entries(ex.attributes ?? {}).filter(
    ([k]) => !['containerType', 'containerUuid', 'containerLabel', 'legacyOldId'].includes(k),
  ) as [string, string][];

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-2 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur-sm">
        <Link
          to="/inventory"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
          aria-label={t('exhibit.backToExhibits') as string}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold text-primary">{ex.displayId}</p>
          <h1 className="truncate text-sm font-semibold">{ex.exhibitName}</h1>
        </div>
        {!editing ? (
          <button
            onClick={() => { setForm(exhibitToForm(ex)); setEditing(true); }}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            aria-label={t('common.edit') as string}
          >
            <Pencil className="h-5 w-5" />
          </button>
        ) : (
          <>
            <button
              onClick={() => { setEditing(false); }}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => form && updateMutation.mutate(formToPayload(form))}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {updateMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </>
        )}
      </header>

      {/* Photo carousel */}
      {ex.images.length > 0 ? (
        <div className="-mx-0 flex snap-x snap-mandatory overflow-x-auto">
          {ex.images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setLightbox(i)}
              className="aspect-square w-full flex-shrink-0 snap-center bg-muted"
            >
              <img
                src={img.mediumUrl ?? img.url}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.src !== img.url) el.src = img.url;
                }}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-muted">
          <ImageOff className="h-10 w-10 text-muted-foreground/40" />
        </div>
      )}

      {/* Info — readonly or editable */}
      {editing && form ? (
        <div className="space-y-3 px-4 py-4 text-sm">
          <FormField label={t('exhibit.exhibitName')}>
            <input
              value={form.exhibitName}
              onChange={(e) => setForm({ ...form, exhibitName: e.target.value })}
              className={INPUT_CLS}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('exhibit.manufacturer')}>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label={t('exhibit.year')}>
              <input
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                inputMode="numeric"
                pattern="\d{4}"
                className={INPUT_CLS}
              />
            </FormField>
          </div>
          <FormField label={t('exhibit.comment')}>
            <textarea
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              rows={3}
              className={INPUT_CLS}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('exhibit.location')}>
              <select
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                className={INPUT_CLS}
              >
                <option value="">—</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}{l.nameEn ? ` — ${l.nameEn}` : ''}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('exhibit.site')}>
              <input
                value={form.locSite}
                onChange={(e) => setForm({ ...form, locSite: e.target.value })}
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label={t('exhibit.acquiredAt')}>
              <input
                type="date"
                value={form.acquiredAt}
                onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })}
                className={INPUT_CLS}
              />
            </FormField>
          </div>
          <ToggleRow
            label={t('exhibit.functional')}
            checked={form.functional === true}
            indeterminate={form.functional === null}
            onChange={(v) => setForm({ ...form, functional: v })}
          />
          <ToggleRow
            label={t('exhibit.validated')}
            checked={form.validated}
            onChange={(v) => setForm({ ...form, validated: v })}
          />
          <ToggleRow
            label={t('exhibit.published')}
            checked={form.published}
            onChange={(v) => setForm({ ...form, published: v })}
          />
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{ex.category && (isEl ? ex.category.nameEl : ex.category.nameEn)}</p>
              {ex.manufacturer && <p className="text-base font-medium">{ex.manufacturer}</p>}
              {ex.year && <p className="text-xs text-muted-foreground">{ex.year}</p>}
            </div>
            {/* eBay search — opens a bottom-sheet with similar listings. */}
            <button
              onClick={() => setEbayOpen(true)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-input bg-background px-3 py-1.5 text-xs font-medium active:bg-muted"
              title={t('exhibit.ebay') as string}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {t('exhibit.ebay')}
            </button>
          </div>

          {ex.comment && (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm">{ex.comment}</p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {ex.location && (
              <Field label={t('exhibit.location')} value={`${ex.location.code}${ex.location.nameEn ? ' — ' + ex.location.nameEn : ''}`} />
            )}
            {ex.locSite && <Field label={t('exhibit.site')} value={ex.locSite} />}
            {ex.donor && <Field label={t('exhibit.donor')} value={ex.donor.name} />}
            <Field label={t('exhibit.validated')} value={ex.validated ? t('common.yes') : t('common.no')} />
            {ex.acquiredAt && <Field label={t('exhibit.acquiredAt')} value={new Date(ex.acquiredAt).toLocaleDateString()} />}
            {ex.legacyId && <Field label={t('exhibit.legacyId')} value={ex.legacyId} />}
          </dl>

          {attrs.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('exhibit.categoryAttributes')}
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {attrs.map(([k, v]) => (
                  <Field key={k} label={formatKey(k)} value={String(v ?? '')} />
                ))}
              </dl>
            </div>
          )}

          <ConservationLog exhibitId={ex.id} />
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && ex.images[lightbox] && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/95"
          onClick={() => setLightbox(null)}
        >
          <div
            className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label={t('common.cancel') as string}
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={() => deleteImage(ex.id, ex.images[lightbox]!.id)}
              disabled={deletingId === ex.images[lightbox]!.id}
              className="flex items-center gap-2 rounded-full bg-destructive/90 px-4 py-2 text-sm font-medium text-destructive-foreground active:bg-destructive disabled:opacity-50"
            >
              {deletingId === ex.images[lightbox]!.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
              {t('common.delete')}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <img
              src={ex.images[lightbox]!.url}
              alt=""
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Floating "Add photos" action.
          Tab bar is 4rem (64px) + safe-area-inset-bottom padding.
          bottom-24 (6rem) + safe-area gives ~32px clearance above the tab bar.
          Hidden while the upload sheet is open so it doesn't sit over the sheet. */}
      {!uploadOpen && !editing && (
        <button
          onClick={() => setUploadOpen(true)}
          className="fixed right-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:bg-primary/90"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          aria-label={t('pwa.upload.title') as string}
        >
          <Camera className="h-6 w-6" />
        </button>
      )}

      <PhotoUploadSheet
        open={uploadOpen}
        exhibitId={ex.id}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { qc.invalidateQueries({ queryKey: ['exhibit', id] }); }}
      />

      <EbaySheet
        open={ebayOpen}
        exhibit={ex}
        onClose={() => setEbayOpen(false)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}

function formatKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const INPUT_CLS =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:border-primary focus:outline-none';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  indeterminate,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  indeterminate?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-input bg-card px-3 py-3"
    >
      <span className="text-sm">{label}</span>
      <span
        className={`flex h-6 w-11 items-center rounded-full border transition-colors ${
          indeterminate
            ? 'border-input bg-muted'
            : checked
              ? 'border-primary bg-primary'
              : 'border-input bg-background'
        }`}
      >
        <span
          className={`mx-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
        {indeterminate && (
          <span className="absolute h-1 w-1 rounded-full bg-muted-foreground" />
        )}
      </span>
    </button>
  );
}
