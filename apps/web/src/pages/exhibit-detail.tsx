import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, X, Rows3, Columns2, Pencil, Save, Loader2, ExternalLink, BookOpen, ShoppingBag, Tag as TagIcon, Upload, Star, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, Printer, RotateCw, RotateCcw, Sparkles, Files } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DonorPicker } from '@/components/donor-picker';
import { ImageGallery } from '@/components/ui/image-gallery';
import { ConservationLog } from '@/components/conservation-log';
import { MentionText, MentionTextarea, useMentionResolver } from '@/components/exhibit-mentions';
import { fieldLabel } from '@/lib/category-fields';
import { WikidataEnrichModal, type EnrichPatch } from '@/components/wikidata-enrich';
import { useAuth } from '@/hooks/use-auth';

interface CategorySchema {
  type: string;
  properties: Record<string, {
    type?: string;
    title?: string;
    titleEl?: string;
    enum?: string[];
    suggestions?: string[];
    autocomplete?: boolean;
  }>;
}
interface Category { id: string; code: string; nameEn: string; nameEl: string; idPrefix: string; schema?: CategorySchema | null }
interface Location { id: string; code: string; nameEn: string | null; nameEl: string | null }
interface Donor { id: string; name: string }
interface Tag { id: string; name: string; color: string | null }

interface Exhibit {
  id: string;
  displayId: string;
  legacyId: string | null;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  categoryId: string;
  donorId: string | null;
  locationId: string | null;
  locSite: string | null;
  functional: boolean | null;
  functionalComment: string | null;
  validated: boolean;
  collectiblePrice: number | null;
  comment: string | null;
  attributes: Record<string, unknown>;
  published: boolean;
  acquiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category;
  donor: Donor | null;
  location: Location | null;
  tags: Tag[];
  imageCount: number;
}

interface EditForm {
  exhibitName: string;
  manufacturer: string;
  year: string;
  categoryId: string;
  locationId: string;
  donorId: string;
  locSite: string;
  functional: string;
  validated: boolean;
  published: boolean;
  collectiblePrice: string;
  comment: string;
  functionalComment: string;
  attributes: Record<string, string>;
  // ISO yyyy-mm-dd (for the <input type="date"> in the edit form). Empty
  // string represents "no date set" — translates to NULL on the API.
  acquiredAt: string;
}

type PageLayout = 'stacked' | 'split';

const NON_FUNCTIONAL_CATEGORIES = new Set(['books', 'magazines']);
function categoryHasFunctional(code: string | undefined | null): boolean {
  return !!code && !NON_FUNCTIONAL_CATEGORIES.has(code);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean | null; trueLabel: string; falseLabel: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  return value ? (
    <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3.5 w-3.5" />{trueLabel}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground"><X className="h-3.5 w-3.5" />{falseLabel}</span>
  );
}

