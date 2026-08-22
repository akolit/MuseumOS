import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Check, X, ChevronDown, Loader2, Plus } from 'lucide-react';
import { api } from '@/lib/api';

export interface DonorOption { id: string; name: string }

// Searchable donor combobox with inline "create new donor". Used by both the
// new-exhibit form and the exhibit edit form so the donor field behaves the
// same in both places (the donor list is large — a plain <select> is unusable).
export function DonorPicker({
  donors,
  value,
  onChange,
}: {
  donors: DonorOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = donors.find((d) => d.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return donors.slice(0, 50);
    return donors.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 50);
  }, [query, donors]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return donors.some((d) => d.name.toLowerCase() === q);
  }, [query, donors]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (open && wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (open && e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const addMutation = useMutation({
    mutationFn: (name: string) => api.post<DonorOption>('/donors', { name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      onChange(created.id);
      setQuery('');
      setOpen(false);
    },
  });

  function handleAdd() {
    const trimmed = query.trim();
    if (!trimmed || addMutation.isPending || exactMatch) return;
    addMutation.mutate(trimmed);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex w-full items-center justify-between rounded-control border border-input bg-background px-3 py-2.5 text-left text-base hover:bg-muted/30"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? selected.name : t('exhibits.noneOptional')}
        </span>
        <div className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); } }}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              title={t('exhibits.donorClear')}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (matches.length === 1) {
                      onChange(matches[0]!.id);
                      setQuery('');
                      setOpen(false);
                    } else if (query.trim() && !exactMatch) {
                      handleAdd();
                    }
                  }
                }}
                placeholder={t('exhibits.donorSearch')}
                className="w-full rounded border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && !query.trim() && (
              <p className="px-3 py-3 text-center text-sm text-muted-foreground">{t('exhibits.donorNoMatches')}</p>
            )}
            {matches.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => { onChange(d.id); setQuery(''); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                  d.id === value ? 'bg-primary/5 font-medium text-primary' : ''
                }`}
              >
                <span className="truncate">{d.name}</span>
                {d.id === value && <Check className="h-4 w-4" />}
              </button>
            ))}
            {matches.length === 0 && query.trim() && (
              <p className="px-3 py-3 text-center text-sm text-muted-foreground">{t('exhibits.donorNoMatches')}</p>
            )}
          </div>
          {query.trim() && !exactMatch && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={handleAdd}
                disabled={addMutation.isPending}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {addMutation.isPending
                  ? t('exhibits.donorAddingNew')
                  : t('exhibits.donorAddNew', { name: query.trim() })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
