import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Archive, X } from 'lucide-react';
import { api } from '@/lib/api';

interface SearchResult {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  categoryCode: string;
  categoryNameEn: string;
  categoryNameEl: string;
  primaryThumbnailUrl: string | null;
}

export function CommandPalette() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState<
    { url: string; displayId: string; name: string; left: number; top: number } | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewShowTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewHideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Rollover image preview, anchored beside the hovered result (same idea as the
  // exhibits list). Preloaded so the card paints instantly; falls back to nothing
  // for results without a photo.
  function showPreview(result: SearchResult, row: HTMLElement) {
    if (!result.primaryThumbnailUrl) { hidePreview(); return; }
    clearTimeout(previewHideTimer.current);
    const url = result.primaryThumbnailUrl;
    new Image().src = url;
    clearTimeout(previewShowTimer.current);
    previewShowTimer.current = setTimeout(() => {
      const r = row.getBoundingClientRect();
      const W = 196, H = 172;
      let left = r.right + 12;
      if (left + W > window.innerWidth - 8) left = r.left - W - 12;
      left = Math.max(8, left);
      const top = Math.max(8, Math.min(r.top + r.height / 2 - H / 2, window.innerHeight - H - 8));
      setPreview({ url, displayId: result.displayId, name: result.exhibitName, left, top });
    }, 60);
  }
  function hidePreview() {
    clearTimeout(previewShowTimer.current);
    previewHideTimer.current = setTimeout(() => setPreview(null), 80);
  }

  const isEl = i18n.language === 'el';

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const searchExhibits = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<SearchResult[]>(
        `/exhibits/search?q=${encodeURIComponent(q.trim())}&limit=10`,
      );
      setResults(data);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    setPreview(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchExhibits(value), 250);
  }

  function selectResult(result: SearchResult) {
    setOpen(false);
    navigate(`/exhibits/${result.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      selectResult(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-control border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-3.5 w-3.5" />
        <span>{t('search.placeholder')}</span>
        <kbd className="ml-2 hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {open && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('search.inputPlaceholder')}
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain p-2">
              {loading && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('common.loading')}
                </div>
              )}

              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('search.noResults')}
                </div>
              )}

              {!loading && query.trim().length > 0 && query.trim().length < 2 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('search.minChars')}
                </div>
              )}

              {!loading && query.trim().length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('search.hint')}
                </div>
              )}

              {results.map((result, i) => (
                <button
                  key={result.id}
                  onClick={() => selectResult(result)}
                  onMouseEnter={(e) => { setActiveIndex(i); showPreview(result, e.currentTarget); }}
                  onMouseLeave={hidePreview}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === activeIndex
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Archive className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {result.displayId}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {result.exhibitName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span>{isEl ? result.categoryNameEl : result.categoryNameEn}</span>
                      {result.manufacturer && (
                        <>
                          <span className="text-border">·</span>
                          <span>{result.manufacturer}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {i === activeIndex && (
                    <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            {results.length > 0 && (
              <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <span><kbd className="font-mono">↑↓</kbd> {t('search.navigate')}</span>
                <span><kbd className="font-mono">↵</kbd> {t('search.open')}</span>
                <span><kbd className="font-mono">esc</kbd> {t('search.close')}</span>
              </div>
            )}
          </div>

          {/* Rollover image preview, anchored beside the hovered result. */}
          {preview && (
            <div
              className="command-peek pointer-events-none fixed z-[60] w-[188px]"
              style={{ left: preview.left, top: preview.top }}
            >
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <div className="h-32 w-full bg-muted">
                  <img src={preview.url} alt="" decoding="async" className="h-full w-full object-cover" />
                </div>
                <div className="px-2.5 py-1.5">
                  <div className="font-mono text-[11px] text-primary">{preview.displayId}</div>
                  <div className="line-clamp-2 text-xs leading-tight text-muted-foreground">{preview.name}</div>
                </div>
              </div>
              <style>{`@keyframes commandPeekIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.command-peek{animation:commandPeekIn .13s cubic-bezier(.2,.8,.3,1)}@media (prefers-reduced-motion:reduce){.command-peek{animation:none}}`}</style>
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
