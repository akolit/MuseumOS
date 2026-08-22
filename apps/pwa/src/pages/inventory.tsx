import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, X, ImageOff, Loader2, QrCode, Rows3, LayoutGrid, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { QrScannerModal } from '@/components/qr-scanner-modal';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

interface Category { id: string; code: string; nameEn: string; nameEl: string }
interface ExhibitRow {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  category: { code: string; nameEn: string; nameEl: string };
  primaryImageUrl: string | null;
  primaryThumbnailUrl: string | null;
}
interface SearchResult { items: ExhibitRow[]; page: number; pages: number; total: number }

const PAGE_SIZE = 30;

export function InventoryPage() {
  const { t, i18n } = useTranslation();
  const isEl = i18n.language.startsWith('el');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [scanOpen, setScanOpen] = useState(false);
  // 'list' = current full-width rows; 'grid-small' = 3-col thumb grid;
  // 'grid-large' = 2-col bigger thumb grid. Persisted so a phone remembers
  // the user's last choice across sessions.
  type View = 'list' | 'grid-small' | 'grid-large';
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = localStorage.getItem('pwa.inventory.view');
    return stored === 'grid-small' || stored === 'grid-large' || stored === 'list' ? stored : 'list';
  });
  useEffect(() => {
    localStorage.setItem('pwa.inventory.view', view);
  }, [view]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // QR codes printed by /labels contain the exhibit URL
  // (e.g. https://museumos.example.org/exhibits/abc-123). Extract the UUID and
  // jump to the PWA's own detail route. Also accept bare display IDs (PC00509)
  // and bare UUIDs as fall-backs for flexibility.
  const handleScan = useCallback(async (text: string) => {
    setScanOpen(false);
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const uuid = text.match(uuidRe)?.[0];
    if (uuid) {
      navigate(`/exhibit/${uuid}`);
      return;
    }
    // Try as display_id, look it up via the search API
    const displayId = text.trim();
    if (/^[A-Z]{2}\d+$/i.test(displayId)) {
      try {
        const res = await api.get<SearchResult>(`/exhibits?q=${encodeURIComponent(displayId)}&limit=1`);
        const hit = res.items.find((it) => it.displayId === displayId.toUpperCase()) ?? res.items[0];
        if (hit) {
          navigate(`/exhibit/${hit.id}`);
          return;
        }
      } catch { /* fall through to toast */ }
    }
    toast.error(t('pwa.scan.unrecognized'));
  }, [navigate, t]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  const filterKey = useMemo(() => `${debouncedQ}|${categoryId}`, [debouncedQ, categoryId]);
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['inventory', filterKey],
    queryFn: ({ pageParam = 1 }) => {
      const p = new URLSearchParams();
      if (debouncedQ) p.set('q', debouncedQ);
      p.set('page', String(pageParam));
      p.set('limit', String(PAGE_SIZE));
      p.set('sortBy', 'displayId');
      p.set('sortOrder', 'asc');
      if (categoryId) p.set('categoryId', categoryId);
      return api.get<SearchResult>(`/exhibits?${p.toString()}`);
    },
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Pull-to-refresh: drag the inventory list down to refetch.
  const { pull, refreshing } = usePullToRefresh({
    onRefresh: () => refetch(),
  });

  // Sentinel for infinite scroll
  const sentinelRef = useRef<HTMLElement | null>(null);
  const setSentinel = useCallback((node: HTMLElement | null) => {
    sentinelRef.current = node;
  }, []);
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '300px' },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div className="flex flex-col">
      {/* Sticky search header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-sm">
        <h1 className="mb-2 font-display text-xl font-bold">{t('pwa.tabs.inventory')}</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('exhibits.searchPlaceholder') as string}
              className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-9 text-base focus:border-primary focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setScanOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-input hover:bg-muted"
            aria-label={t('pwa.scan.title') as string}
          >
            <QrCode className="h-4 w-4" />
          </button>
        </div>

        {/* Category select + view-mode segmented control. Native <select>
            triggers the OS picker — fastest UX on phones. */}
        <div className="mt-3 flex items-center gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`h-9 flex-1 rounded-full border bg-background px-3 text-sm focus:border-primary focus:outline-none ${
              categoryId ? 'border-primary text-primary' : 'border-input'
            }`}
            aria-label={t('exhibits.filters') as string}
          >
            <option value="">{t('common.all')}</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {isEl ? c.nameEl : c.nameEn}
              </option>
            ))}
          </select>
          <div className="flex h-9 items-center rounded-full border border-input bg-background p-0.5" role="group" aria-label="View mode">
            {([
              { id: 'list', icon: Rows3, label: t('exhibits.viewList') },
              { id: 'grid-small', icon: Grid3x3, label: t('exhibits.viewGridSmall') },
              { id: 'grid-large', icon: LayoutGrid, label: t('exhibits.viewGridLarge') },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  view === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
                aria-label={label as string}
                aria-pressed={view === id}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {total.toLocaleString()} {t('exhibits.title').toLowerCase()}
        </p>
      </header>

      {/* Pull-to-refresh indicator — sits inside the scroll area and tracks
          the live pull distance with a transform on the wrapper below. */}
      {(pull > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-muted-foreground"
          style={{ height: refreshing ? 48 : pull }}
        >
          {refreshing
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <span className="text-xs">↓ {Math.min(100, Math.round((pull / 70) * 100))}%</span>}
        </div>
      )}

      {/* Empty + loading states render the same regardless of view. */}
      {!isLoading && items.length === 0 && (
        <p className="px-8 py-16 text-center text-sm text-muted-foreground">{t('exhibits.noResults')}</p>
      )}

      {view === 'list' ? (
        <ul className="divide-y divide-border">
          {isLoading && Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
          {items.map((ex) => (
            <li key={ex.id}>
              <Link
                to={`/exhibit/${ex.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-muted"
              >
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {ex.primaryImageUrl ? (
                    <img
                      src={ex.primaryThumbnailUrl ?? ex.primaryImageUrl}
                      alt={ex.exhibitName}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (ex.primaryImageUrl && el.src !== ex.primaryImageUrl) el.src = ex.primaryImageUrl;
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary">{ex.displayId}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{isEl ? ex.category.nameEl : ex.category.nameEn}</span>
                  </div>
                  <p className="truncate text-sm font-medium">{ex.exhibitName}</p>
                  {(ex.manufacturer || ex.year) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {ex.manufacturer ?? ''}
                      {ex.manufacturer && ex.year ? ' · ' : ''}
                      {ex.year ?? ''}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {hasNextPage && (
            <li ref={setSentinel} className="flex items-center justify-center py-6">
              {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </li>
          )}
        </ul>
      ) : (
        // Grid view: square thumbnails. 3 cols for small, 2 for large. The
        // tile renders the displayId as an overlay so even tiny thumbs stay
        // findable.
        <ul
          className={`grid gap-2 px-2 pb-2 ${view === 'grid-small' ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {isLoading && Array.from({ length: view === 'grid-small' ? 9 : 6 }).map((_, i) => (
            <li key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
          {items.map((ex) => (
            <li key={ex.id}>
              <Link to={`/exhibit/${ex.id}`} className="group block">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {ex.primaryImageUrl ? (
                    <img
                      src={ex.primaryThumbnailUrl ?? ex.primaryImageUrl}
                      alt={ex.exhibitName}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (ex.primaryImageUrl && el.src !== ex.primaryImageUrl) el.src = ex.primaryImageUrl;
                      }}
                      className="h-full w-full object-cover transition-transform group-active:scale-[0.98]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <span
                    className={`absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono font-bold text-white backdrop-blur-sm ${
                      view === 'grid-small' ? 'text-[9px]' : 'text-[10px]'
                    }`}
                  >
                    {ex.displayId}
                  </span>
                </div>
                {view === 'grid-large' && (
                  <p className="mt-1.5 line-clamp-2 px-0.5 text-xs leading-snug">{ex.exhibitName}</p>
                )}
              </Link>
            </li>
          ))}
          {hasNextPage && (
            <li
              ref={setSentinel}
              className={`flex items-center justify-center py-6 ${
                view === 'grid-small' ? 'col-span-3' : 'col-span-2'
              }`}
            >
              {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </li>
          )}
        </ul>
      )}

      <QrScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScan} />
    </div>
  );
}