function LayoutToggle({ layout, onChange }: { layout: PageLayout; onChange: (l: PageLayout) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex rounded-md border border-border bg-card">
      <button
        onClick={() => onChange('stacked')}
        className={`rounded-l-md p-1.5 transition-colors ${
          layout === 'stacked' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        }`}
        title={t('exhibit.layoutStacked') as string}
      >
        <Rows3 className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange('split')}
        className={`rounded-r-md p-1.5 transition-colors ${
          layout === 'split' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        }`}
        title={t('exhibit.layoutSideBySide') as string}
      >
        <Columns2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`} />
      </button>
      <span className="text-sm">{label}</span>
    </label>
  );
}

function TagPicker({ selected, allTags, onChange }: { selected: string[]; allTags: Tag[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const tag = allTags.find((t) => t.id === id);
          if (!tag) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
              style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
            >
              {tag.name}
              <button
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-full border border-dashed border-muted-foreground/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          {t('exhibit.addTag')}
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {allTags
            .filter((t) => !selected.includes(t.id))
            .map((tag) => (
              <button
                key={tag.id}
                onClick={() => { onChange([...selected, tag.id]); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {tag.color && (
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                )}
                {tag.name}
              </button>
            ))}
          {allTags.filter((t) => !selected.includes(t.id)).length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t('exhibit.noMoreTags')}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ExhibitImage {
  id: string;
  filename: string;
  mimeType: string | null;
  url: string;
  // 1024px webp for hero / gallery slots — much smaller than the original.
  mediumUrl?: string;
  thumbnailUrl?: string;
  isPrimary: boolean;
}

function ImageManager({
  exhibitId,
  images,
  onRefresh,
}: {
  exhibitId: string;
  images: ExhibitImage[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(fileList)) fd.append('files', f);
      const res = await fetch(`/api/exhibits/${exhibitId}/images`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Upload failed (${res.status})`);
      }
      await onRefresh();
    } catch (err: any) {
      setError(err.message ?? t('toast.uploadFailed'));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function setPrimary(imageId: string) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/exhibits/${exhibitId}/images/${imageId}`, { isPrimary: true });
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.setPrimaryFailed')); }
    finally { setBusy(false); }
  }

  async function deleteImage(imageId: string) {
    setBusy(true); setError(null);
    try {
      await api.delete(`/exhibits/${exhibitId}/images/${imageId}`);
      setConfirmDelete(null);
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.deleteFailed')); }
    finally { setBusy(false); }
  }

  async function move(imageId: string, direction: -1 | 1) {
    const idx = images.findIndex((i) => i.id === imageId);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= images.length) return;
    const reordered = [...images];
    const [it] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, it!);
    setBusy(true); setError(null);
    try {
      await api.patch(`/exhibits/${exhibitId}/images/reorder`, {
        imageIds: reordered.map((i) => i.id),
      });
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.reorderFailed')); }
    finally { setBusy(false); }
  }

  async function rotate(imageId: string, direction: 'cw' | 'ccw') {
    setBusy(true); setError(null);
    try {
      await api.post(`/exhibits/${exhibitId}/images/${imageId}/rotate`, { direction });
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.error')); }
    finally { setBusy(false); }
  }

  const [dragOver, setDragOver] = useState(false);
  // HTML5 drag-and-drop reorder state for the image tiles below the dropzone
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);

  async function reorderTo(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIdx = images.findIndex((i) => i.id === fromId);
    const toIdx = images.findIndex((i) => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...images];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved!);
    setBusy(true); setError(null);
    try {
      await api.patch(`/exhibits/${exhibitId}/images/reorder`, {
        imageIds: reordered.map((i) => i.id),
      });
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.reorderFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-input'
        }`}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <div className="text-sm">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-primary hover:underline"
            disabled={busy}
          >
            {t('exhibit.clickToUpload')}
          </button>
          {' '}{t('exhibit.uploadHint')}
        </div>
        <p className="text-xs text-muted-foreground">{t('exhibit.uploadFormats')}</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, idx) => (
            <div
              key={img.id}
              draggable={!busy}
              onDragStart={() => setDragImageId(img.id)}
              onDragOver={(e) => {
                if (!dragImageId || dragImageId === img.id) return;
                e.preventDefault();
                setDragOverImageId(img.id);
              }}
              onDragLeave={() => setDragOverImageId((id) => (id === img.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragImageId && dragImageId !== img.id) reorderTo(dragImageId, img.id);
                setDragImageId(null);
                setDragOverImageId(null);
              }}
              onDragEnd={() => { setDragImageId(null); setDragOverImageId(null); }}
              className={`group relative overflow-hidden rounded-lg border bg-muted transition ${
                dragImageId === img.id ? 'opacity-40' : ''
              } ${dragOverImageId === img.id ? 'border-primary ring-2 ring-primary/40' : 'border-border'} ${
                busy ? '' : 'cursor-move'
              }`}
            >
              <img
                src={img.thumbnailUrl ?? img.url}
                alt={img.filename}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.src !== img.url) el.src = img.url;
                }}
                className="aspect-square w-full object-cover"
              />
              {img.isPrimary && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  <Star className="h-2.5 w-2.5" /> {t('exhibit.primary')}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    title={t('exhibit.moveUp')}
                    disabled={busy || idx === 0}
                    onClick={() => move(img.id, -1)}
                    className="rounded bg-white/10 p-1 text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t('exhibit.moveDown')}
                    disabled={busy || idx === images.length - 1}
                    onClick={() => move(img.id, 1)}
                    className="rounded bg-white/10 p-1 text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    title={t('exhibit.rotateCcw') as string}
                    disabled={busy}
                    onClick={() => rotate(img.id, 'ccw')}
                    className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t('exhibit.rotateCw') as string}
                    disabled={busy}
                    onClick={() => rotate(img.id, 'cw')}
                    className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                  {!img.isPrimary && (
                    <button
                      type="button"
                      title={t('exhibit.makePrimary')}
                      disabled={busy}
                      onClick={() => setPrimary(img.id)}
                      className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title={t('common.delete')}
                    disabled={busy}
                    onClick={() => setConfirmDelete(img.id)}
                    className="rounded bg-white/10 p-1 text-white hover:bg-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {confirmDelete === img.id && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-2 text-white">
                  <p className="text-center text-xs">{t('exhibit.deleteImage')}</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => deleteImage(img.id)}
                      disabled={busy}
                      className="rounded bg-red-500 px-2 py-1 text-xs hover:bg-red-600"
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4" /> {t('exhibit.noImagesYet')}
        </p>
      )}
    </div>
  );
}

