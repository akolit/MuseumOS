import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, Check, X, Filter, Loader2, Rows3, LayoutGrid, ImageOff, Heart, Download, CheckSquare, Square, Pencil, ChevronDown, ChevronUp, MapPin, Plus, Printer, ArrowUpDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fieldLabel } from '@/lib/category-fields';
import { WikidataEnrichModal, type EnrichPatch } from '@/components/wikidata-enrich';
import { useAuth } from '@/hooks/use-auth';
import { DonorPicker, type DonorOption } from '@/components/donor-picker';

interface CategorySchema {
  type: string;
  properties: Record<string, { type?: string; title?: string; titleEl?: string; enum?: string[]; suggestions?: string[]; autocomplete?: boolean }>;
}
interface Category { id: string; code: string; nameEn: string; nameEl: string; idPrefix: string; schema?: CategorySchema | null }
interface ExhibitRow {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  validated: boolean;
  published: boolean;
  functional: boolean | null;
  categoryId: string;
  category: { code: string; nameEn: string; nameEl: string };
  locationId: string | null;
  location: { code: string } | null;
  tags: { id: string; name: string; color: string | null }[];
  imageCount: number;
  primaryImageUrl: string | null;
  primaryThumbnailUrl: string | null;
  primaryGridUrl: string | null;
  createdAt: string;
  updatedAt: string;
  type: string | null;
  capacity: string | null;
}

type ViewMode = 'list' | 'grid';
type EditField = 'exhibitName' | 'manufacturer' | 'year';
// `type`, `capacity` and `location` are inline-editable too, but via dedicated
// controls (combobox / location select) rather than the plain text-cell path.
type EditCellField = EditField | 'type' | 'capacity' | 'location';
type ThumbSize = 'small' | 'large';
const VIEW_MODE_KEY = 'exhibits-view-mode';
const THUMB_SIZE_KEY = 'exhibits-thumb-size';

