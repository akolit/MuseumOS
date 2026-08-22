import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trash2, Settings as Cog, Printer, TrendingUp, TrendingDown,
  AlertCircle, Loader2, Sparkles, Check, GripVertical, HelpCircle,
  ClipboardPaste, X, Save, BookmarkPlus, History, FolderOpen, Bookmark, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

type Kind = 'income' | 'expense';
type Confidence = 'confirmed' | 'likely' | 'aspirational';

interface BudgetItem {
  id: string;
  kind: Kind;
  category: string;
  name: string;
  forecastAmount: number;
  actualAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  confidence: Confidence | null;
  notes: string | null;
  position: number;
}

interface BudgetSnapshotMeta {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  forecastTotal: number;
  actualTotal: number | null;
  createdAt: string;
  createdById: string | null;
  createdByDisplayName: string | null;
}

// Locale-aware Greek currency: "1.234,56 €". Falls back to English format
// if the user's language preference is anything else.
function useCurrencyFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('el') ? 'el-GR' : i18n.language.startsWith('fr') ? 'fr-FR' : 'en-GB';
  return useMemo(
    () => new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
    }),
    [locale],
  );
}

// Compact integer formatting for slider tick labels (1.2k / 1.2M).
function compact(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toString();
}

// Integer formatter for the inline amount inputs ("1.234" / "1.234.567").
// Uses Greek locale unconditionally so "." is always the thousand
// separator regardless of the user's `langPreference` — the currency
// display in the rest of the page is already locale-aware via the
// hook below.
const INT_FMT = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 });

// Parse a thousand-separator-formatted integer string back to a number.
// "1.234.567" → 1234567. Ignores any non-digit character.
function parseFormatted(s: string): number {
  const digits = s.replace(/[^\d]/g, '');
  if (digits === '') return 0;
  const n = parseInt(digits, 10);
  return isNaN(n) ? 0 : n;
}

function groupByCategory<T extends { category: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return Array.from(groups, ([category, items]) => ({ category, items }));
}

function sum<T>(items: T[], pick: (it: T) => number | null): number {
  return items.reduce((acc, it) => acc + (pick(it) ?? 0), 0);
}