function ExhibitEditForm({
  exhibit,
  form,
  setForm,
  categories,
  locations,
  donors,
  allTags,
  tagIds,
  setTagIds,
  categorySchema,
  onImagesChange,
}: {
  exhibit: Exhibit;
  form: EditForm;
  setForm: (f: EditForm) => void;
  categories: Category[];
  locations: Location[];
  donors: Donor[];
  allTags: Tag[];
  tagIds: string[];
  setTagIds: (ids: string[]) => void;
  categorySchema: CategorySchema | null;
  onImagesChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const inputCls = 'w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm';
  const selectCls = inputCls;

  // Live distinct values for any attribute flagged `autocomplete` in the schema
  // (e.g. Books author / publishers / language) — drives the in-form dropdowns.
  // `type` is always included so its combobox can offer existing values too.
  const autocompleteKeys = categorySchema
    ? [...new Set([
        ...Object.entries(categorySchema.properties).filter(([, p]) => p.autocomplete).map(([k]) => k),
        ...(categorySchema.properties.type ? ['type'] : []),
      ])]
    : [];
  const { data: attrValues } = useQuery({
    queryKey: ['attr-values', form.categoryId, autocompleteKeys.join(',')],
    queryFn: () => api.get<Record<string, string[]>>(
      `/exhibits/attribute-values?categoryId=${form.categoryId}&keys=${encodeURIComponent(autocompleteKeys.join(','))}`,
    ),
    enabled: !!form.categoryId && autocompleteKeys.length > 0,
  });

  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const category = categories.find((c) => c.id === form.categoryId) ?? null;
  const [wikidataOpen, setWikidataOpen] = useState(false);
  // Same "+ Add new" pattern as NewExhibitModal — swaps the Type <select>
  // for a bare text input so the operator can enter a value that isn't
  // yet in the enum / attrValues / suggestions.
  const [addingType, setAddingType] = useState(false);

  // Merge curator-approved Wikidata facts into the form. The modal resolves
  // each fact to a core column (manufacturer/year) or a category attribute; the
  // user still reviews and Saves.
  function applyWikidata(patch: EnrichPatch) {
    const next: EditForm = { ...form, attributes: { ...form.attributes, ...patch.attributes } };
    if (patch.manufacturer !== undefined) next.manufacturer = patch.manufacturer;
    if (patch.year !== undefined) next.year = patch.year;
    setForm(next);
    setWikidataOpen(false);
    const count =
      (patch.manufacturer !== undefined ? 1 : 0) +
      (patch.year !== undefined ? 1 : 0) +
      Object.keys(patch.attributes).length;
    toast.success(t('exhibit.wikidataApplied', { count }));
  }

  return (
    <>
      <div className="flex items-center justify-end px-5 pt-4">
        <button
          type="button"
          onClick={() => setWikidataOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-control border border-input px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
          title={t('exhibit.wikidataButton') as string}
        >
          <Sparkles className="h-3.5 w-3.5" /> {t('exhibit.wikidataButton')}
        </button>
      </div>
      {wikidataOpen && (
        <WikidataEnrichModal
          initialQuery={form.exhibitName || exhibit.exhibitName}
          category={category ? { id: category.id, code: category.code } : null}
          schemaProperties={categorySchema?.properties ?? null}
          canManageCategory={hasPermission('category:write')}
          onApply={applyWikidata}
          onSchemaChanged={() => queryClient.invalidateQueries({ queryKey: ['categories'] })}
          onClose={() => setWikidataOpen(false)}
        />
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.name')} *</label>
          <input value={form.exhibitName} onChange={(e) => setForm({ ...form, exhibitName: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.manufacturer')}</label>
          <input list="manufacturers-list" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.year')}</label>
          <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputCls} placeholder={t('common.placeholderYear') as string} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.category')}</label>
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={selectCls}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
          </select>
        </div>
        {categorySchema?.properties?.type && (() => {
          const knownTypes = Array.from(new Set([
            ...(attrValues?.type ?? []),
            ...(categorySchema.properties.type.enum ?? []),
            ...(categorySchema.properties.type.suggestions ?? []),
          ]));
          const current = form.attributes.type ?? '';
          if (current && !knownTypes.includes(current)) knownTypes.unshift(current);
          return (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {fieldLabel(categorySchema.properties.type, lang, 'Type')}
              </label>
              {addingType ? (
                <input
                  autoFocus
                  placeholder={t('exhibits.newTypePlaceholder') as string}
                  value={current}
                  onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, type: e.target.value } })}
                  onBlur={() => setAddingType(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                  }}
                  className={inputCls}
                />
              ) : (
                <select
                  value={current}
                  onChange={(e) => {
                    if (e.target.value === '__add__') {
                      setForm({ ...form, attributes: { ...form.attributes, type: '' } });
                      setAddingType(true);
                    } else {
                      setForm({ ...form, attributes: { ...form.attributes, type: e.target.value } });
                    }
                  }}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {knownTypes.map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value="__add__">+ {t('exhibits.addNewType')}</option>
                </select>
              )}
            </div>
          );
        })()}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.location')}</label>
          <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className={selectCls}>
            <option value="">— {t('common.no')} —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.nameEn ?? l.code}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.site')}</label>
          <input value={form.locSite} onChange={(e) => setForm({ ...form, locSite: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.donor')}</label>
          <DonorPicker
            donors={donors}
            value={form.donorId}
            onChange={(id) => setForm({ ...form, donorId: id })}
          />
        </div>
        {categoryHasFunctional(categories.find((c) => c.id === form.categoryId)?.code) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.functional')}</label>
            <select value={form.functional} onChange={(e) => setForm({ ...form, functional: e.target.value })} className={selectCls}>
              <option value="">{t('common.unknown')}</option>
              <option value="true">{t('common.yes')}</option>
              <option value="false">{t('common.no')}</option>
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.collectiblePrice')}</label>
          <input type="number" step="0.01" value={form.collectiblePrice} onChange={(e) => setForm({ ...form, collectiblePrice: e.target.value })} className={inputCls} placeholder={t('common.placeholderPrice') as string} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.acquiredAt')}</label>
          <input type="date" value={form.acquiredAt} onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="border-t border-border p-5">
        <div className="flex gap-6">
          <Toggle checked={form.validated} onChange={(v) => setForm({ ...form, validated: v })} label={t('exhibit.validated')} />
          <Toggle checked={form.published} onChange={(v) => setForm({ ...form, published: v })} label={t('exhibit.published')} />
        </div>
      </div>

      <div className="space-y-4 border-t border-border p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.comment')}</label>
          <MentionTextarea value={form.comment} onChange={(v) => setForm({ ...form, comment: v })} rows={3} className={`${inputCls} resize-y`} />
        </div>
        {categoryHasFunctional(categories.find((c) => c.id === form.categoryId)?.code) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.functionalComment')}</label>
            <MentionTextarea value={form.functionalComment} onChange={(v) => setForm({ ...form, functionalComment: v })} rows={2} className={`${inputCls} resize-y`} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-5">
        <label className="mb-2 block text-xs font-medium text-muted-foreground">{t('exhibit.tags')}</label>
        <TagPicker selected={tagIds} allTags={allTags} onChange={setTagIds} />
      </div>

      <div className="border-t border-border p-5">
        <h2 className="mb-3 text-sm font-semibold">{t('exhibit.images')}</h2>
        <ImageManager
          exhibitId={exhibit.id}
          images={(exhibit as any).images ?? []}
          onRefresh={onImagesChange}
        />
      </div>

      {/* Category-specific attributes (JSONB) */}
      {categorySchema && Object.keys(categorySchema.properties).some((k) => k !== 'type') && (
        <div className="border-t border-border p-5">
          <h2 className="mb-3 text-sm font-semibold">{t('exhibit.categoryAttributes')}</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            {Object.entries(categorySchema.properties).filter(([key]) => key !== 'type').map(([key, prop]) => {
              const label = fieldLabel(prop, lang, formatAttrKey(key));
              const value = form.attributes[key] ?? '';

              if (prop.enum) {
                return (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                    <select
                      value={value}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [key]: e.target.value } })}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {prop.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                );
              }

              // A combobox: dropdown of known values, but still free-text (so
              // legacy multi-value entries and new values keep working). Static
              // `suggestions` come from the schema; `autocomplete` pulls the live
              // distinct values for the field from the DB.
              if (prop.autocomplete || prop.suggestions) {
                const listId = `attr-${key}-list`;
                const options = prop.autocomplete ? (attrValues?.[key] ?? []) : (prop.suggestions ?? []);
                return (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                    <input
                      list={listId}
                      value={value}
                      onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [key]: e.target.value } })}
                      className={inputCls}
                    />
                    <datalist id={listId}>
                      {options.map((opt) => <option key={opt} value={opt} />)}
                    </datalist>
                  </div>
                );
              }

              return (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                  <input
                    value={value}
                    onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [key]: e.target.value } })}
                    className={inputCls}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

interface OpenLibraryBook {
  url?: string;
  title?: string;
  subtitle?: string;
  authors?: { name: string; url?: string }[];
  number_of_pages?: number;
  publish_date?: string;
  publishers?: { name: string }[];
  cover?: { small?: string; medium?: string; large?: string };
  subjects?: { name: string; url?: string }[];
  identifiers?: Record<string, string[]>;
}

function OpenLibraryModal({ isbn, onClose }: { isbn: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<OpenLibraryBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const cleanIsbn = isbn.replace(/[^0-9Xx]/g, '');

    fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const book = payload[`ISBN:${cleanIsbn}`] as OpenLibraryBook | undefined;
        if (!book) {
          setError(t('exhibit.noOpenLibraryResults'));
        } else {
          setData(book);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? t('toast.fetchFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isbn]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Open Library — ISBN {isbn}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('exhibit.lookingUpOpenLibrary')}
            </div>
          )}
          {error && !loading && (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <a
                href={`https://openlibrary.org/search?isbn=${isbn}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t('exhibit.searchOpenLibrary')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {data && !loading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[160px_1fr]">
              <div>
                {data.cover?.large || data.cover?.medium ? (
                  <img
                    src={data.cover.large ?? data.cover.medium}
                    alt={data.title ?? 'Cover'}
                    className="w-full rounded border border-border"
                  />
                ) : (
                  <div className="flex aspect-[2/3] w-full items-center justify-center rounded border border-dashed border-border text-muted-foreground/40">
                    <BookOpen className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <h3 className="font-display text-lg font-bold leading-tight">{data.title}</h3>
                  {data.subtitle && <p className="text-muted-foreground">{data.subtitle}</p>}
                </div>
                {data.authors && data.authors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {data.authors.length === 1 ? t('exhibit.author') : t('exhibit.authors')}
                    </p>
                    <p>{data.authors.map((a) => a.name).join(', ')}</p>
                  </div>
                )}
                {data.publishers && data.publishers.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('exhibit.publisher')}</p>
                    <p>{data.publishers.map((p) => p.name).join(', ')}</p>
                  </div>
                )}
                {data.publish_date && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('exhibit.published_date')}</p>
                    <p>{data.publish_date}</p>
                  </div>
                )}
                {data.number_of_pages && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('exhibit.pages')}</p>
                    <p>{data.number_of_pages}</p>
                  </div>
                )}
                {data.subjects && data.subjects.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('exhibit.subjects')}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {data.subjects.slice(0, 12).map((s, i) => (
                        <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {data.url && (
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 pt-2 text-xs text-primary hover:underline"
                  >
                    {t('exhibit.viewOnOpenLibrary')} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IsbnField({ isbn }: { isbn: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">ISBN</dt>
      <dd className="mt-0.5 inline-flex items-center gap-1.5">
        <span>{isbn}</span>
        <button
          onClick={() => setOpen(true)}
          title={t('exhibit.openLibraryLookup')}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
      </dd>
      {open && <OpenLibraryModal isbn={isbn} onClose={() => setOpen(false)} />}
    </div>
  );
}

interface EbayItem {
  itemId: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  price: { value: string; currency: string } | null;
  itemWebUrl: string;
  condition: string | null;
  itemLocationCountry: string | null;
  buyingOptions: string[];
  itemEndDate: string | null;
  itemCreationDate: string | null;
  shortDescription: string | null;
}

function formatPrice(price: { value: string; currency: string } | null): string {
  if (!price) return '—';
  const num = parseFloat(price.value);
  if (isNaN(num)) return `${price.value} ${price.currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: price.currency,
    }).format(num);
  } catch {
    return `${num.toFixed(2)} ${price.currency}`;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

const EBAY_DOMAIN_BY_MARKETPLACE: Record<string, string> = {
  EBAY_US: 'www.ebay.com',
  EBAY_GB: 'www.ebay.co.uk',
  EBAY_DE: 'www.ebay.de',
  EBAY_FR: 'www.ebay.fr',
  EBAY_IT: 'www.ebay.it',
  EBAY_ES: 'www.ebay.es',
  EBAY_AU: 'www.ebay.com.au',
  EBAY_CA: 'www.ebay.ca',
  EBAY_NL: 'www.ebay.nl',
  EBAY_PL: 'www.ebay.pl',
  EBAY_AT: 'www.ebay.at',
  EBAY_BE: 'www.ebay.be',
  EBAY_CH: 'www.ebay.ch',
  EBAY_IE: 'www.ebay.ie',
};

interface SimilarItem {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  category: { code: string; nameEn: string; nameEl: string };
  thumbnailUrl: string | null;
  score: number;
  relation: 'duplicate' | 'strong' | 'possible';
}

const RELATION_STYLE: Record<SimilarItem['relation'], { labelKey: string; badge: string }> = {
  duplicate: { labelKey: 'exhibit.relationDuplicate', badge: 'bg-destructive/15 text-destructive' },
  strong: { labelKey: 'exhibit.relationStrong', badge: 'bg-primary/15 text-primary' },
  possible: { labelKey: 'exhibit.relationPossible', badge: 'bg-muted text-muted-foreground' },
};

function SimilarModal({ exhibit, onClose }: { exhibit: Exhibit; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [items, setItems] = useState<SimilarItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ items: SimilarItem[] }>(`/exhibits/${exhibit.id}/similar`)
      .then((res) => { if (!cancelled) setItems(res.items); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [exhibit.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Files className="h-4 w-4 text-primary" />
            <h2 className="font-medium">{t('exhibit.similarTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[140px] flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
            </div>
          )}
          {error && !loading && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && items && items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('exhibit.similarEmpty')}</p>
          )}
          {!loading && items && items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((it) => {
                const style = RELATION_STYLE[it.relation];
                return (
                  <Link
                    key={it.id}
                    to={`/exhibits/${it.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-control border border-border px-3 py-2 hover:border-primary hover:bg-muted/40"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {it.thumbnailUrl ? (
                        <img src={it.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="truncate font-medium">{it.exhibitName}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {lang === 'el' ? it.category.nameEl : it.category.nameEn}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.displayId}{it.manufacturer ? ` · ${it.manufacturer}` : ''}{it.year ? ` · ${it.year}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{it.score}%</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {t(style.labelKey)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EbayModal({ exhibit, onClose }: { exhibit: Exhibit; onClose: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<EbayItem[] | null>(null);
  const [marketplace, setMarketplace] = useState<string>('EBAY_US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isbn = (exhibit.attributes as Record<string, unknown>)?.isbn as string | undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: exhibit.exhibitName });
    if (isbn && (exhibit.category.code === 'books' || exhibit.category.code === 'magazines')) {
      params.set('isbn', isbn);
    }

    api
      .get<{ items: EbayItem[]; marketplace?: string }>(`/integrations/ebay/search?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        if (res.marketplace) setMarketplace(res.marketplace);
      })
      .catch((err: any) => { if (!cancelled) setError(err.message ?? t('toast.searchFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [exhibit.exhibitName, exhibit.category.code, isbn]);

  const isAllEu = marketplace === 'ALL_EU';
  const ebayDomain = isAllEu ? 'eBay (EU-wide)' : (EBAY_DOMAIN_BY_MARKETPLACE[marketplace] ?? 'www.ebay.com');
  const ebaySearchUrl = isAllEu
    ? `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(exhibit.exhibitName)}&LH_PrefLoc=3`
    : `https://${ebayDomain}/sch/i.html?_nkw=${encodeURIComponent(exhibit.exhibitName)}`;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h2 className="font-medium">{t('exhibit.ebaySimilarListings')}</h2>
            <a
              href={ebaySearchUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open this search on ${ebayDomain}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              "{exhibit.exhibitName}"{isbn && ` · ISBN ${isbn}`}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-[10px] text-muted-foreground">{ebayDomain}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('exhibit.searchingEbay')}
            </div>
          )}
          {error && !loading && (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <a
                href={ebaySearchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t('exhibit.openEbaySearch')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {items && !loading && items.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('exhibit.noEbayMatches')}
            </div>
          )}
          {items && items.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => {
                const endDate = formatDate(it.itemEndDate);
                const created = formatDate(it.itemCreationDate);
                const isAuction = it.buyingOptions.includes('AUCTION');
                return (
                  <a
                    key={it.itemId}
                    href={it.itemWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/50 hover:shadow-md"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {it.thumbnailUrl ? (
                        <img
                          src={it.thumbnailUrl}
                          alt={it.title}
                          loading="lazy"
                          className="h-full w-full object-contain transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <ShoppingBag className="h-8 w-8" />
                        </div>
                      )}
                      {it.condition && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          {it.condition}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 text-sm font-medium leading-tight">{it.title}</p>
                      {it.shortDescription && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{it.shortDescription}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                          <TagIcon className="h-3.5 w-3.5" /> {formatPrice(it.price)}
                        </span>
                        {isAuction && endDate ? (
                          <span className="text-[10px] text-muted-foreground">{t('exhibit.ends')} {endDate}</span>
                        ) : created ? (
                          <span className="text-[10px] text-muted-foreground">{t('exhibit.listed')} {created}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{isAuction ? t('exhibit.auction') : t('exhibit.buyNow')}</span>
                        {it.itemLocationCountry && <span>{it.itemLocationCountry}</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExhibitDetails({ exhibit }: { exhibit: Exhibit }) {
  const { t } = useTranslation();
  const attrs = exhibit.attributes ?? {};
  const HIDDEN_ATTRS = new Set(['legacyOldId', 'containerType']);
  const attrEntries = Object.entries(attrs).filter(([k]) => !HIDDEN_ATTRS.has(k)) as [string, string][];
  const showFunctional = categoryHasFunctional(exhibit.category.code);
  // Resolve @exhibit mentions in the comment fields so they render as links.
  const mentions = useMentionResolver([exhibit.comment ?? '', exhibit.functionalComment ?? '']);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 p-5 text-sm sm:grid-cols-3">
        <Field label={t('exhibit.location')} value={exhibit.location ? (exhibit.location.nameEn ? `${exhibit.location.code} — ${exhibit.location.nameEn}` : exhibit.location.code) : null} />
        <Field label={t('exhibit.site')} value={exhibit.locSite} />
        <Field label={t('exhibit.donor')} value={exhibit.donor?.name} />
        {showFunctional && <Field label={t('exhibit.functional')} value={<BoolBadge value={exhibit.functional} trueLabel={t('common.yes')} falseLabel={t('common.no')} />} />}
        <Field label={t('exhibit.validated')} value={<BoolBadge value={exhibit.validated} trueLabel={t('common.yes')} falseLabel={t('common.no')} />} />
        <Field label={t('exhibit.published')} value={<BoolBadge value={exhibit.published} trueLabel={t('common.yes')} falseLabel={t('common.no')} />} />
        <Field label={t('exhibit.collectiblePrice')} value={exhibit.collectiblePrice ? `€${exhibit.collectiblePrice}` : null} />
        <Field label={t('exhibit.acquiredAt')} value={formatDate(exhibit.acquiredAt)} />
        <Field label={t('exhibit.legacyId')} value={exhibit.legacyId} />
        {typeof attrs.legacyOldId === 'string' && <Field label={t('exhibit.oldId')} value={attrs.legacyOldId} />}
      </div>

      {(exhibit.comment || (showFunctional && exhibit.functionalComment)) && (
        <div className="space-y-3 border-t border-border p-5 text-sm">
          {exhibit.comment && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('exhibit.comment')}</p>
              <MentionText text={exhibit.comment} mentions={mentions} className="mt-1 whitespace-pre-wrap" />
            </div>
          )}
          {showFunctional && exhibit.functionalComment && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('exhibit.functionalComment')}</p>
              <MentionText text={exhibit.functionalComment} mentions={mentions} className="mt-1 whitespace-pre-wrap" />
            </div>
          )}
        </div>
      )}

      {attrEntries.length > 0 && (
        <div className="border-t border-border p-5">
          <h2 className="mb-3 text-sm font-semibold">{t('exhibit.categoryAttributes')}</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            {attrEntries.map(([key, val]) => {
              const strVal = String(val ?? '').trim();
              if (
                key === 'isbn' &&
                strVal &&
                (exhibit.category.code === 'books' || exhibit.category.code === 'magazines')
              ) {
                return <IsbnField key={key} isbn={strVal} />;
              }
              return <Field key={key} label={formatAttrKey(key)} value={strVal} />;
            })}
          </dl>
        </div>
      )}

      {exhibit.tags.length > 0 && (
        <div className="border-t border-border p-5">
          <h2 className="mb-2 text-sm font-semibold">{t('exhibit.tags')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {exhibit.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border px-2.5 py-0.5 text-xs"
                style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <ConservationLog exhibitId={exhibit.id} />

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
        <span>
          {t('exhibit.createdUpdated', {
            created: new Date(exhibit.createdAt).toLocaleDateString(),
            updated: new Date(exhibit.updatedAt).toLocaleDateString(),
          })}
        </span>
        <Link
          to={`/labels?ids=${exhibit.id}`}
          className="inline-flex items-center gap-1 hover:text-foreground"
          title={t('labels.print')}
        >
          <Printer className="h-3 w-3" /> {t('labels.print')}
        </Link>
      </div>
    </>
  );
}

function SplitPhotos({ images }: { images: { id: string; url: string; mediumUrl?: string; thumbnailUrl?: string; alt?: string }[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft' && images.length > 1) {
        setLightboxIndex((i) => i === null ? null : (i - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        setLightboxIndex((i) => i === null ? null : (i + 1) % images.length);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, images.length]);

  return (
    <div className="flex flex-col gap-3">
      {images.map((img, i) => (
        <div
          key={img.id}
          className="cursor-pointer overflow-hidden rounded-lg bg-muted"
          onClick={() => setLightboxIndex(i)}
        >
          <img
            src={img.mediumUrl ?? img.url}
            alt={img.alt ?? ''}
            loading="lazy"
            decoding="async"
            className="w-full object-cover"
            style={{ maxHeight: 300 }}
          />
        </div>
      ))}

      {lightboxIndex !== null && (
        <div
          data-image-lightbox
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
        >
          <button onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + images.length) % images.length); }}
                className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % images.length); }}
                className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-6 w-6 rotate-180" />
              </button>
            </>
          )}
          <img
            src={images[lightboxIndex]!.url}
            alt={images[lightboxIndex]!.alt ?? ''}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-sm text-white/70">{lightboxIndex + 1} / {images.length}</div>
        </div>
      )}
    </div>
  );
}

function exhibitToForm(exhibit: Exhibit): EditForm {
  return {
    exhibitName: exhibit.exhibitName,
    manufacturer: exhibit.manufacturer ?? '',
    year: exhibit.year?.toString() ?? '',
    categoryId: exhibit.categoryId,
    locationId: exhibit.locationId ?? '',
    donorId: exhibit.donorId ?? '',
    locSite: exhibit.locSite ?? '',
    functional: exhibit.functional === null ? '' : String(exhibit.functional),
    validated: exhibit.validated,
    published: exhibit.published,
    collectiblePrice: exhibit.collectiblePrice?.toString() ?? '',
    comment: exhibit.comment ?? '',
    functionalComment: exhibit.functionalComment ?? '',
    attributes: Object.fromEntries(
      Object.entries(exhibit.attributes)
        .filter(([k]) => k !== 'legacyOldId')
        .map(([k, v]) => [k, String(v ?? '')])
    ),
    // ISO date string from API → yyyy-mm-dd for the <input type="date">.
    acquiredAt: exhibit.acquiredAt ? exhibit.acquiredAt.slice(0, 10) : '',
  };
}

function formToPayload(form: EditForm, originalAttributes: Record<string, unknown>) {
  const attrs: Record<string, unknown> = {};
  if (originalAttributes.legacyOldId !== undefined) {
    attrs.legacyOldId = originalAttributes.legacyOldId;
  }
  for (const [k, v] of Object.entries(form.attributes)) {
    if (v) attrs[k] = v;
  }

  return {
    exhibitName: form.exhibitName,
    manufacturer: form.manufacturer || null,
    year: form.year ? parseInt(form.year, 10) : null,
    categoryId: form.categoryId,
    locationId: form.locationId || null,
    donorId: form.donorId || null,
    locSite: form.locSite || null,
    functional: form.functional === '' ? null : form.functional === 'true',
    validated: form.validated,
    published: form.published,
    collectiblePrice: form.collectiblePrice ? parseFloat(form.collectiblePrice) : null,
    comment: form.comment || null,
    functionalComment: form.functionalComment || null,
    attributes: attrs,
    // yyyy-mm-dd → full ISO at midnight UTC, or null to clear.
    acquiredAt: form.acquiredAt ? new Date(form.acquiredAt + 'T00:00:00Z').toISOString() : null,
  };
}

function readSiblingIds(): string[] {
  try {
    const raw = sessionStorage.getItem('exhibits-sibling-ids');
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function ExhibitDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const fromState = (location.state as { fromSearch?: string } | null)?.fromSearch;
  const fromStorage = typeof window !== 'undefined' ? sessionStorage.getItem('exhibits-last-search') : null;
  const backQs = fromState ?? fromStorage ?? '';
  const backTo = backQs ? `/exhibits?${backQs}` : '/exhibits';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<PageLayout>('split');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ebayOpen, setEbayOpen] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Previous/next navigation through the list the user came from ──────────
  // Ordered ids arrive via router state (and are mirrored to sessionStorage so
  // they survive reloads / sibling jumps). Nav is only active when THIS exhibit
  // is part of that remembered list — so a stale list never hijacks the arrows.
  const siblingFromState = (location.state as { siblingIds?: string[] } | null)?.siblingIds;
  useEffect(() => {
    if (siblingFromState?.length) {
      sessionStorage.setItem('exhibits-sibling-ids', JSON.stringify(siblingFromState));
    }
  }, [siblingFromState]);
  const siblingIds = siblingFromState ?? readSiblingIds();
  const sibIndex = id ? siblingIds.indexOf(id) : -1;
  const prevId = sibIndex > 0 ? siblingIds[sibIndex - 1]! : null;
  const nextId = sibIndex >= 0 && sibIndex < siblingIds.length - 1 ? siblingIds[sibIndex + 1]! : null;

  // Subtle one-time discoverability hint next to the nav control: it fades after
  // a few seconds and never returns once the arrows have actually been used.
  const [hint, setHint] = useState<boolean>(() =>
    typeof window !== 'undefined' && localStorage.getItem('exhibit-arrow-hint') !== '1');
  const markArrowsUsed = () => { localStorage.setItem('exhibit-arrow-hint', '1'); setHint(false); };
  useEffect(() => {
    if (!hint || sibIndex < 0 || siblingIds.length < 2) return;
    const tid = window.setTimeout(() => setHint(false), 8000);
    return () => window.clearTimeout(tid);
  }, [hint, sibIndex, siblingIds.length]);

  useEffect(() => {
    if (editing) return; // don't hijack arrows while editing the form
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('[data-image-lightbox]')) return; // the lightbox owns arrows while open
      const target = e.key === 'ArrowLeft' ? prevId : nextId;
      if (target) { e.preventDefault(); localStorage.setItem('exhibit-arrow-hint', '1'); setHint(false); navigate(`/exhibits/${target}`); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, prevId, nextId, navigate]);

  const siblingNav = sibIndex >= 0 && siblingIds.length > 1 ? (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {hint && (
        <span className="mr-1 hidden whitespace-nowrap text-xs text-muted-foreground/60 sm:inline">
          ← {t('exhibit.useArrows')} →
        </span>
      )}
      <button
        type="button"
        onClick={() => { if (prevId) { markArrowsUsed(); navigate(`/exhibits/${prevId}`); } }}
        disabled={!prevId}
        title={`${t('exhibit.previous')} (←)`}
        aria-label={t('exhibit.previous') as string}
        className="rounded p-1 hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <span className="tabular-nums">{sibIndex + 1} / {siblingIds.length}</span>
      <button
        type="button"
        onClick={() => { if (nextId) { markArrowsUsed(); navigate(`/exhibits/${nextId}`); } }}
        disabled={!nextId}
        title={`${t('exhibit.next')} (→)`}
        aria-label={t('exhibit.next') as string}
        className="rounded p-1 hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ArrowLeft className="h-4 w-4 rotate-180" />
      </button>
    </div>
  ) : null;

  const { data: exhibit, isLoading, error } = useQuery({
    queryKey: ['exhibit', id],
    queryFn: () => api.get<Exhibit>(`/exhibits/${id}`),
    enabled: !!id,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    enabled: editing,
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<Location[]>('/locations'),
    enabled: editing,
  });

  // List-of-values for manufacturer autocomplete (datalist below).
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => api.get<string[]>('/exhibits/manufacturers'),
    enabled: editing,
    staleTime: 5 * 60_000,
  });

  const { data: donors } = useQuery({
    queryKey: ['donors'],
    queryFn: () => api.get<Donor[]>('/donors'),
    enabled: editing,
  });

  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<Tag[]>('/tags'),
    enabled: editing,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/exhibits/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibit', id] });
      queryClient.invalidateQueries({ queryKey: ['exhibits-infinite'] });
      // Manufacturer might be a brand-new value — refresh the LOV cache.
      queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const tagMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch(`/exhibits/${id}/tags`, { tagIds: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibit', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/exhibits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibits-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['exhibits-stats'] });
      toast.success(t('toast.deleted'));
      navigate(backTo);
    },
    onError: () => toast.error(t('toast.error')),
  });

  function startEdit() {
    if (!exhibit) return;
    setForm(exhibitToForm(exhibit));
    setTagIds(exhibit.tags.map((t) => t.id));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!form || !exhibit) return;
    setSaveError(null);

    try {
      const payload = formToPayload(form, exhibit.attributes);
      await updateMutation.mutateAsync(payload);

      const origTagIds = exhibit.tags.map((t) => t.id).sort().join(',');
      const newTagIds = [...tagIds].sort().join(',');
      if (origTagIds !== newTagIds) {
        await tagMutation.mutateAsync(tagIds);
      }

      setEditing(false);
      setForm(null);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save');
    }
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>;
  if (error || !exhibit) return <div className="py-8 text-center text-destructive">{t('exhibit.notFound')}</div>;

  const realImages = (exhibit as any).images ?? [];
  const demoImages = new URLSearchParams(window.location.search).has('demo')
    ? Array.from({ length: 5 }, (_, i) => ({
        id: `demo-${i}`,
        url: `https://picsum.photos/seed/${exhibit.id}-${i}/800/600`,
        alt: exhibit.exhibitName,
      }))
    : [];
  const exhibitImages = realImages.length > 0
    ? realImages.map((img: any) => ({ id: img.id, url: img.url, mediumUrl: img.mediumUrl, thumbnailUrl: img.thumbnailUrl, alt: exhibit.exhibitName }))
    : demoImages;
  const hasImages = exhibitImages.length > 0;

  const isSaving = updateMutation.isPending || tagMutation.isPending;

  const headerContent = (
    <div className="border-b border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-lg font-semibold text-primary">{exhibit.displayId}</span>
          {editing && form ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={form.exhibitName}
                onChange={(e) => setForm({ ...form, exhibitName: e.target.value })}
                className="rounded-control border border-input bg-background px-2 py-1.5 text-lg font-bold"
              />
              <input
                list="manufacturers-list"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className="rounded-control border border-input bg-background px-2 py-1 text-sm text-muted-foreground"
                placeholder={t('exhibit.manufacturer') as string}
              />
            </div>
          ) : (
            <>
              <h1 className="mt-1 font-display text-xl font-bold">{exhibit.exhibitName}</h1>
              {exhibit.manufacturer && <p className="mt-0.5 text-muted-foreground">{exhibit.manufacturer}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-2 py-1 text-xs font-medium">{exhibit.category.nameEn}</span>
                {exhibit.year && <span className="rounded bg-muted px-2 py-1 text-xs">{exhibit.year}</span>}
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <>
              <button
                onClick={() => setSimilarOpen(true)}
                title={t('exhibit.checkSimilarHint') as string}
                className="flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Files className="h-3.5 w-3.5" /> {t('exhibit.checkSimilar')}
              </button>
              <button
                onClick={() => setEbayOpen(true)}
                title="Find similar items on eBay"
                className="flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> {t('exhibit.ebay')}
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Pencil className="h-3.5 w-3.5" /> {t('exhibit.edit')}
              </button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !form?.exhibitName.trim()}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('common.save')}
          </button>
          <button
            onClick={cancelEdit}
            disabled={isSaving}
            className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}

          {/* Delete button — separated to the right */}
          <div className="ml-auto">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={isSaving || deleteMutation.isPending}
                className="flex items-center gap-1.5 rounded-control border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('exhibit.deleteExhibit')}
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-control border border-destructive/40 bg-destructive/5 px-3 py-1.5">
                <span className="text-sm text-destructive">
                  {t('exhibit.deleteExhibitConfirm')}
                </span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1.5 rounded-control bg-destructive px-3 py-1 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {deleteMutation.isPending ? t('exhibit.deleting') : t('common.delete')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteMutation.isPending}
                  className="rounded-control px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const bodyContent = editing && form ? (
    <ExhibitEditForm
      exhibit={exhibit}
      form={form}
      setForm={setForm}
      categories={categories ?? [exhibit.category]}
      locations={locations ?? (exhibit.location ? [exhibit.location] : [])}
      donors={donors ?? (exhibit.donor ? [exhibit.donor] : [])}
      allTags={allTags ?? exhibit.tags}
      tagIds={tagIds}
      setTagIds={setTagIds}
      categorySchema={
        (categories ?? []).find((c) => c.id === (form?.categoryId ?? exhibit.categoryId))?.schema ?? null
      }
      onImagesChange={() => {
        queryClient.invalidateQueries({ queryKey: ['exhibit', id] });
        queryClient.invalidateQueries({ queryKey: ['exhibits-infinite'] });
      }}
    />
  ) : (
    <ExhibitDetails exhibit={exhibit} />
  );

  if (layout === 'split' && hasImages && !editing) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <Link to={backTo} state={{ fromDetail: true }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {t('exhibit.backToExhibits')}
          </Link>
          <div className="flex items-center gap-3">
            {siblingNav}
            <LayoutToggle layout={layout} onChange={setLayout} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-lg border border-border bg-card">
            {headerContent}
            {bodyContent}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
            <SplitPhotos images={exhibitImages} />
          </div>
        </div>
        {ebayOpen && <EbayModal exhibit={exhibit} onClose={() => setEbayOpen(false)} />}
        {similarOpen && <SimilarModal exhibit={exhibit} onClose={() => setSimilarOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Datalist for manufacturer autocomplete. Referenced via `list="manufacturers-list"`
          on the manufacturer inputs in the edit form and the title-row editor. */}
      {editing && manufacturers && (
        <datalist id="manufacturers-list">
          {manufacturers.map((m) => <option key={m} value={m} />)}
        </datalist>
      )}
      <div className="mb-4 flex items-center justify-between">
        <Link to={backTo} state={{ fromDetail: true }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('exhibit.backToExhibits')}
        </Link>
        <div className="flex items-center gap-2">
          {siblingNav}
          {hasImages && !editing && <LayoutToggle layout={layout} onChange={setLayout} />}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {headerContent}
        {hasImages && !editing && (
          <div className="border-b border-border p-5">
            <ImageGallery images={exhibitImages} />
          </div>
        )}
        {bodyContent}
      </div>
      {ebayOpen && <EbayModal exhibit={exhibit} onClose={() => setEbayOpen(false)} />}
      {similarOpen && <SimilarModal exhibit={exhibit} onClose={() => setSimilarOpen(false)} />}
    </div>
  );
}

function formatAttrKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}