const THUMB_GRID_CLASSES: Record<ThumbSize, string> = {
  small: 'grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11',
  large: 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
};
interface SearchResult {
  items: ExhibitRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

const PAGE_SIZE = 50;

export function ExhibitsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  const [showFilters, setShowFilters] = useState(false);
  // Custom attribute-filter rows the user has added for the current category.
  // The active values live in the URL (`attrs`); this just tracks which rows
  // are shown, and is remembered per category in localStorage.
  const [addedAttrKeys, setAddedAttrKeys] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'list';
  });
  const [thumbSize, setThumbSize] = useState<ThumbSize>(() => {
    return (localStorage.getItem(THUMB_SIZE_KEY) as ThumbSize) || 'large';
  });
  const [exportOpen, setExportOpen] = useState(false);

  // ── List-view hover image preview ──────────────────────────────────────
  // Rows already carry primaryThumbnailUrl (320px webp), so hovering an ID or
  // name shows an instant, anchored "peek" card — the thumb is preloaded so it
  // paints in one frame, and the card sits in a fixed spot beside the row
  // (not chasing the cursor). A short hover-intent delay avoids flashing while
  // sweeping down the list.
  const PREVIEW_W = 188;
  const PREVIEW_H = 184;
  const [hoverPreview, setHoverPreview] = useState<
    { url: string; displayId: string; name: string; left: number; top: number; origin: 'left' | 'right' } | null
  >(null);
  const hoverActive = useRef(false);
  const previewShowTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewHideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showPreview(ex: ExhibitRow, cell: HTMLElement) {
    if (viewMode !== 'list' || !ex.primaryThumbnailUrl) return;
    clearTimeout(previewHideTimer.current);
    const url = ex.primaryThumbnailUrl;
    new Image().src = url; // warm the browser cache so the card paints instantly
    // Anchor to the right of the Name column so it's the same spot whether the
    // ID or the name cell is hovered.
    const anchor = (cell.closest('tr')?.children?.[2] as HTMLElement | undefined) ?? cell;
    const r = anchor.getBoundingClientRect();
    const place = () => {
      let left = r.right + 10;
      let origin: 'left' | 'right' = 'left';
      if (left + PREVIEW_W > window.innerWidth - 8) { left = r.left - PREVIEW_W - 10; origin = 'right'; }
      const top = Math.max(8, Math.min(r.top + r.height / 2 - PREVIEW_H / 2, window.innerHeight - PREVIEW_H - 8));
      setHoverPreview({ url, displayId: ex.displayId, name: ex.exhibitName, left, top, origin });
      hoverActive.current = true;
    };
    if (hoverActive.current) place(); // already open → re-anchor instantly (ID ↔ name)
    else { clearTimeout(previewShowTimer.current); previewShowTimer.current = setTimeout(place, 70); }
  }
  function hidePreview() {
    clearTimeout(previewShowTimer.current);
    previewHideTimer.current = setTimeout(() => { setHoverPreview(null); hoverActive.current = false; }, 80);
  }
  useEffect(() => {
    if (!hoverPreview) return;
    const dismiss = () => { setHoverPreview(null); hoverActive.current = false; };
    window.addEventListener('scroll', dismiss, true);
    return () => window.removeEventListener('scroll', dismiss, true);
  }, [hoverPreview]);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [imagesMenuOpen, setImagesMenuOpen] = useState(false);
  const imagesMenuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newExhibitOpen, setNewExhibitOpen] = useState(false);
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('exhibit:write');

  // --- Inline row editing (list view) ---------------------------------------
  // With edit mode on, clicking a name/manufacturer/year cell edits it in place
  // and the validated tick toggles; each cell saves on its own via PATCH with an
  // optimistic cache update (rolled back on error). Row-click navigation is
  // suspended while editing so cell clicks don't open the detail page.
  const [editMode, setEditMode] = useState(false);
  const [editCell, setEditCell] = useState<{ id: string; field: EditCellField } | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function patchRow(id: string, changes: Partial<ExhibitRow>) {
    queryClient.setQueryData<{ pages: SearchResult[]; pageParams: unknown[] }>(
      ['exhibits-infinite', filterKey],
      (old) => (old ? { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((it) => (it.id === id ? { ...it, ...changes } : it)) })) } : old),
    );
  }

  async function commitField(ex: ExhibitRow, field: EditField, raw: string) {
    setEditCell(null);
    let value: string | number | null;
    if (field === 'year') {
      const v = raw.trim();
      if (!v) value = null;
      else { const n = parseInt(v, 10); if (isNaN(n) || n < 1800 || n > 2100) { toast.error(t('exhibits.inlineYearError')); return; } value = n; }
    } else {
      const v = raw.trim();
      if (field === 'exhibitName' && !v) { toast.error(t('exhibits.inlineNameError')); return; }
      value = field === 'manufacturer' ? (v || null) : v;
    }
    const prev = (ex[field] ?? null) as string | number | null;
    if (value === prev) return;
    patchRow(ex.id, { [field]: value } as Partial<ExhibitRow>);
    setSavingId(ex.id);
    try { await api.patch(`/exhibits/${ex.id}`, { [field]: value }); }
    catch (e) { patchRow(ex.id, { [field]: prev } as Partial<ExhibitRow>); toast.error(e instanceof Error ? e.message : t('toast.error')); }
    finally { setSavingId(null); }
  }

  async function toggleValidatedInline(ex: ExhibitRow) {
    const next = !ex.validated;
    patchRow(ex.id, { validated: next });
    setSavingId(ex.id);
    try { await api.patch(`/exhibits/${ex.id}`, { validated: next }); }
    catch (e) { patchRow(ex.id, { validated: ex.validated }); toast.error(e instanceof Error ? e.message : t('toast.error')); }
    finally { setSavingId(null); }
  }

  // `type` / `capacity` live in the JSONB `attributes` column, which a PATCH
  // replaces wholesale (it doesn't merge). The search row only carries those two
  // fields, not the full attributes, so we fetch the exhibit, merge the new value
  // in, and patch the whole object back — preserving sibling attribute keys.
  async function commitAttrInline(ex: ExhibitRow, key: 'type' | 'capacity', raw: string) {
    setEditCell(null);
    const value = raw.trim();
    const next = value || null;
    const prev = ex[key] ?? null;
    if (next === prev) return;
    patchRow(ex.id, { [key]: next } as Partial<ExhibitRow>);
    setSavingId(ex.id);
    try {
      const full = await api.get<{ attributes?: Record<string, unknown> }>(`/exhibits/${ex.id}`);
      const attributes = { ...(full.attributes ?? {}) };
      if (next) attributes[key] = next;
      else delete attributes[key];
      await api.patch(`/exhibits/${ex.id}`, { attributes });
      // Surface a newly-entered value in the type/capacity dropdowns right away.
      queryClient.invalidateQueries({ queryKey: ['attr-values'] });
    } catch (e) {
      patchRow(ex.id, { [key]: prev } as Partial<ExhibitRow>);
      toast.error(e instanceof Error ? e.message : t('toast.error'));
    } finally { setSavingId(null); }
  }

  async function commitLocationInline(ex: ExhibitRow, locId: string) {
    setEditCell(null);
    const next = locId || null;
    const prevId = ex.locationId ?? null;
    if (next === prevId) return;
    const prevLoc = ex.location;
    const loc = locations?.find((l) => l.id === next);
    patchRow(ex.id, { locationId: next, location: loc ? { code: loc.code } : null });
    setSavingId(ex.id);
    try { await api.patch(`/exhibits/${ex.id}`, { locationId: next }); }
    catch (e) { patchRow(ex.id, { locationId: prevId, location: prevLoc }); toast.error(e instanceof Error ? e.message : t('toast.error')); }
    finally { setSavingId(null); }
  }

  // Renders an inline-editable cell: a click-to-edit button, or an input while
  // this cell is the active one.
  function editableCell(ex: ExhibitRow, field: EditField, display: ReactNode, extraClass = '') {
    if (editCell?.id === ex.id && editCell.field === field) {
      return (
        <input
          autoFocus
          type={field === 'year' ? 'number' : 'text'}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitField(ex, field, draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitField(ex, field, draft); }
            else if (e.key === 'Escape') { e.preventDefault(); setEditCell(null); }
          }}
          className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm outline-none"
        />
      );
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditCell({ id: ex.id, field }); setDraft(ex[field] == null ? '' : String(ex[field])); }}
        className={`-mx-1 block w-full rounded border-b border-dashed border-transparent px-1 text-left hover:border-muted-foreground/40 hover:bg-primary/5 ${extraClass}`}
      >
        {display}
      </button>
    );
  }

  const cellEditCls = '-mx-1 block w-full rounded border-b border-dashed border-transparent px-1 text-left hover:border-muted-foreground/40 hover:bg-primary/5';
  const cellInputCls = 'w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm outline-none';

  // Inline `type` editor — always a free-text combobox so you can pick a known
  // value (enum + suggestions + values already in use) or type a brand-new one
  // and see it, regardless of how the row's category schema defines `type`.
  function typeCell(ex: ExhibitRow) {
    const typeDef = categoryById[ex.categoryId]?.schema?.properties?.type;
    if (!typeDef) return <span className="text-muted-foreground/40">—</span>;
    const active = editCell?.id === ex.id && editCell.field === 'type';
    if (active) {
      const listId = `type-list-${ex.id}`;
      return (
        <>
          <input autoFocus list={listId} value={draft}
            onClick={(e) => e.stopPropagation()} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitAttrInline(ex, 'type', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitAttrInline(ex, 'type', draft); }
              else if (e.key === 'Escape') { e.preventDefault(); setEditCell(null); }
            }}
            className={cellInputCls} />
          <datalist id={listId}>
            {[...new Set([...(typeValues?.type ?? []), ...(typeDef.enum ?? []), ...(typeDef.suggestions ?? [])])].map((o) => <option key={o} value={o} />)}
          </datalist>
        </>
      );
    }
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditCell({ id: ex.id, field: 'type' }); setDraft(ex.type ?? ''); }} className={cellEditCls}>
        {ex.type ?? <span className="text-muted-foreground/40">—</span>}
      </button>
    );
  }

  // Inline `capacity` editor: free-text with a datalist of existing values for
  // the category (capacity is a freeform string — e.g. "256MB", "8GB").
  function capacityCell(ex: ExhibitRow) {
    const active = editCell?.id === ex.id && editCell.field === 'capacity';
    if (active) {
      const listId = `capacity-list-${ex.id}`;
      return (
        <>
          <input autoFocus list={listId} value={draft}
            onClick={(e) => e.stopPropagation()} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitAttrInline(ex, 'capacity', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitAttrInline(ex, 'capacity', draft); }
              else if (e.key === 'Escape') { e.preventDefault(); setEditCell(null); }
            }}
            className={cellInputCls} />
          <datalist id={listId}>{(capacityValues?.capacity ?? []).map((o) => <option key={o} value={o} />)}</datalist>
        </>
      );
    }
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditCell({ id: ex.id, field: 'capacity' }); setDraft(ex.capacity ?? ''); }} className={cellEditCls}>
        {ex.capacity ?? <span className="text-muted-foreground/40">—</span>}
      </button>
    );
  }

  // Inline location editor: a <select> of all locations (plus a clear option).
  function locationCell(ex: ExhibitRow) {
    const active = editCell?.id === ex.id && editCell.field === 'location';
    if (active) {
      return (
        <select autoFocus value={draft} onClick={(e) => e.stopPropagation()}
          onChange={(e) => commitLocationInline(ex, e.target.value)} onBlur={() => setEditCell(null)} className={cellInputCls}>
          <option value="">—</option>
          {locations?.map((l) => <option key={l.id} value={l.id}>{l.code}{l.nameEn ? ` — ${l.nameEn}` : ''}</option>)}
        </select>
      );
    }
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditCell({ id: ex.id, field: 'location' }); setDraft(ex.locationId ?? ''); }} className={cellEditCls}>
        {ex.location?.code ?? <span className="text-muted-foreground/40">—</span>}
      </button>
    );
  }

  // Persist scroll position when leaving for a detail page; restore on return.
  function openExhibit(id: string, qs: string) {
    const main = document.querySelector('main');
    // Ordered ids of the list as currently shown — lets the detail page move to
    // the previous/next exhibit with ←/→. Mirrored to sessionStorage so it
    // survives reloads and sibling-to-sibling jumps.
    const ids = allItems.map((i) => i.id);
    sessionStorage.setItem('exhibits-last-search', qs);
    sessionStorage.setItem('exhibits-last-scroll', String(main?.scrollTop ?? 0));
    sessionStorage.setItem('exhibits-sibling-ids', JSON.stringify(ids));
    navigate(`/exhibits/${id}`, { state: { fromSearch: qs, siblingIds: ids } });
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  function changeThumbSize(size: ThumbSize) {
    setThumbSize(size);
    localStorage.setItem(THUMB_SIZE_KEY, size);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  function exportData(format: 'csv' | 'json') {
    const p = new URLSearchParams();
    p.set('format', format);
    if (q) p.set('q', q);
    if (categoryId) p.set('categoryId', categoryId);
    if (donorId) p.set('donorId', donorId);
    if (locationId) p.set('locationId', locationId);
    if (validated) p.set('validated', validated);
    if (yearFrom) p.set('yearFrom', yearFrom);
    if (yearTo) p.set('yearTo', yearTo);
    if (hasImages) p.set('hasImages', hasImages);
    if (typeFilter) p.set('type', typeFilter);
    if (attrsParam) p.set('attrs', attrsParam);
    // Trigger download via direct navigation (cookies auto-included).
    window.location.href = `/api/exhibits/export?${p.toString()}`;
    setExportOpen(false);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (exportOpen && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (categoryMenuOpen && categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
      if (imagesMenuOpen && imagesMenuRef.current && !imagesMenuRef.current.contains(e.target as Node)) {
        setImagesMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [exportOpen, categoryMenuOpen, imagesMenuOpen]);

  const navigate = useNavigate();
  const location = useLocation();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const q = params.get('q') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const donorId = params.get('donorId') ?? '';
  const locationId = params.get('locationId') ?? '';
  const validated = params.get('validated') ?? '';
  const yearFrom = params.get('yearFrom') ?? '';
  const yearTo = params.get('yearTo') ?? '';
  const hasImages = params.get('hasImages') ?? '';
  const typeFilter = params.get('type') ?? '';
  const sortBy = params.get('sortBy') ?? 'displayId';
  const sortOrder = (params.get('sortOrder') ?? 'asc') as 'asc' | 'desc';
  const attrsParam = params.get('attrs') ?? '';
  const attrs = useMemo<Record<string, string>>(() => {
    if (!attrsParam) return {};
    try {
      const o = JSON.parse(attrsParam);
      return o && typeof o === 'object' ? (o as Record<string, string>) : {};
    } catch {
      return {};
    }
  }, [attrsParam]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (searchInput.length === 1) return;
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput) next.set('q', searchInput);
      else next.delete('q');
      next.delete('page');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const filterKey = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (categoryId) p.set('categoryId', categoryId);
    if (donorId) p.set('donorId', donorId);
    if (locationId) p.set('locationId', locationId);
    if (validated) p.set('validated', validated);
    if (yearFrom) p.set('yearFrom', yearFrom);
    if (yearTo) p.set('yearTo', yearTo);
    if (hasImages) p.set('hasImages', hasImages);
    if (typeFilter) p.set('type', typeFilter);
    if (attrsParam) p.set('attrs', attrsParam);
    p.set('sortBy', sortBy);
    p.set('sortOrder', sortOrder);
    return p.toString();
  }, [q, categoryId, donorId, locationId, validated, yearFrom, yearTo, hasImages, typeFilter, attrsParam, sortBy, sortOrder]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['exhibits-infinite', filterKey],
    queryFn: ({ pageParam = 1 }) => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      p.set('page', String(pageParam));
      p.set('limit', String(PAGE_SIZE));
      p.set('sortBy', sortBy);
      p.set('sortOrder', sortOrder);
      if (categoryId) p.set('categoryId', categoryId);
      if (donorId) p.set('donorId', donorId);
      if (locationId) p.set('locationId', locationId);
      if (validated) p.set('validated', validated);
      if (yearFrom) p.set('yearFrom', yearFrom);
      if (yearTo) p.set('yearTo', yearTo);
      if (hasImages) p.set('hasImages', hasImages);
      if (typeFilter) p.set('type', typeFilter);
      if (attrsParam) p.set('attrs', attrsParam);
      return api.get<SearchResult>(`/exhibits?${p.toString()}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });
  // Schema lookup by category id — drives the inline `type` editor, since rows
  // in the list can span categories with different type fields.
  const categoryById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  // Capacity is a category-specific attribute (only RAMs / Storage). Show its
  // column only when the list is filtered to a category that defines it, so the
  // table stays clean for the categories that don't.
  const showCapacityColumn = useMemo(
    () => !!categoryById[categoryId]?.schema?.properties?.capacity,
    [categoryById, categoryId],
  );
  // Distinct existing capacity values for the selected category, to power the
  // inline capacity editor's datalist (so values like "256MB" get reused).
  const { data: capacityValues } = useQuery({
    queryKey: ['attr-values', categoryId, 'capacity'],
    queryFn: () => api.get<Record<string, string[]>>(`/exhibits/attribute-values?categoryId=${categoryId}&keys=capacity`),
    enabled: showCapacityColumn && !!categoryId,
  });

  // The selected category's `type` field definition (drives both the filter and
  // the inline type editor's options).
  const filterTypeDef = categoryById[categoryId]?.schema?.properties?.type;
  const hasTypeField = !!filterTypeDef;
  // Type is a free-text combobox everywhere, so users add new values over time.
  // Pull the live distinct values so the filter can offer them too — otherwise a
  // freshly-typed type can't be selected in the filter.
  const { data: typeValues, isFetched: typeValuesFetched } = useQuery({
    queryKey: ['attr-values', categoryId, 'type'],
    queryFn: () => api.get<Record<string, string[]>>(`/exhibits/attribute-values?categoryId=${categoryId}&keys=type`),
    enabled: !!categoryId && hasTypeField,
  });

  // Type values for the filter: live distinct values merged with the schema's
  // enum + suggestions (so both curated and freely-added types are selectable).
  const filterTypeOptions = useMemo(() => {
    if (!filterTypeDef) return [];
    return [...new Set([...(typeValues?.type ?? []), ...(filterTypeDef.enum ?? []), ...(filterTypeDef.suggestions ?? [])])];
  }, [filterTypeDef, typeValues]);
  // Clear the Type filter if it no longer applies to the selected category.
  useEffect(() => {
    // Wait until live type values have loaded — otherwise we'd clear a valid
    // custom value from the URL before its option exists.
    if (hasTypeField && !typeValuesFetched) return;
    if (typeFilter && filterTypeOptions.length > 0 && !filterTypeOptions.includes(typeFilter)) {
      const next = new URLSearchParams(params);
      next.delete('type');
      next.delete('page');
      setParams(next, { replace: true });
    }
  }, [filterTypeOptions, typeFilter, hasTypeField, typeValuesFetched]);

  // --- Category attribute filters ----------------------------------------
  const ATTR_KEYS_PREFIX = 'exhibit-attr-filters:';
  const selectedCategory = useMemo(
    () => categories?.find((c) => c.id === categoryId),
    [categories, categoryId],
  );
  // Filterable attribute fields for the selected category. `type` is excluded —
  // it already has its own dedicated filter above.
  const attrFields = useMemo(
    () =>
      Object.entries(selectedCategory?.schema?.properties ?? {}).filter(
        ([key]) => key !== 'type',
      ),
    [selectedCategory],
  );
  const attrFieldMap = useMemo(() => Object.fromEntries(attrFields), [attrFields]);

  // Hydrate the shown attribute-filter rows when the category changes: union of
  // what's remembered for this category and whatever the URL already carries.
  useEffect(() => {
    if (!categoryId) {
      setAddedAttrKeys([]);
      return;
    }
    let stored: string[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(ATTR_KEYS_PREFIX + categoryId) ?? '[]');
    } catch {
      stored = [];
    }
    const merged = Array.from(new Set([...stored, ...Object.keys(attrs)]));
    // Keep only keys that still exist as fields on this category.
    setAddedAttrKeys(merged.filter((k) => k in (selectedCategory?.schema?.properties ?? {}) && k !== 'type'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, selectedCategory]);

  function persistAttrKeys(keys: string[]) {
    setAddedAttrKeys(keys);
    if (categoryId) localStorage.setItem(ATTR_KEYS_PREFIX + categoryId, JSON.stringify(keys));
  }
  function addAttrFilter(key: string) {
    if (!key || addedAttrKeys.includes(key)) return;
    persistAttrKeys([...addedAttrKeys, key]);
  }
  function removeAttrFilter(key: string) {
    persistAttrKeys(addedAttrKeys.filter((k) => k !== key));
    updateAttr(key, ''); // also drop its active value from the URL
  }
  function updateAttr(key: string, value: string) {
    const next = new URLSearchParams(params);
    const obj = { ...attrs };
    if (value) obj[key] = value;
    else delete obj[key];
    if (Object.keys(obj).length > 0) next.set('attrs', JSON.stringify(obj));
    else next.delete('attrs');
    next.delete('page');
    setParams(next);
  }

  // Distinct existing values for the free-text attribute rows, to power their
  // datalist suggestions.
  const attrValueKeys = useMemo(
    () =>
      addedAttrKeys.filter((k) => {
        const d = attrFieldMap[k];
        return d && !d.enum && d.type !== 'boolean' && d.type !== 'number';
      }),
    [addedAttrKeys, attrFieldMap],
  );
  const { data: attrValues } = useQuery({
    queryKey: ['attr-values', categoryId, attrValueKeys.join(',')],
    queryFn: () =>
      api.get<Record<string, string[]>>(
        `/exhibits/attribute-values?categoryId=${categoryId}&keys=${encodeURIComponent(attrValueKeys.join(','))}`,
      ),
    enabled: !!categoryId && attrValueKeys.length > 0,
  });

  const { data: donors } = useQuery({
    queryKey: ['donors'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/donors'),
  });
  const activeDonor = donorId ? donors?.find((d) => d.id === donorId) : undefined;

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<{ id: string; code: string; nameEn: string | null }[]>('/locations'),
    // Loaded for the location filter's active label, and for the inline location
    // editor's dropdown when row edit mode is on.
    enabled: !!locationId || editMode,
  });
  const activeLocation = locationId ? locations?.find((l) => l.id === locationId) : undefined;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Grid-only thumbnail zoom: keyboard `+` / `-` (and `=` for convenience),
  // plus Ctrl/Cmd + wheel. No-ops in list view.
  useEffect(() => {
    if (viewMode !== 'grid') return;

    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        changeThumbSize('large');
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changeThumbSize('small');
      }
    }

    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.deltaY < 0) changeThumbSize('large');
      else if (e.deltaY > 0) changeThumbSize('small');
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [viewMode]);

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  // Restore scroll position once when coming back from an exhibit detail page
  // (via its "Back to exhibits" link, which sets state.fromDetail).
  // Navigating from the sidebar Exhibits link has no such state, so it scrolls
  // to top as expected. We also clear the saved scroll value on a non-detail
  // entry so the next visit from the sidebar can't accidentally pick it up.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (allItems.length === 0) return;
    const fromDetail = (location.state as { fromDetail?: boolean } | null)?.fromDetail;
    if (!fromDetail) {
      sessionStorage.removeItem('exhibits-last-scroll');
      // Reset scroll — the <main> wrapper persists across sibling routes
      // so navigating from /exhibits/<id> via the sidebar doesn't auto-scroll.
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
      scrollRestoredRef.current = true;
      return;
    }
    const raw = sessionStorage.getItem('exhibits-last-scroll');
    if (raw != null) {
      const y = parseInt(raw);
      if (!isNaN(y)) {
        const main = document.querySelector('main');
        // requestAnimationFrame so the grid/list has had a chance to lay out.
        requestAnimationFrame(() => {
          if (main) main.scrollTop = y;
        });
      }
      sessionStorage.removeItem('exhibits-last-scroll');
    }
    scrollRestoredRef.current = true;
  }, [allItems.length, location.state]);
  const total = data?.pages[0]?.total ?? 0;

  const allLoadedSelected = allItems.length > 0 && allItems.every((it) => selected.has(it.id));
  function toggleSelectAllLoaded() {
    if (allLoadedSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const it of allItems) next.delete(it.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const it of allItems) next.add(it.id);
        return next;
      });
    }
  }

  const [selectingAll, setSelectingAll] = useState(false);
  const [selectAllNotice, setSelectAllNotice] = useState<string | null>(null);
  async function selectAllMatching() {
    setSelectingAll(true);
    setSelectAllNotice(null);
    try {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (categoryId) p.set('categoryId', categoryId);
      if (donorId) p.set('donorId', donorId);
      if (locationId) p.set('locationId', locationId);
      if (validated) p.set('validated', validated);
      if (yearFrom) p.set('yearFrom', yearFrom);
      if (yearTo) p.set('yearTo', yearTo);
      if (hasImages) p.set('hasImages', hasImages);
      if (typeFilter) p.set('type', typeFilter);
      if (attrsParam) p.set('attrs', attrsParam);
      const res = await api.get<{ ids: string[]; total: number; capped: boolean }>(
        `/exhibits/match-ids?${p.toString()}`,
      );
      setSelected(new Set(res.ids));
      if (res.capped) setSelectAllNotice(t('exhibits.selectAllCapped'));
    } finally {
      setSelectingAll(false);
    }
  }

  const bulkMutation = useMutation({
    mutationFn: (input: { ids: string[]; update: Record<string, unknown> }) =>
      api.post('/exhibits/bulk', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibits-infinite'] });
      setBulkOpen(false);
      toast.success(t('toast.bulkUpdated', { count: selected.size }));
      setSelected(new Set());
    },
    onError: () => toast.error(t('toast.error')),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  }

  // Toggle sort: clicking the same column flips direction; a new column starts asc.
  function toggleSort(field: string) {
    const next = new URLSearchParams(params);
    if (sortBy === field) {
      next.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sortBy', field);
      next.set('sortOrder', 'asc');
    }
    next.delete('page');
    setParams(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('exhibits.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {data ? t('exhibits.count', { count: total }) : t('common.loading')}
          </p>
        </div>
        <button
          onClick={() => setNewExhibitOpen(true)}
          className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('exhibits.addExhibit')}
        </button>
      </div>

      {activeDonor && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Heart className="h-4 w-4 text-primary" />
          <span>
            {t('exhibits.showingDonatedBy')}{' '}
            <span className="font-semibold">{activeDonor.name}</span>
          </span>
          <button
            onClick={() => updateParam('donorId', '')}
            className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      {activeLocation && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span>
            {t('exhibits.showingAtLocation')}{' '}
            <span className="font-mono font-semibold">{activeLocation.code}</span>
            {activeLocation.nameEn && <span className="text-muted-foreground"> · {activeLocation.nameEn}</span>}
          </span>
          <button
            onClick={() => updateParam('locationId', '')}
            className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> {t('common.clear')}
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('exhibits.searchPlaceholder')}
            className="w-full rounded-control border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm transition-colors ${
            showFilters ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'
          }`}
        >
          <Filter className="h-4 w-4" />
          {t('common.filters')}
        </button>
        <div className="flex rounded-control border border-input">
          <button
            onClick={() => changeViewMode('list')}
            className={`rounded-l-control p-2 transition-colors ${
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            title={t('exhibits.viewList')}
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => changeViewMode('grid')}
            className={`rounded-r-control p-2 transition-colors ${
              viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            title={t('exhibits.viewGrid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        {canEdit && viewMode === 'list' && (
          <button
            onClick={() => { setEditMode((v) => !v); setEditCell(null); }}
            className={`flex items-center gap-1.5 rounded-control border p-2 text-sm transition-colors ${
              editMode ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'
            }`}
            title={t('exhibits.editResults')}
          >
            <Pencil className="h-4 w-4" />
            {editMode && <span className="pr-1 text-xs font-medium">{t('exhibits.editing')}</span>}
          </button>
        )}
        {/* Grid thumb size: keyboard +/- and Ctrl/Cmd+wheel — see effect below */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setExportOpen((o) => !o)}
            disabled={total === 0}
            title="Export current results"
            className="flex items-center gap-1.5 rounded-control border border-input px-3 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {t('exhibits.export')}
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                {t('exhibits.exportMatching', { count: total })}
              </div>
              <button
                onClick={() => exportData('csv')}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-mono text-xs text-primary">CSV</span>
                <span>{t('exhibits.exportCsv')}</span>
              </button>
              <button
                onClick={() => exportData('json')}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-mono text-xs text-primary">JSON</span>
                <span>{t('exhibits.exportJson')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.category')}</label>
            <select
              value={categoryId}
              onChange={(e) => updateParam('categoryId', e.target.value)}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t('exhibits.filters.allCategories')}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'el' ? c.nameEl : c.nameEn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.type')}</label>
            <select
              value={typeFilter}
              onChange={(e) => updateParam('type', e.target.value)}
              disabled={filterTypeOptions.length === 0}
              title={filterTypeOptions.length === 0 ? (t('exhibits.filters.typeNeedsCategory') as string) : undefined}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">{t('exhibits.filters.allTypes')}</option>
              {filterTypeOptions.map((tv) => (
                <option key={tv} value={tv}>{tv}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.donor')}</label>
            <select
              value={donorId}
              onChange={(e) => updateParam('donorId', e.target.value)}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t('exhibits.filters.allDonors')}</option>
              {donors?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.validated')}</label>
            <select
              value={validated}
              onChange={(e) => updateParam('validated', e.target.value)}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t('common.any')}</option>
              <option value="true">{t('common.yes')}</option>
              <option value="false">{t('common.no')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.yearFrom')}</label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => updateParam('yearFrom', e.target.value)}
              placeholder={t('common.placeholderYear') as string}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.yearTo')}</label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => updateParam('yearTo', e.target.value)}
              placeholder={t('common.placeholderYear') as string}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.filters.hasImage')}</label>
            <select
              value={hasImages}
              onChange={(e) => updateParam('hasImages', e.target.value)}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t('common.any')}</option>
              <option value="true">{t('common.yes')}</option>
              <option value="false">{t('common.no')}</option>
            </select>
          </div>

          {/* User-added attribute filters, scoped to the selected category. */}
          {addedAttrKeys.map((key) => {
            const def = attrFieldMap[key];
            if (!def) return null;
            const value = attrs[key] ?? '';
            return (
              <div key={key}>
                <label className="mb-1 flex items-center justify-between gap-1 text-xs font-medium text-muted-foreground">
                  <span className="truncate">{fieldLabel(def, lang, key)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttrFilter(key)}
                    title={t('common.remove') as string}
                    className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </label>
                {def.enum ? (
                  <select
                    value={value}
                    onChange={(e) => updateAttr(key, e.target.value)}
                    className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">{t('common.any')}</option>
                    {def.enum.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : def.type === 'boolean' ? (
                  <select
                    value={value}
                    onChange={(e) => updateAttr(key, e.target.value)}
                    className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">{t('common.any')}</option>
                    <option value="true">{t('common.yes')}</option>
                    <option value="false">{t('common.no')}</option>
                  </select>
                ) : def.type === 'number' ? (
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => updateAttr(key, e.target.value)}
                    className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                  />
                ) : (
                  <>
                    <input
                      list={`attr-dl-${key}`}
                      value={value}
                      onChange={(e) => updateAttr(key, e.target.value)}
                      className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <datalist id={`attr-dl-${key}`}>
                      {[...new Set([...(attrValues?.[key] ?? []), ...(def.suggestions ?? [])])]
                        .slice(0, 1000)
                        .map((v) => (
                          <option key={v} value={v} />
                        ))}
                    </datalist>
                  </>
                )}
              </div>
            );
          })}

          {/* Add-filter picker: choose another attribute of this category. */}
          <div className="flex flex-col">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">&nbsp;</label>
            <select
              value=""
              onChange={(e) => {
                addAttrFilter(e.target.value);
                e.target.value = '';
              }}
              disabled={!categoryId || attrFields.every(([k]) => addedAttrKeys.includes(k))}
              title={!categoryId ? (t('exhibits.filters.addFilterHint') as string) : undefined}
              className="w-full rounded-control border border-dashed border-input bg-background px-2 py-1.5 text-sm text-muted-foreground disabled:opacity-50"
            >
              <option value="">+ {t('exhibits.filters.addFilter')}</option>
              {attrFields
                .filter(([k]) => !addedAttrKeys.includes(k))
                .map(([k, d]) => (
                  <option key={k} value={k}>{fieldLabel(d, lang, k)}</option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="mt-4">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>
          ) : allItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t('exhibits.noResults')}</div>
          ) : (
            <div className={THUMB_GRID_CLASSES[thumbSize]}>
              {allItems.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => openExhibit(ex.id, params.toString())}
                  className={`group flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition-all hover:shadow-md ${
                    selected.has(ex.id) ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(ex.id); }}
                      className={`absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md backdrop-blur-sm transition-opacity ${
                        selected.has(ex.id)
                          ? 'bg-primary text-primary-foreground opacity-100'
                          : 'bg-white/70 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-white'
                      }`}
                      title={t(selected.has(ex.id) ? 'common.deselect' : 'common.select') as string}
                    >
                      {selected.has(ex.id) ? <Check className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </button>
                    {ex.primaryImageUrl ? (
                      <img
                        src={
                          thumbSize === 'large'
                            ? (ex.primaryGridUrl ?? ex.primaryThumbnailUrl ?? ex.primaryImageUrl)
                            : (ex.primaryThumbnailUrl ?? ex.primaryImageUrl)
                        }
                        alt={ex.exhibitName}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (ex.primaryImageUrl && img.src !== ex.primaryImageUrl) {
                            img.src = ex.primaryImageUrl;
                          }
                        }}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <ImageOff className="h-8 w-8" />
                      </div>
                    )}
                    {ex.imageCount > 1 && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {ex.imageCount}
                      </span>
                    )}
                    {ex.validated && (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-green-600 p-1 text-white" title={t('exhibit.validated') as string}>
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  {thumbSize === 'large' ? (
                    <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                      <span className="font-mono text-xs text-primary">{ex.displayId}</span>
                      <span className="line-clamp-2 text-sm font-medium leading-tight">{ex.exhibitName}</span>
                      {ex.manufacturer && (
                        <span className="line-clamp-1 text-xs text-muted-foreground">{ex.manufacturer}</span>
                      )}
                      <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">{lang === 'el' ? ex.category.nameEl : ex.category.nameEn}</span>
                        {ex.year && <span>· {ex.year}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-1.5 py-1" title={`${ex.displayId} · ${ex.exhibitName}`}>
                      <span className="font-mono text-[10px] leading-none text-primary">{ex.displayId}</span>
                      <span className="line-clamp-1 text-[11px] font-medium leading-tight">{ex.exhibitName}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'list' && (
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="w-10 px-3 py-2.5">
                <button
                  onClick={toggleSelectAllLoaded}
                  className="inline-flex items-center justify-center text-muted-foreground hover:text-primary"
                  title={t(allLoadedSelected ? 'common.deselect' : 'common.select') as string}
                >
                  {allLoadedSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="displayId" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.id')}</SortHeader>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="exhibitName" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.name')}</SortHeader>
              </th>
              <th className={`px-3 py-2.5 font-medium ${editMode ? 'min-w-[13rem]' : ''}`}>{t('exhibits.table.type')}</th>
              {showCapacityColumn && <th className={`px-3 py-2.5 font-medium ${editMode ? 'min-w-[8rem]' : ''}`}>{t('exhibits.table.capacity')}</th>}
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="manufacturer" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.manufacturer')}</SortHeader>
              </th>
              <th className="relative px-3 py-2.5 font-medium">
                <div className="inline-flex items-center gap-0.5">
                  <SortHeader field="category" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>
                    {t('exhibits.table.category')}
                  </SortHeader>
                  <div ref={categoryMenuRef} className="inline-block">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategoryMenuOpen((o) => !o); }}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                      categoryId ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                    title={categoryId ? t('exhibits.filters.clearCategoryFilter') : t('exhibits.filters.filterByCategory')}
                  >
                    {categoryId && (
                      <span className="rounded bg-primary px-1 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {(() => {
                          const c = categories?.find((cc) => cc.id === categoryId);
                          if (!c) return '—';
                          return lang === 'el' ? c.nameEl : c.nameEn;
                        })()}
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {categoryMenuOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-card font-normal shadow-lg">
                      <button
                        onClick={() => { updateParam('categoryId', ''); setCategoryMenuOpen(false); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                          !categoryId ? 'bg-primary/5 font-medium text-primary' : ''
                        }`}
                      >
                        <span>{t('exhibits.filters.allCategories')}</span>
                        {!categoryId && <Check className="h-4 w-4" />}
                      </button>
                      <div className="my-1 h-px bg-border" />
                      {categories?.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { updateParam('categoryId', c.id); setCategoryMenuOpen(false); }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                            categoryId === c.id ? 'bg-primary/5 font-medium text-primary' : ''
                          }`}
                        >
                          <span>{lang === 'el' ? c.nameEl : c.nameEn}</span>
                          {categoryId === c.id && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="year" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.year')}</SortHeader>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.created')}</SortHeader>
              </th>
              <th className="px-3 py-2.5 font-medium text-center">
                <SortHeader field="validated" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.validated')}</SortHeader>
              </th>
              <th className="relative px-3 py-2.5 text-center font-medium">
                <div className="inline-flex items-center gap-0.5">
                <SortHeader field="imageCount" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>
                  {t('exhibits.table.images')}
                </SortHeader>
                <div ref={imagesMenuRef} className="inline-block">
                  <button
                    onClick={(e) => { e.stopPropagation(); setImagesMenuOpen((o) => !o); }}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                      hasImages ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                    title={hasImages ? t('exhibits.filters.clearImagesFilter') : t('exhibits.filters.filterByImages')}
                  >
                    {hasImages && (
                      <span className="rounded bg-primary px-1 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {hasImages === 'true' ? 'Yes' : 'No'}
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {imagesMenuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-card font-normal shadow-lg">
                      {[
                        { value: '', label: t('exhibits.filters.anyImages') },
                        { value: 'true', label: t('exhibits.filters.yesHasImages') },
                        { value: 'false', label: t('exhibits.filters.noNoImages') },
                      ].map((opt) => (
                        <button
                          key={opt.value || 'any'}
                          onClick={() => { updateParam('hasImages', opt.value); setImagesMenuOpen(false); }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                            hasImages === opt.value ? 'bg-primary/5 font-medium text-primary' : ''
                          }`}
                        >
                          <span>{opt.label}</span>
                          {hasImages === opt.value && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                </div>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="location" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.location')}</SortHeader>
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortHeader field="tagCount" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort}>{t('exhibits.table.tags')}</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={showCapacityColumn ? 13 : 12} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
            ) : allItems.length === 0 ? (
              <tr><td colSpan={showCapacityColumn ? 13 : 12} className="px-3 py-8 text-center text-muted-foreground">{t('exhibits.noResults')}</td></tr>
            ) : (
              allItems.map((ex) => (
                <tr
                  key={ex.id}
                  onClick={editMode ? undefined : () => openExhibit(ex.id, params.toString())}
                  className={`border-b border-border last:border-0 transition-colors ${editMode ? '' : 'cursor-pointer'} ${
                    selected.has(ex.id) ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30'
                  } ${savingId === ex.id ? 'opacity-60' : ''}`}
                >
                  <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); toggleSelect(ex.id); }}>
                    {selected.has(ex.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs text-primary"
                    onMouseEnter={(e) => showPreview(ex, e.currentTarget)}
                    onMouseLeave={hidePreview}
                  >{ex.displayId}</td>
                  <td
                    className="max-w-[300px] truncate px-3 py-2"
                    onMouseEnter={(e) => { if (!editMode) showPreview(ex, e.currentTarget); }}
                    onMouseLeave={hidePreview}
                  >{editMode ? editableCell(ex, 'exhibitName', ex.exhibitName, 'truncate') : ex.exhibitName}</td>
                  <td className={`px-3 py-2 text-xs text-muted-foreground ${editMode ? 'min-w-[13rem]' : ''}`}>{editMode ? typeCell(ex) : (ex.type ?? '-')}</td>
                  {showCapacityColumn && <td className={`px-3 py-2 text-xs text-muted-foreground ${editMode ? 'min-w-[8rem]' : ''}`}>{editMode ? capacityCell(ex) : (ex.capacity ?? '-')}</td>}
                  <td className="px-3 py-2 text-muted-foreground">{editMode ? editableCell(ex, 'manufacturer', ex.manufacturer ?? <span className="text-muted-foreground/40">—</span>) : (ex.manufacturer ?? '-')}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{lang === 'el' ? ex.category.nameEl : ex.category.nameEn}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{editMode ? editableCell(ex, 'year', ex.year ?? <span className="text-muted-foreground/40">—</span>) : (ex.year ?? '-')}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(ex.createdAt).toLocaleDateString(lang === 'el' ? 'el-GR' : lang === 'fr' ? 'fr-FR' : 'en-GB')}</td>
                  <td className="px-3 py-2 text-center">
                    {editMode ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleValidatedInline(ex); }}
                        className="mx-auto flex h-6 w-6 items-center justify-center rounded hover:bg-primary/10"
                        title={t(ex.validated ? 'exhibits.markUnvalidated' : 'exhibits.markValidated') as string}
                      >
                        {ex.validated ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground/40" />}
                      </button>
                    ) : ex.validated ? (
                      <Check className="mx-auto h-4 w-4 text-green-600" />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-muted-foreground/30" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {ex.imageCount > 0 ? (
                      <span
                        className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary tabular-nums"
                        title={`${ex.imageCount} image${ex.imageCount === 1 ? '' : 's'}`}
                      >
                        {ex.imageCount}
                      </span>
                    ) : (
                      <X className="mx-auto h-4 w-4 text-muted-foreground/30" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{editMode ? locationCell(ex) : (ex.location?.code ?? '-')}</td>
                  <td className="max-w-[200px] px-3 py-2">
                    {ex.tags.length === 0 ? (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {ex.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full border px-1.5 py-0.5 text-[10px] leading-tight"
                            style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* List-view hover image preview — anchored, preloaded, instant. */}
      {hoverPreview && createPortal(
        <div
          className="exhibit-peek pointer-events-none fixed z-50 w-[188px]"
          style={{
            left: hoverPreview.left,
            top: hoverPreview.top,
            transformOrigin: hoverPreview.origin === 'left' ? 'left center' : 'right center',
          }}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="h-32 w-full bg-muted">
              <img src={hoverPreview.url} alt="" decoding="async" className="h-full w-full object-cover" />
            </div>
            <div className="px-2.5 py-1.5">
              <div className="font-mono text-[11px] text-primary">{hoverPreview.displayId}</div>
              <div className="line-clamp-2 text-xs leading-tight text-muted-foreground">{hoverPreview.name}</div>
            </div>
          </div>
          <style>{`@keyframes exhibitPeekIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.exhibit-peek{animation:exhibitPeekIn .13s cubic-bezier(.2,.8,.3,1)}@media (prefers-reduced-motion:reduce){.exhibit-peek{animation:none}}`}</style>
        </div>,
        document.body,
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-4 text-center">
        {isFetchingNextPage && (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {data && !hasNextPage && allItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('exhibits.showingAll', { count: total })}
          </p>
        )}
        {/* Spacer so the floating bulk bar doesn't cover the last row. */}
        {selected.size > 0 && <div className="h-20" />}
      </div>

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
          {selectAllNotice && (
            <div className="rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {selectAllNotice}
            </div>
          )}
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 shadow-xl">
            <span className="flex items-center gap-2 text-sm">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="font-semibold">{selected.size}</span> {t('exhibits.selected')}
            </span>
            {total > selected.size && (
              <button
                onClick={selectAllMatching}
                disabled={selectingAll}
                className="flex items-center gap-1.5 rounded-control border border-input px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                {selectingAll ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckSquare className="h-3 w-3" />
                )}
                {selectingAll
                  ? t('exhibits.selectingAll')
                  : t('exhibits.selectAllMatching', { count: total })}
              </button>
            )}
            <div className="h-5 w-px bg-border" />
            <button
              onClick={() => setBulkOpen(true)}
              className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Pencil className="h-3.5 w-3.5" /> {t('exhibits.bulkEdit')}
            </button>
            <button
              onClick={() => navigate(`/labels?ids=${[...selected].join(',')}`)}
              className="flex items-center gap-1.5 rounded-control border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Printer className="h-3.5 w-3.5" /> {t('labels.printSelected', { count: selected.size })}
            </button>
            <button
              onClick={clearSelection}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t('common.clear')}
            </button>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkOpen && (
        <BulkEditModal
          ids={Array.from(selected)}
          onClose={() => setBulkOpen(false)}
          onApply={(update) =>
            bulkMutation.mutate({ ids: Array.from(selected), update })
          }
          isSaving={bulkMutation.isPending}
          error={bulkMutation.error instanceof Error ? bulkMutation.error.message : null}
        />
      )}

      {/* New exhibit modal */}
      {newExhibitOpen && (
        <NewExhibitModal
          initialCategoryId={categoryId}
          onClose={() => setNewExhibitOpen(false)}
          onCreated={(id) => {
            setNewExhibitOpen(false);
            queryClient.invalidateQueries({ queryKey: ['exhibits-infinite'] });
            queryClient.invalidateQueries({ queryKey: ['exhibits-stats'] });
            queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
            queryClient.invalidateQueries({ queryKey: ['attr-values'] });
            navigate(`/exhibits/${id}`);
          }}
        />
      )}
    </div>
  );
}

interface LocationOption { id: string; code: string; nameEn: string | null }
interface TagOption { id: string; name: string; color: string | null }

type TagMode = 'add' | 'remove' | 'replace';

type BulkUpdate = {
  locationId?: string | null;
  validated?: boolean;
  published?: boolean;
  functional?: boolean;
  tags?: { mode: TagMode; tagIds: string[] };
};

function BulkEditModal({
  ids,
  onClose,
  onApply,
  isSaving,
  error,
}: {
  ids: string[];
  onClose: () => void;
  onApply: (update: BulkUpdate) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationOption[]>('/locations'),
  });
  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<TagOption[]>('/tags'),
  });

  // 'leave' = leave alone; 'set' = set to a specific id; 'clear' = set to null.
  const [locationMode, setLocationMode] = useState<'leave' | 'set' | 'clear'>('leave');
  const [locationId, setLocationId] = useState('');
  const [validated, setValidated] = useState<'leave' | 'true' | 'false'>('leave');
  const [published, setPublished] = useState<'leave' | 'true' | 'false'>('leave');
  const [functional, setFunctional] = useState<'leave' | 'true' | 'false'>('leave');
  const [tagsMode, setTagsMode] = useState<'leave' | TagMode>('leave');
  const [tagsSelected, setTagsSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function buildUpdate(): BulkUpdate {
    const u: BulkUpdate = {};
    if (locationMode === 'set' && locationId) u.locationId = locationId;
    else if (locationMode === 'clear') u.locationId = null;
    if (validated !== 'leave') u.validated = validated === 'true';
    if (published !== 'leave') u.published = published === 'true';
    if (functional !== 'leave') u.functional = functional === 'true';
    if (tagsMode !== 'leave') {
      u.tags = { mode: tagsMode, tagIds: Array.from(tagsSelected) };
    }
    return u;
  }

  const update = buildUpdate();
  const fieldCount = Object.keys(update).length;
  const canApply = fieldCount > 0 && ids.length > 0 && ids.length <= 500;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-medium">{t('exhibits.bulkEditTitle', { count: ids.length })}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-xs text-muted-foreground">{t('exhibits.bulkEditHint')}</p>

          {ids.length > 500 && (
            <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t('exhibits.bulkOverLimit', { count: ids.length })}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibit.location')}</label>
            <div className="flex gap-2">
              <select
                value={locationMode === 'leave' ? '' : locationMode === 'clear' ? '__clear__' : locationId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') { setLocationMode('leave'); setLocationId(''); }
                  else if (v === '__clear__') { setLocationMode('clear'); setLocationId(''); }
                  else { setLocationMode('set'); setLocationId(v); }
                }}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">{t('common.leaveUnchanged')}</option>
                <option value="__clear__">{t('exhibits.clearLocation')}</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}{l.nameEn ? ` — ${l.nameEn}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <BulkTriField label={t('exhibit.validated')} value={validated} onChange={setValidated} />
            <BulkTriField label={t('exhibit.published')} value={published} onChange={setPublished} />
            <BulkTriField label={t('exhibit.functional')} value={functional} onChange={setFunctional} />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('exhibits.tagsMode')}</label>
            <select
              value={tagsMode}
              onChange={(e) => setTagsMode(e.target.value as 'leave' | TagMode)}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="leave">{t('common.leaveUnchanged')}</option>
              <option value="add">{t('exhibits.tagsModeAdd')}</option>
              <option value="remove">{t('exhibits.tagsModeRemove')}</option>
              <option value="replace">{t('exhibits.tagsModeReplace')}</option>
            </select>
            {tagsMode !== 'leave' && (
              <div className="mt-2">
                {!allTags || allTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded border border-input bg-background p-2">
                    {allTags.map((tag) => {
                      const sel = tagsSelected.has(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setTagsSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(tag.id)) next.delete(tag.id);
                              else next.add(tag.id);
                              return next;
                            });
                          }}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                            sel ? 'bg-primary/10' : 'opacity-60 hover:opacity-100'
                          }`}
                          style={tag.color ? { borderColor: tag.color, color: sel ? tag.color : undefined } : {}}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onApply(update)}
            disabled={!canApply || isSaving}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('exhibits.applyFields', { count: fieldCount, label: t(fieldCount === 1 ? 'exhibits.fieldOne' : 'exhibits.fieldOther') })}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkTriField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'leave' | 'true' | 'false';
  onChange: (v: 'leave' | 'true' | 'false') => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'leave' | 'true' | 'false')}
        className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
      >
        <option value="leave">{t('common.leave')}</option>
        <option value="true">{t('common.yes')}</option>
        <option value="false">{t('common.no')}</option>
      </select>
    </div>
  );
}