export function FinancialsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasPermission('budget:write');
  const [csvOpen, setCsvOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ['budget'],
    queryFn: () => api.get<BudgetItem[]>('/budget'),
  });

  const seedTemplate = useMutation({
    mutationFn: () => api.post('/budget/template'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
      toast.success(t('toast.created'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const income = (items ?? []).filter((i) => i.kind === 'income');
  const expenses = (items ?? []).filter((i) => i.kind === 'expense');

  return (
    <div className="mx-auto max-w-6xl">
      <Header
        empty={(items?.length ?? 0) === 0}
        canWrite={canWrite}
        onSeed={() => seedTemplate.mutate()}
        seeding={seedTemplate.isPending}
        onPasteCsv={() => setCsvOpen(true)}
        onSaveSnapshot={() => setSaveOpen(true)}
        onOpenSnapshots={() => setSnapshotsOpen(true)}
      />

      {(items?.length ?? 0) === 0 ? (
        <EmptyState
          canWrite={canWrite}
          onSeed={() => seedTemplate.mutate()}
          seeding={seedTemplate.isPending}
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Column kind="income" items={income} canWrite={canWrite} />
            <Column kind="expense" items={expenses} canWrite={canWrite} />
          </div>
          <Summary income={income} expenses={expenses} />
        </>
      )}

      {csvOpen && (
        <CsvPasteModal
          items={items ?? []}
          onClose={() => setCsvOpen(false)}
        />
      )}
      {saveOpen && (
        <SaveSnapshotModal
          onClose={() => setSaveOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['budget-snapshots'] });
            setSaveOpen(false);
          }}
        />
      )}
      {snapshotsOpen && (
        <SnapshotsPanel onClose={() => setSnapshotsOpen(false)} />
      )}
    </div>
  );
}

function Header({
  empty, canWrite, onSeed, seeding, onPasteCsv, onSaveSnapshot, onOpenSnapshots,
}: {
  empty: boolean;
  canWrite: boolean;
  onSeed: () => void;
  seeding: boolean;
  onPasteCsv: () => void;
  onSaveSnapshot: () => void;
  onOpenSnapshots: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Quick-snapshot: save immediately with an auto-generated name (no modal).
  // Useful when the operator just wants a checkpoint before a risky tweak.
  const quickSnap = useMutation({
    mutationFn: () => {
      const name = `${t('financials.snapshotAuto')} ${new Date().toLocaleString()}`;
      return api.post('/budget/snapshots', { name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-snapshots'] });
      toast.success(t('financials.snapshotSaved'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  // The snapshot dropdown — quick-snap, save-with-name and browse — used
  // to be three separate buttons in the header. Grouped into one menu so
  // the header doesn't sprawl on screens narrower than ~1100 px.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('financials.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('financials.subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {empty && canWrite && (
          <button
            onClick={onSeed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('financials.startFromTemplate')}
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            title={t('financials.snapshotsTitle') as string}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <History className="h-3.5 w-3.5" />
            {t('financials.snapshots')}
            <ChevronDown className={`h-3 w-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-64 rounded-control border border-border bg-card p-1 shadow-lg"
            >
              {!empty && canWrite && (
                <>
                  <button
                    role="menuitem"
                    onClick={() => { quickSnap.mutate(); setMenuOpen(false); }}
                    disabled={quickSnap.isPending}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <Bookmark className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1">
                      <span className="block font-medium">{t('financials.quickSnapshotTitle')}</span>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { onSaveSnapshot(); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1">
                      <span className="block font-medium">{t('financials.saveSnapshot')}</span>
                    </span>
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}
              <button
                role="menuitem"
                onClick={() => { onOpenSnapshots(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted"
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-medium">{t('financials.snapshotsTitle')}</span>
              </button>
            </div>
          )}
        </div>
        {!empty && canWrite && (
          <button
            onClick={onPasteCsv}
            className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            title={t('financials.csvPasteTitle') as string}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            {t('financials.csvPaste')}
          </button>
        )}
        <Link
          to="/financials/print"
          className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          target="_blank"
          rel="noreferrer"
        >
          <Printer className="h-3.5 w-3.5" />
          {t('common.print')}
        </Link>
      </div>
    </div>
  );
}

function EmptyState({
  canWrite, onSeed, seeding,
}: { canWrite: boolean; onSeed: () => void; seeding: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-10 rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <p className="font-display text-lg font-semibold">{t('financials.emptyTitle')}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {t('financials.emptyBody')}
      </p>
      {canWrite && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={onSeed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {t('financials.startFromTemplate')}
          </button>
        </div>
      )}
    </div>
  );
}

function Column({ kind, items, canWrite }: { kind: Kind; items: BudgetItem[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fmt = useCurrencyFormat();
  const [adding, setAdding] = useState(false);
  // Track the currently-dragged row id, plus the row it's hovering over,
  // so we can render an insertion line. State is local to the column
  // because reordering is intra-column (no cross-kind drag).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const groups = useMemo(() => groupByCategory(items), [items]);
  // Flat ordered list used both for rendering and computing reorder payloads.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const create = useMutation({
    mutationFn: (payload: Partial<BudgetItem>) => api.post<BudgetItem>('/budget', { kind, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
      setAdding(false);
      toast.success(t('toast.created'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.post('/budget/reorder', { orderedIds }),
    onMutate: async (orderedIds) => {
      // Optimistic — reorder in cache so the UI doesn't jitter.
      await qc.cancelQueries({ queryKey: ['budget'] });
      const previous = qc.getQueryData<BudgetItem[]>(['budget']);
      qc.setQueryData<BudgetItem[]>(['budget'], (prev) => {
        if (!prev) return prev;
        const ordering = new Map(orderedIds.map((id, i) => [id, i]));
        return [...prev].sort((a, b) => {
          if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
          if (a.kind !== kind) return 0;
          return (ordering.get(a.id) ?? 0) - (ordering.get(b.id) ?? 0);
        });
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['budget'], ctx.previous);
      toast.error(t('toast.error'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  });

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null); setOverId(null);
      return;
    }
    // Build new ordered ids: pull dragId out, insert before targetId.
    const ids = flat.map((i) => i.id);
    const from = ids.indexOf(dragId);
    if (from === -1) return;
    ids.splice(from, 1);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, dragId);
    setDragId(null); setOverId(null);
    reorderMutation.mutate(ids);
  }

  const isIncome = kind === 'income';
  const existingCategories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );

  return (
    <section className={`flex h-full flex-col rounded-lg border ${isIncome ? 'border-emerald-500/30' : 'border-rose-500/30'} bg-card`}>
      <div className={`flex items-center justify-between border-b border-border px-4 py-3 ${isIncome ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
        <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold">
          {isIncome
            ? <TrendingUp className="h-4 w-4 text-emerald-600" />
            : <TrendingDown className="h-4 w-4 text-rose-600" />}
          {isIncome ? t('financials.income') : t('financials.expenses')}
        </h2>
        {canWrite && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-control border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            {t('financials.add')}
          </button>
        )}
      </div>

      {/* Items list grows to fill so the Total below sticks to the bottom and
          stays aligned across both columns when one side has fewer rows. */}
      <div className="flex-1 divide-y divide-border">
        {groups.length === 0 && !adding && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('financials.noItems')}
          </p>
        )}
        {groups.map((g) => (
          <CategoryGroup
            key={g.category}
            category={g.category}
            items={g.items}
            canWrite={canWrite}
            allCategories={existingCategories}
            kind={kind}
            dragId={dragId}
            overId={overId}
            onDragStart={(id) => setDragId(id)}
            onDragOver={(id) => setOverId(id)}
            onDrop={handleDrop}
          />
        ))}
        {adding && (
          <AddRow
            kind={kind}
            existingCategories={existingCategories}
            onCancel={() => setAdding(false)}
            onSave={(payload) => create.mutate(payload)}
            saving={create.isPending}
          />
        )}
      </div>

      <div className={`flex items-center justify-between border-t border-border px-4 py-2.5 text-sm ${isIncome ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
        <span className="font-medium text-muted-foreground">{t('financials.total')}</span>
        <div className="text-right tabular-nums">
          <div className="font-semibold">{fmt.format(sum(items, (i) => i.forecastAmount))}</div>
          <div className="text-xs text-muted-foreground">
            {t('financials.actualShort')}: {fmt.format(sum(items, (i) => i.actualAmount))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryGroup({
  category, items, canWrite, allCategories, kind, dragId, overId, onDragStart, onDragOver, onDrop,
}: {
  category: string;
  items: BudgetItem[];
  canWrite: boolean;
  allCategories: string[];
  kind: Kind;
  dragId: string | null;
  overId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (targetId: string) => void;
}) {
  const fmt = useCurrencyFormat();
  return (
    <div>
      <div className="flex items-center justify-between bg-muted/30 px-4 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</span>
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
          {fmt.format(sum(items, (i) => i.forecastAmount))}
        </span>
      </div>
      {items.map((it) => (
        <BudgetRow
          key={it.id}
          item={it}
          canWrite={canWrite}
          allCategories={allCategories}
          kind={kind}
          isDragging={dragId === it.id}
          isDropTarget={overId === it.id && dragId !== null && dragId !== it.id}
          onDragStart={() => onDragStart(it.id)}
          onDragOver={() => onDragOver(it.id)}
          onDragEnd={() => { /* no-op — drop handles state reset */ }}
          onDrop={() => onDrop(it.id)}
        />
      ))}
    </div>
  );
}

const CONFIDENCE_ORDER: (Confidence | null)[] = [null, 'confirmed', 'likely', 'aspirational'];
const CONFIDENCE_STYLES: Record<NonNullable<Confidence>, string> = {
  confirmed:    'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  likely:       'bg-amber-500/20 text-amber-700 border-amber-500/30',
  aspirational: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
};

function BudgetRow({
  item, canWrite, allCategories, kind, isDragging, isDropTarget,
  onDragStart, onDragOver, onDragEnd, onDrop,
}: {
  item: BudgetItem;
  canWrite: boolean;
  allCategories: string[];
  kind: Kind;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [forecast, setForecast] = useState(item.forecastAmount);
  const [actual, setActual] = useState<number | null>(item.actualAmount);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "Saved" pulse — flips to true briefly after a successful save.
  const [savedPulse, setSavedPulse] = useState(false);
  // Track focus per amount input — while focused, show the raw digits
  // (easier to edit); while blurred, show "1.234.567" with thousand
  // separators.
  const [focusForecast, setFocusForecast] = useState(false);
  const [focusActual, setFocusActual] = useState(false);
  // Captured at focus-in so blur can decide whether to save. We can't use
  // item.forecastAmount / item.actualAmount because optimisticPatch keeps
  // mutating those as the user types — without this snapshot a quick edit
  // followed by Tab would convince the blur handler nothing changed.
  const forecastFocusValue = useRef<number>(item.forecastAmount);
  const actualFocusValue = useRef<number | null>(item.actualAmount);

  useEffect(() => { setForecast(item.forecastAmount); }, [item.forecastAmount]);
  useEffect(() => { setActual(item.actualAmount); }, [item.actualAmount]);

  // Row-level draggable is OFF by default — otherwise mouse-down on the
  // slider thumb or any input would start a drag instead of doing its
  // normal thing. The grip handle below flips this ON for the duration
  // of a mouse press, so drag only starts when the user grabs the grip.
  const [armDrag, setArmDrag] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Optimistic patch — updates the cache synchronously so subtotals & the
  // category header recompute live. The debounced save reconciles with the
  // server (in case validation rejects it).
  function optimisticPatch(payload: Partial<BudgetItem>) {
    qc.setQueryData<BudgetItem[]>(['budget'], (prev) =>
      prev?.map((it) => (it.id === item.id ? { ...it, ...payload } : it)),
    );
  }

  function scheduleSave(payload: Partial<BudgetItem>) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateMutation.mutate(payload), 350);
  }

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<BudgetItem>) => api.patch(`/budget/${item.id}`, payload),
    onSuccess: () => {
      // Trigger the "saved" pulse — fades after ~1.5s.
      setSavedPulse(true);
      setTimeout(() => setSavedPulse(false), 1500);
      // Background sync — server is the source of truth.
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/budget/${item.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
      toast.success(t('toast.deleted'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  // Fixed default range — was `2 × forecast` which compounded each time
  // the user dragged to max, eventually producing absurd values.
  // 100,000 € is enough headroom for the typical line; operators with
  // bigger numbers (e.g. total salaries) configure a custom max via the
  // settings cog. If the existing forecast already exceeds the default,
  // expand the slider just enough to display it without pegging.
  const DEFAULT_MAX = 100_000;
  const sliderMin = item.minAmount ?? 0;
  const sliderMax = item.maxAmount ?? Math.max(DEFAULT_MAX, forecast);
  const sliderStep = 1;

  function cycleConfidence() {
    const idx = CONFIDENCE_ORDER.indexOf(item.confidence);
    const next = CONFIDENCE_ORDER[(idx + 1) % CONFIDENCE_ORDER.length];
    optimisticPatch({ confidence: next });
    updateMutation.mutate({ confidence: next });
  }

  // Inline variance — shown as a compact +/- chip next to the Actual input.
  // We treat null AND 0 as "not yet recorded" rather than "missed by 100 %",
  // because the form initialises actual to 0 on existing rows and a fresh
  // budget would otherwise scream red on every line.
  const hasActual = item.actualAmount !== null && item.actualAmount !== 0;
  const variance = hasActual ? (item.actualAmount as number) - item.forecastAmount : null;
  const variancePct = variance !== null && item.forecastAmount > 0
    ? (variance / item.forecastAmount) * 100 : null;
  const varianceIsGood = variance !== null
    && (kind === 'income' ? variance >= 0 : variance <= 0);

  return (
    <div
      // Only honour drag when the grip handle armed it — see comment above.
      draggable={canWrite && armDrag}
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragEnd={() => { setArmDrag(false); onDragEnd(); }}
      onDrop={(e) => { e.preventDefault(); setArmDrag(false); onDrop(); }}
      className={`relative px-4 py-2.5 transition-colors ${
        isDragging ? 'opacity-40' : 'hover:bg-muted/20'
      } ${isDropTarget ? 'border-t-2 border-primary' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* Grip handle: arms the row's `draggable` only while pressed,
            so dragging the slider / typing in inputs doesn't accidentally
            start a row drag. */}
        {canWrite && (
          <span
            onMouseDown={() => setArmDrag(true)}
            onMouseUp={() => setArmDrag(false)}
            onMouseLeave={() => setArmDrag(false)}
            className="-ml-1 flex h-5 w-3 flex-shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
            title={t('financials.dragHint') as string}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        {/* Name */}
        <input
          defaultValue={item.name}
          disabled={!canWrite}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== item.name) updateMutation.mutate({ name });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="min-w-0 flex-[1_1_140px] basis-[140px] truncate rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-input focus:border-input focus:bg-background focus:outline-none"
        />

        {/* Slider with tiny tick labels (min / current / max). */}
        <div className="flex min-w-[140px] flex-[2_1_180px] flex-col gap-0.5">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={forecast}
            disabled={!canWrite}
            onChange={(e) => {
              const v = Number(e.target.value);
              setForecast(v);
              optimisticPatch({ forecastAmount: v });
              scheduleSave({ forecastAmount: v });
            }}
            className="h-2 cursor-pointer accent-primary"
          />
          <div className="flex justify-between px-0.5 text-[9px] text-muted-foreground/60">
            <span>{compact(sliderMin)}</span>
            <span className="text-foreground/60">{compact(forecast)}</span>
            <span>{compact(sliderMax)}</span>
          </div>
        </div>

        {/* Forecast amount — formatted with thousand separators when blurred,
            raw digits when focused so they're easy to edit.
            The blur-save compares against the value captured at focus-in
            rather than item.forecastAmount, because optimisticPatch keeps
            mutating the cached prop as the user types — without this, a
            quick edit followed by Tab would optimistic-update the cache,
            the blur check would see "no change", skip the API save, and
            the next refetch would snap the input back to the old DB value. */}
        <input
          type="text"
          inputMode="numeric"
          value={focusForecast ? String(forecast) : INT_FMT.format(forecast)}
          disabled={!canWrite}
          onFocus={() => {
            setFocusForecast(true);
            forecastFocusValue.current = forecast;
          }}
          onChange={(e) => {
            const v = parseFormatted(e.target.value);
            setForecast(v);
            optimisticPatch({ forecastAmount: v });
          }}
          onBlur={() => {
            setFocusForecast(false);
            if (forecast !== forecastFocusValue.current) {
              updateMutation.mutate({ forecastAmount: forecast });
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-24 flex-shrink-0 rounded border border-input bg-background px-2 py-1 text-right text-sm font-semibold tabular-nums"
          title={t('financials.forecastShort') as string}
        />

        {/* Actual + inline variance chip */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            placeholder={t('financials.actualShort') as string}
            value={actual === null
              ? ''
              : (focusActual ? String(actual) : INT_FMT.format(actual))}
            disabled={!canWrite}
            onFocus={() => {
              setFocusActual(true);
              actualFocusValue.current = actual;
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === '' ? null : parseFormatted(raw);
              setActual(next);
              optimisticPatch({ actualAmount: next });
            }}
            onBlur={() => {
              setFocusActual(false);
              if (actual !== actualFocusValue.current) {
                updateMutation.mutate({ actualAmount: actual });
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-20 rounded border border-input bg-background px-2 py-1 text-right text-xs text-muted-foreground tabular-nums"
            title={t('financials.actualHint') as string}
          />
          {variance !== null && (
            <span
              className={`whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium tabular-nums ${
                varianceIsGood ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'
              }`}
              title={t('financials.variance') as string}
            >
              {variance >= 0 ? '+' : ''}{compact(variance)}€
              {variancePct !== null && ` (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(0)}%)`}
            </span>
          )}
        </div>

        {/* Confidence dot with empty-state ? glyph — only on income rows
            since `ConfidenceBar` and the pessimistic/realistic/optimistic
            net scenarios in Summary only consume income confidence. */}
        {kind === 'income' && (
          <button
            onClick={cycleConfidence}
            disabled={!canWrite}
            title={item.confidence ? t(`financials.confidence.${item.confidence}`) as string : t('financials.confidence.none') as string}
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
              item.confidence
                ? CONFIDENCE_STYLES[item.confidence]
                : 'border-dashed border-muted-foreground/40 bg-background text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground'
            }`}
            aria-label="confidence"
          >
            {!item.confidence && <HelpCircle className="h-3 w-3" />}
          </button>
        )}

        {/* "Saved ✓" pulse — slides in for ~1.5s after each successful save. */}
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center text-emerald-600 transition-opacity ${
            savedPulse ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden
          title={t('financials.saved') as string}
        >
          <Check className="h-3.5 w-3.5" />
        </span>

        {/* Settings cog + delete — the popover only contains writable
            controls, so we hide the whole cog for read-only users rather
            than show a useless greyed-out icon. */}
        {canWrite && (
          <>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
              title={t('financials.settings') as string}
            >
              <Cog className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={t('common.delete') as string}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {showSettings && (
        <SettingsPopover
          item={item}
          allCategories={allCategories}
          onSave={(payload) => {
            optimisticPatch(payload);
            updateMutation.mutate(payload);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('financials.deleteConfirmTitle') as string}
          message={t('financials.deleteConfirm', { name: item.name }) as string}
          confirmLabel={t('common.delete') as string}
          destructive
          onConfirm={() => { removeMutation.mutate(); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function SettingsPopover({
  item, allCategories, onSave, onClose,
}: {
  item: BudgetItem;
  allCategories: string[];
  onSave: (payload: Partial<BudgetItem>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState(item.category);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [minAmount, setMinAmount] = useState<string>(item.minAmount?.toString() ?? '');
  const [maxAmount, setMaxAmount] = useState<string>(item.maxAmount?.toString() ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');

  // Category dropdown shows known categories + an "Add new…" sentinel.
  // Free-text typing is gated behind a button so typos can't silently
  // spawn phantom categories ("Operationsl" vs "Operational").
  const categoryChoice = (
    addingCategory ? (
      <div className="flex gap-1">
        <input
          autoFocus
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder={t('financials.newCategoryName') as string}
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newCategory.trim()) {
              setCategory(newCategory.trim());
              setAddingCategory(false);
            } else if (e.key === 'Escape') {
              setAddingCategory(false);
              setNewCategory('');
            }
          }}
        />
        <button
          onClick={() => {
            if (newCategory.trim()) {
              setCategory(newCategory.trim());
              setAddingCategory(false);
            }
          }}
          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
        >
          {t('common.add')}
        </button>
      </div>
    ) : (
      <select
        value={category}
        onChange={(e) => {
          if (e.target.value === '__add__') {
            setAddingCategory(true);
            setNewCategory('');
          } else {
            setCategory(e.target.value);
          }
        }}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
      >
        {!allCategories.includes(category) && <option value={category}>{category}</option>}
        {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__add__">+ {t('financials.newCategory')}</option>
      </select>
    )
  );

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label>
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('financials.category')}
          </span>
          {categoryChoice}
        </label>
        <label>
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('financials.sliderMin')}
          </span>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs tabular-nums"
          />
        </label>
        <label>
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('financials.sliderMax')}
          </span>
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs tabular-nums"
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('financials.notes')}
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full resize-y rounded border border-input bg-background px-2 py-1 text-xs"
        />
      </label>
      <div className="mt-2 flex justify-end gap-1.5">
        <button onClick={onClose} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
          {t('common.cancel')}
        </button>
        <button
          onClick={() => {
            onSave({
              category: category.trim() || item.category,
              minAmount: minAmount === '' ? null : Number(minAmount),
              maxAmount: maxAmount === '' ? null : Number(maxAmount),
              notes: notes.trim() || null,
            });
            onClose();
          }}
          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function AddRow({
  kind, existingCategories, onCancel, onSave, saving,
}: {
  kind: Kind;
  existingCategories: string[];
  onCancel: () => void;
  onSave: (payload: Partial<BudgetItem>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(
    existingCategories[0] ?? (kind === 'income' ? 'Other' : 'Operational')
  );
  // Mirror the SettingsPopover behaviour — `+ new category` swaps the
  // <select> for a text input so the operator can type a fresh name
  // without bouncing through the settings popover.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [amount, setAmount] = useState(0);
  const [focusAmount, setFocusAmount] = useState(false);

  return (
    <div className="bg-primary/5 px-4 py-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input
          autoFocus
          placeholder={t('financials.name') as string}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onSave({ name: name.trim(), category: category.trim() || 'Other', forecastAmount: amount });
            } else if (e.key === 'Escape') onCancel();
          }}
          className="rounded border border-input bg-background px-2 py-1 text-sm sm:col-span-5"
        />
        {addingCategory ? (
          <input
            autoFocus
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={t('financials.newCategoryName') as string}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCategory.trim()) {
                setCategory(newCategory.trim());
                setAddingCategory(false);
              } else if (e.key === 'Escape') {
                setAddingCategory(false);
                setNewCategory('');
              }
            }}
            onBlur={() => {
              if (newCategory.trim()) {
                setCategory(newCategory.trim());
              }
              setAddingCategory(false);
            }}
            className="rounded border border-input bg-background px-2 py-1 text-sm sm:col-span-3"
          />
        ) : (
          <select
            value={category}
            onChange={(e) => {
              if (e.target.value === '__add__') {
                setNewCategory('');
                setAddingCategory(true);
              } else {
                setCategory(e.target.value);
              }
            }}
            className="rounded border border-input bg-background px-2 py-1 text-sm sm:col-span-3"
          >
            {!existingCategories.includes(category) && (
              <option value={category}>{category}</option>
            )}
            {existingCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__add__">+ {t('financials.newCategory')}</option>
          </select>
        )}
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('financials.forecastShort') as string}
          value={focusAmount ? String(amount) : INT_FMT.format(amount)}
          onFocus={() => setFocusAmount(true)}
          onBlur={() => setFocusAmount(false)}
          onChange={(e) => setAmount(parseFormatted(e.target.value))}
          className="rounded border border-input bg-background px-2 py-1 text-right text-sm tabular-nums sm:col-span-2"
        />
        <div className="flex items-center justify-end gap-1.5 sm:col-span-2">
          <button onClick={onCancel} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            disabled={!name.trim() || saving}
            onClick={() => onSave({
              name: name.trim(),
              category: category.trim() || 'Other',
              forecastAmount: amount,
            })}
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Summary({ income, expenses }: { income: BudgetItem[]; expenses: BudgetItem[] }) {
  const { t } = useTranslation();
  const fmt = useCurrencyFormat();

  // Confidence buckets for the three scenarios. Rows with NO confidence
  // set are folded in alongside "likely" — that matches the operator
  // intuition that an unrated line is most-probably-going-to-happen but
  // hasn't been formally confirmed yet. So a fresh budget where nobody
  // touched the confidence dots still shows a sensible Realistic net.
  const incConfirmed   = sum(income.filter((i) => i.confidence === 'confirmed'), (i) => i.forecastAmount);
  const incLikelyOrUnrated = sum(
    income.filter((i) => i.confidence === 'likely' || i.confidence === null),
    (i) => i.forecastAmount,
  );
  const incAspirational = sum(income.filter((i) => i.confidence === 'aspirational'), (i) => i.forecastAmount);
  const expTotal       = sum(expenses, (i) => i.forecastAmount);

  const pessimisticNet = incConfirmed - expTotal;
  const realisticNet   = incConfirmed + incLikelyOrUnrated - expTotal;
  const optimisticNet  = incConfirmed + incLikelyOrUnrated + incAspirational - expTotal;

  const incActual = sum(income,   (i) => i.actualAmount);
  const expActual = sum(expenses, (i) => i.actualAmount);
  const actualNet = incActual - expActual;

  const varianceAbs = actualNet - optimisticNet;
  const varPct = optimisticNet !== 0 ? (varianceAbs / Math.abs(optimisticNet)) * 100 : null;

  const incTotal = incConfirmed + incLikelyOrUnrated + incAspirational;
  const incBreakdown = computeBreakdown(income, incTotal);
  const expBreakdown = computeBreakdown(expenses, expTotal);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 font-display text-base font-semibold">{t('financials.summary')}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NetCard
          label={t('financials.forecastNet')}
          values={[
            { sublabel: t('financials.pessimistic'), value: pessimisticNet, fmt },
            { sublabel: t('financials.realistic'),   value: realisticNet,   fmt, prominent: true },
            { sublabel: t('financials.optimistic'),  value: optimisticNet,  fmt },
          ]}
        />
        <NetCard
          label={t('financials.actualNet')}
          values={[{ value: actualNet, fmt, prominent: true }]}
          empty={incActual === 0 && expActual === 0}
        />
        <NetCard
          label={t('financials.variance')}
          values={[
            { value: varianceAbs, fmt, prominent: true },
            ...(varPct !== null ? [{ sublabel: `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`, value: 0, fmt, hideValue: true }] : []),
          ]}
          empty={incActual === 0 && expActual === 0}
          neutralColor={incActual === 0 && expActual === 0}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <BreakdownBar label={t('financials.incomeBreakdown')} breakdown={incBreakdown} total={incTotal} kind="income" />
          <ConfidenceBar income={income} total={incTotal} />
        </div>
        <BreakdownBar label={t('financials.expenseBreakdown')} breakdown={expBreakdown} total={expTotal} kind="expense" />
      </div>
    </section>
  );
}

function computeBreakdown(items: BudgetItem[], total: number) {
  if (total <= 0) return [];
  const byCategory = new Map<string, number>();
  for (const it of items) {
    byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.forecastAmount);
  }
  return Array.from(byCategory, ([category, amount]) => ({
    category,
    amount,
    pct: (amount / total) * 100,
  })).sort((a, b) => b.amount - a.amount);
}

const BREAKDOWN_COLORS_INCOME = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#86efac', '#4ade80'];
const BREAKDOWN_COLORS_EXPENSE = ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#fee2e2', '#fb923c', '#f97316'];

function BreakdownBar({
  label, breakdown, total, kind,
}: {
  label: string;
  breakdown: ReturnType<typeof computeBreakdown>;
  total: number;
  kind: Kind;
}) {
  const { t } = useTranslation();
  const fmt = useCurrencyFormat();
  const colors = kind === 'income' ? BREAKDOWN_COLORS_INCOME : BREAKDOWN_COLORS_EXPENSE;
  if (breakdown.length === 0) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{t('financials.noData')}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label} — {fmt.format(total)}
      </p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {breakdown.map((b, i) => (
          <div
            key={b.category}
            style={{ width: `${b.pct}%`, background: colors[i % colors.length] }}
            title={`${b.category}: ${fmt.format(b.amount)} (${b.pct.toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {breakdown.map((b, i) => (
          <span key={b.category} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: colors[i % colors.length] }}
            />
            {b.category} ({b.pct.toFixed(0)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

// Stacked bar showing what % of total income is confirmed / likely /
// aspirational / unflagged. Reinforces the value of setting confidence
// flags on each line.
function ConfidenceBar({ income, total }: { income: BudgetItem[]; total: number }) {
  const { t } = useTranslation();
  const fmt = useCurrencyFormat();
  if (total <= 0) return null;
  const buckets = [
    { key: 'confirmed',    label: t('financials.confidence.confirmed'),    color: '#10b981', amount: sum(income.filter((i) => i.confidence === 'confirmed'),    (i) => i.forecastAmount) },
    { key: 'likely',       label: t('financials.confidence.likely'),       color: '#f59e0b', amount: sum(income.filter((i) => i.confidence === 'likely'),       (i) => i.forecastAmount) },
    { key: 'aspirational', label: t('financials.confidence.aspirational'), color: '#94a3b8', amount: sum(income.filter((i) => i.confidence === 'aspirational'), (i) => i.forecastAmount) },
    { key: 'none',         label: t('financials.confidence.unflagged'),    color: '#cbd5e1', amount: sum(income.filter((i) => i.confidence === null),           (i) => i.forecastAmount) },
  ].map((b) => ({ ...b, pct: (b.amount / total) * 100 })).filter((b) => b.amount > 0);
  if (buckets.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('financials.incomeByConfidence')}
      </p>
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {buckets.map((b) => (
          <div key={b.key} style={{ width: `${b.pct}%`, background: b.color }} title={`${b.label}: ${fmt.format(b.amount)}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {buckets.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: b.color }} />
            {b.label} ({b.pct.toFixed(0)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

interface NetValueRow {
  sublabel?: string;
  value: number;
  fmt: Intl.NumberFormat;
  prominent?: boolean;
  hideValue?: boolean;
}

function NetCard({
  label, values, empty, neutralColor,
}: {
  label: string;
  values: NetValueRow[];
  empty?: boolean;
  neutralColor?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {empty ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          {t('financials.noActuals')}
        </p>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {values.map((v, i) => {
            const colorClass = neutralColor
              ? 'text-foreground'
              : v.value > 0
                ? 'text-emerald-600'
                : v.value < 0
                  ? 'text-rose-600'
                  : 'text-muted-foreground';
            return (
              <div
                key={i}
                className={`flex items-baseline justify-between gap-2 tabular-nums ${
                  v.prominent ? `text-xl font-bold ${colorClass}` : 'text-xs text-muted-foreground'
                }`}
              >
                <span>{v.sublabel}</span>
                {!v.hideValue && (
                  <span>{v.value >= 0 && v.prominent ? '+' : ''}{v.fmt.format(v.value)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// CSV paste — the operator pastes a 2-column table (name,amount) from
// Excel/Numbers; we match by name (case-insensitive) and update each
// row's actualAmount. Per-match results are shown so the operator can
// spot any rows that didn't apply.
function CsvPasteModal({
  items, onClose,
}: {
  items: BudgetItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [raw, setRaw] = useState('');
  const [results, setResults] = useState<{ matched: number; missing: string[]; applied: number } | null>(null);
  const [applying, setApplying] = useState(false);

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Parse CSV/TSV — accept comma, tab, or semicolon as the column
  // separator. Greek decimals (1.234,56) need normalising too: any
  // dots are treated as thousand separators and the last comma as
  // the decimal point.
  const parsed = useMemo(() => parseRows(raw), [raw]);
  const matchPlan = useMemo(() => planMatches(parsed, items), [parsed, items]);

  async function apply() {
    setApplying(true);
    let applied = 0;
    for (const m of matchPlan.matched) {
      try {
        await api.patch(`/budget/${m.item.id}`, { actualAmount: m.amount });
        applied++;
      } catch {
        // Skip on individual failure; surface in toast at the end.
      }
    }
    setApplying(false);
    qc.invalidateQueries({ queryKey: ['budget'] });
    setResults({ matched: matchPlan.matched.length, missing: matchPlan.missing, applied });
    if (applied > 0) toast.success(t('toast.saved'));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-medium">{t('financials.csvPasteTitle')}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">{t('financials.csvHelp')}</p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder={`Tickets,12500\nRent,4800\n…`}
            className="w-full resize-y rounded border border-input bg-background p-3 font-mono text-xs"
            autoFocus
          />
          {parsed.length > 0 && (
            <div className="rounded border border-border bg-muted/30 p-3 text-xs">
              <p className="mb-1.5 font-medium">
                {t('financials.csvPreview', { rows: parsed.length, matched: matchPlan.matched.length, missing: matchPlan.missing.length })}
              </p>
              {matchPlan.missing.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted-foreground">{t('financials.csvUnmatched')}</summary>
                  <ul className="mt-1 pl-4">
                    {matchPlan.missing.map((m, i) => <li key={i} className="text-rose-600">{m}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {results && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              {t('financials.csvDone', { applied: results.applied })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            {t('common.close')}
          </button>
          <button
            onClick={apply}
            disabled={matchPlan.matched.length === 0 || applying}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
            {t('financials.csvApply', { count: matchPlan.matched.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseRows(input: string): { name: string; amount: number }[] {
  const rows: { name: string; amount: number }[] = [];
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Accept comma, semicolon, or tab as separator.
    const parts = trimmed.split(/[,;\t]/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const name = parts[0];
    // Greek-formatted numbers: "1.234,56" → 1234.56. Strip thousand dots
    // (every dot before the last comma), then replace last comma with dot.
    let raw = parts.slice(1).join('').replace(/\s/g, '');
    if (raw.includes(',') && raw.lastIndexOf('.') < raw.lastIndexOf(',')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(/,/g, '');
    }
    const amount = Number(raw);
    if (!name || isNaN(amount)) continue;
    rows.push({ name, amount });
  }
  return rows;
}

function planMatches(parsed: { name: string; amount: number }[], items: BudgetItem[]) {
  const lcLookup = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const matched: { item: BudgetItem; amount: number }[] = [];
  const missing: string[] = [];
  for (const p of parsed) {
    const item = lcLookup.get(p.name.toLowerCase());
    if (item) matched.push({ item, amount: p.amount });
    else missing.push(p.name);
  }
  return { matched, missing };
}

// ─── Confirm dialog ──────────────────────────────────────────

// Themed replacement for window.confirm() — used for the three destructive
// budget actions (delete row, restore snapshot, delete snapshot). Native
// confirms are unstyled, can't be translated cleanly, and lock the tab.
function ConfirmDialog({
  title, message, confirmLabel, destructive, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">{title}</h2>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">
          {message}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`rounded-control px-3 py-1.5 text-sm font-medium ${
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Snapshot modals ─────────────────────────────────────────

function SaveSnapshotModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => `${t('financials.snapshotDefaultName')} ${new Date().toLocaleDateString()}`);
  const [description, setDescription] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/budget/snapshots', { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('financials.snapshotSaved'));
      onSaved();
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-medium">{t('financials.saveSnapshotTitle')}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('financials.snapshotName')} *</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) save.mutate(); }}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('financials.snapshotDescription')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded border border-input bg-background px-3 py-2 text-sm"
              placeholder={t('financials.snapshotDescriptionPlaceholder') as string}
              maxLength={2000}
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SnapshotsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fmt = useCurrencyFormat();

  // Each pending destructive action is tracked by snapshot id so the
  // themed confirm renders next to the row it acts on.
  const [pendingRestore, setPendingRestore] = useState<BudgetSnapshotMeta | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BudgetSnapshotMeta | null>(null);

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['budget-snapshots'],
    queryFn: () => api.get<BudgetSnapshotMeta[]>('/budget/snapshots'),
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/budget/snapshots/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
      toast.success(t('financials.snapshotRestored'));
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/budget/snapshots/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-snapshots'] });
      toast.success(t('toast.deleted'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="inline-flex items-center gap-2 font-medium">
            <History className="h-4 w-4" /> {t('financials.snapshotsTitle')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!isLoading && (snapshots?.length ?? 0) === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t('financials.noSnapshots')}
            </p>
          )}
          <ul className="divide-y divide-border">
            {snapshots?.map((s) => (
              <li key={s.id} className="px-5 py-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {s.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <span>{t('financials.snapshotByLine', { name: s.createdByDisplayName ?? t('notes.unknownAuthor') })}</span>
                      <span>{t('financials.snapshotItemsLine', { count: s.itemCount })}</span>
                      <span className={`tabular-nums ${s.forecastTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t('financials.forecastShort')}: {s.forecastTotal >= 0 ? '+' : ''}{fmt.format(s.forecastTotal)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => setPendingRestore(s)}
                      disabled={restore.isPending}
                      className="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <FolderOpen className="h-3 w-3" />
                      {t('financials.load')}
                    </button>
                    <button
                      onClick={() => setPendingDelete(s)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            {t('common.close')}
          </button>
        </div>
      </div>
      {pendingRestore && (
        <ConfirmDialog
          title={t('financials.restoreTitle') as string}
          message={t('financials.restoreConfirm', { name: pendingRestore.name }) as string}
          confirmLabel={t('financials.load') as string}
          destructive
          onConfirm={() => {
            restore.mutate(pendingRestore.id);
            setPendingRestore(null);
          }}
          onCancel={() => setPendingRestore(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t('financials.deleteSnapshotTitle') as string}
          message={t('financials.deleteSnapshotConfirm', { name: pendingDelete.name }) as string}
          confirmLabel={t('common.delete') as string}
          destructive
          onConfirm={() => {
            remove.mutate(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