function NewExhibitModal({
  initialCategoryId,
  onClose,
  onCreated,
}: {
  initialCategoryId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationOption[]>('/locations'),
  });
  const { data: donors } = useQuery({
    queryKey: ['donors'],
    queryFn: () => api.get<DonorOption[]>('/donors'),
  });
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => api.get<string[]>('/exhibits/manufacturers'),
    staleTime: 5 * 60_000,
  });

  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '');
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [year, setYear] = useState('');
  const [donorId, setDonorId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locSite, setLocSite] = useState('');
  // Default to today — operator can backfill if the exhibit was acquired earlier.
  const [acquiredAt, setAcquiredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  // When true, replace the Type <select> with a bare text input so the
  // operator can enter a value that isn't yet in the enum / attrValues.
  const [addingType, setAddingType] = useState(false);

  const categorySchema = categories?.find((c) => c.id === categoryId)?.schema ?? null;
  // Live distinct values for any `autocomplete` attribute (Books author/publishers/language).
  // `type` is always included so its combobox can offer existing values too.
  const autocompleteKeys = categorySchema
    ? [...new Set([
        ...Object.entries(categorySchema.properties).filter(([, p]) => p.autocomplete).map(([k]) => k),
        ...(categorySchema.properties.type ? ['type'] : []),
      ])]
    : [];
  const { data: attrValues } = useQuery({
    queryKey: ['attr-values', categoryId, autocompleteKeys.join(',')],
    queryFn: () => api.get<Record<string, string[]>>(
      `/exhibits/attribute-values?categoryId=${categoryId}&keys=${encodeURIComponent(autocompleteKeys.join(','))}`,
    ),
    enabled: !!categoryId && autocompleteKeys.length > 0,
  });
  // Attributes are category-specific — clear them when the category changes.
  useEffect(() => { setAttributes({}); }, [categoryId]);

  const wikidataQueryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const category = categories?.find((c) => c.id === categoryId) ?? null;
  const [wikidataOpen, setWikidataOpen] = useState(false);

  // Merge curator-approved Wikidata facts into the new-exhibit form.
  function applyWikidata(patch: EnrichPatch) {
    if (patch.manufacturer !== undefined) setManufacturer(patch.manufacturer);
    if (patch.year !== undefined) setYear(patch.year);
    if (Object.keys(patch.attributes).length > 0) setAttributes((a) => ({ ...a, ...patch.attributes }));
    setWikidataOpen(false);
    const count =
      (patch.manufacturer !== undefined ? 1 : 0) +
      (patch.year !== undefined ? 1 : 0) +
      Object.keys(patch.attributes).length;
    toast.success(t('exhibit.wikidataApplied', { count }));
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/exhibits', payload),
    onSuccess: (created) => {
      onCreated(created.id);
    },
    onError: (err: any) => {
      setError(err?.message ?? t('toast.createExhibitFailed'));
    },
  });

  const canSubmit = !!categoryId && name.trim().length > 0 && !createMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(attributes)) {
      if (v && v.trim()) attrs[k] = v.trim();
    }
    const payload: Record<string, unknown> = {
      categoryId,
      exhibitName: name.trim(),
      attributes: attrs,
    };
    if (manufacturer.trim()) payload.manufacturer = manufacturer.trim();
    if (year.trim()) {
      const y = parseInt(year, 10);
      if (!isNaN(y)) payload.year = y;
    }
    if (donorId) payload.donorId = donorId;
    if (locationId) payload.locationId = locationId;
    if (locSite.trim()) payload.locSite = locSite.trim();
    if (acquiredAt) payload.acquiredAt = new Date(acquiredAt + 'T00:00:00Z').toISOString();
    createMutation.mutate(payload);
  }

  const inputCls = 'w-full rounded-control border border-input bg-background px-3 py-2.5 text-base';
  const labelCls = 'mb-1.5 block text-sm font-medium text-muted-foreground';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-card shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-7 py-4">
          <h2 className="font-display text-xl font-semibold">{t('exhibits.newExhibit')}</h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t('exhibits.newExhibitHint')}</p>
            <button
              type="button"
              onClick={() => setWikidataOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-input px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
              title={t('exhibit.wikidataButton') as string}
            >
              <Sparkles className="h-3.5 w-3.5" /> {t('exhibit.wikidataButton')}
            </button>
          </div>
          {wikidataOpen && (
            <WikidataEnrichModal
              initialQuery={name}
              category={category ? { id: category.id, code: category.code } : null}
              schemaProperties={categorySchema?.properties ?? null}
              canManageCategory={hasPermission('category:write')}
              onApply={applyWikidata}
              onSchemaChanged={() => wikidataQueryClient.invalidateQueries({ queryKey: ['categories'] })}
              onClose={() => setWikidataOpen(false)}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className={categorySchema?.properties?.type ? '' : 'col-span-2'}>
              <label className={labelCls}>
                {t('exhibit.category')} *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputCls}
                autoFocus
              >
                <option value="">—</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'el' ? c.nameEl : c.nameEn} ({c.idPrefix})
                  </option>
                ))}
              </select>
            </div>
            {/* Type sits next to Category — it's the primary classifier (still
                stored in the JSONB attributes for now; see the "promote to column"
                follow-up note). */}
            {categorySchema?.properties?.type && (() => {
              // Known values = enum + soft suggestions + whatever's already
              // in use. Deduped. If the currently-selected value isn't in
              // there (e.g. because it's brand-new), fold it in so the
              // <select> can render it as its own option without blanking.
              const knownTypes = Array.from(new Set([
                ...(attrValues?.type ?? []),
                ...(categorySchema.properties.type.enum ?? []),
                ...(categorySchema.properties.type.suggestions ?? []),
              ]));
              const current = attributes.type ?? '';
              if (current && !knownTypes.includes(current)) knownTypes.unshift(current);
              return (
                <div>
                  <label className={labelCls}>
                    {fieldLabel(categorySchema.properties.type, lang, 'Type')}
                  </label>
                  {addingType ? (
                    <input
                      autoFocus
                      placeholder={t('exhibits.newTypePlaceholder') as string}
                      value={current}
                      onChange={(e) => setAttributes((a) => ({ ...a, type: e.target.value }))}
                      onBlur={() => setAddingType(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                      }}
                      className={inputCls}
                    />
                  ) : (
                    // The sentinel "__add__" flips addingType on so operators
                    // can enter a brand-new type without hunting for the
                    // combobox affordance. Same pattern as category dropdown
                    // in Financials.
                    <select
                      value={current}
                      onChange={(e) => {
                        if (e.target.value === '__add__') {
                          setAttributes((a) => ({ ...a, type: '' }));
                          setAddingType(true);
                        } else {
                          setAttributes((a) => ({ ...a, type: e.target.value }));
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {knownTypes.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      <option value="__add__">+ {t('exhibits.addNewType')}</option>
                    </select>
                  )}
                </div>
              );
            })()}

            <div className="col-span-2">
              <label className={labelCls}>
                {t('exhibits.exhibitName')} *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                maxLength={500}
              />
            </div>

            <div>
              <label className={labelCls}>{t('exhibit.manufacturer')}</label>
              <input
                list="manufacturers-list-add"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className={inputCls}
                maxLength={300}
              />
              {manufacturers && (
                <datalist id="manufacturers-list-add">
                  {manufacturers.map((m) => <option key={m} value={m} />)}
                </datalist>
              )}
            </div>
            <div>
              <label className={labelCls}>{t('exhibit.year')}</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={inputCls}
                placeholder={t('common.placeholderYear') as string}
              />
            </div>

            <div>
              <label className={labelCls}>{t('exhibit.donor')}</label>
              <DonorPicker
                donors={donors ?? []}
                value={donorId}
                onChange={setDonorId}
              />
            </div>
            <div>
              <label className={labelCls}>{t('exhibit.location')}</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('exhibits.noneOptional')}</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}{l.nameEn ? ` — ${l.nameEn}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>{t('exhibit.site')}</label>
              <input
                value={locSite}
                onChange={(e) => setLocSite(e.target.value)}
                className={inputCls}
                maxLength={50}
              />
            </div>
            <div>
              <label className={labelCls}>{t('exhibit.acquiredAt')}</label>
              <input
                type="date"
                value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {categorySchema && Object.keys(categorySchema.properties).some((k) => k !== 'type') && (
            <div className="mt-2 border-t border-border pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('exhibit.categoryAttributes')}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                {Object.entries(categorySchema.properties).filter(([key]) => key !== 'type').map(([key, prop]) => {
                  const label = fieldLabel(prop, lang, key);
                  const value = attributes[key] ?? '';
                  return (
                    <div key={key}>
                      <label className={labelCls}>{label}</label>
                      {prop.enum ? (
                        <select
                          value={value}
                          onChange={(e) => setAttributes((a) => ({ ...a, [key]: e.target.value }))}
                          className={inputCls}
                        >
                          <option value="">—</option>
                          {prop.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (prop.autocomplete || prop.suggestions) ? (
                        <>
                          <input
                            list={`attr-${key}-list-add`}
                            value={value}
                            onChange={(e) => setAttributes((a) => ({ ...a, [key]: e.target.value }))}
                            className={inputCls}
                          />
                          <datalist id={`attr-${key}-list-add`}>
                            {(prop.autocomplete ? (attrValues?.[key] ?? []) : (prop.suggestions ?? [])).map((opt) => <option key={opt} value={opt} />)}
                          </datalist>
                        </>
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setAttributes((a) => ({ ...a, [key]: e.target.value }))}
                          className={inputCls}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-7 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createMutation.isPending ? t('exhibits.creating') : t('exhibits.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

function SortHeader({
  field,
  sortBy,
  sortOrder,
  onSort,
  children,
}: {
  field: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (f: string) => void;
  children: React.ReactNode;
}) {
  const isActive = sortBy === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
      }`}
    >
      {children}
      {isActive
        ? (sortOrder === 'asc'
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />)
        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}
