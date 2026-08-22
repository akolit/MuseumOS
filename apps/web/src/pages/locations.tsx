import { useState, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Check, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Location {
  id: string;
  code: string;
  nameEn: string | null;
  nameEl: string | null;
  _count?: { exhibits: number };
}

type SortKey = 'code' | 'nameEn' | 'nameEl' | 'exhibits';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, current, direction, onSort, className }: {
  label: string; sortKey: SortKey; current: SortKey; direction: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2.5 font-medium transition-colors hover:text-primary ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3 opacity-0" />
        )}
      </span>
    </th>
  );
}

export function LocationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ code: '', nameEn: '', nameEl: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newFields, setNewFields] = useState({ code: '', nameEn: '', nameEl: '' });
  const [sortBy, setSortBy] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: locations, isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<Location[]>('/locations'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { code: string; nameEn?: string; nameEl?: string }) =>
      api.post('/locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setShowAdd(false);
      setNewFields({ code: '', nameEn: '', nameEl: '' });
      toast.success(t('toast.created'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; code?: string; nameEn?: string; nameEl?: string }) =>
      api.patch(`/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setEditId(null);
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  function startEdit(loc: Location) {
    setEditId(loc.id);
    setEditFields({ code: loc.code, nameEn: loc.nameEn ?? '', nameEl: loc.nameEl ?? '' });
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    const list = [...(locations ?? [])];
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'code') cmp = a.code.localeCompare(b.code);
      else if (sortBy === 'nameEn') cmp = (a.nameEn ?? '').localeCompare(b.nameEn ?? '');
      else if (sortBy === 'nameEl') cmp = (a.nameEl ?? '').localeCompare(b.nameEl ?? '');
      else cmp = (a._count?.exhibits ?? 0) - (b._count?.exhibits ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [locations, sortBy, sortDir]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('locations.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {locations ? t('locations.count', { count: locations.length }) : t('common.loading')}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('locations.addLocation')}
        </button>
      </div>

      {showAdd && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('locations.code')} *</label>
              <input
                value={newFields.code}
                onChange={(e) => setNewFields({ ...newFields, code: e.target.value })}
                placeholder={t('locations.codePlaceholder') as string}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('locations.nameEn')}</label>
              <input
                value={newFields.nameEn}
                onChange={(e) => setNewFields({ ...newFields, nameEn: e.target.value })}
                placeholder={t('locations.namePlaceholder') as string}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('locations.nameEl')}</label>
              <input
                value={newFields.nameEl}
                onChange={(e) => setNewFields({ ...newFields, nameEl: e.target.value })}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => newFields.code.trim() && createMutation.mutate({
                code: newFields.code.trim(),
                nameEn: newFields.nameEn.trim() || undefined,
                nameEl: newFields.nameEl.trim() || undefined,
              })}
              disabled={!newFields.code.trim() || createMutation.isPending}
              className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t('common.save')}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewFields({ code: '', nameEn: '', nameEl: '' }); }}
              className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <SortHeader label={t('locations.code')} sortKey="code" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <SortHeader label={t('locations.nameEn')} sortKey="nameEn" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <SortHeader label={t('locations.nameEl')} sortKey="nameEl" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <SortHeader label={t('locations.exhibits')} sortKey="exhibits" current={sortBy} direction={sortDir} onSort={toggleSort} className="text-right" />
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('locations.noLocations')}</td></tr>
            ) : (
              sorted.map((loc) => {
                const isEditing = editId === loc.id;
                const rowClick = !isEditing
                  ? () => navigate(`/exhibits?locationId=${loc.id}`)
                  : undefined;
                const stop = (e: ReactMouseEvent) => e.stopPropagation();
                return (
                <tr
                  key={loc.id}
                  onClick={rowClick}
                  className={`border-b border-border last:border-0 transition-colors ${
                    isEditing ? '' : 'cursor-pointer hover:bg-muted/30'
                  }`}
                  title={isEditing ? undefined : t('locations.seeExhibits', { code: loc.code })}
                >
                  {isEditing ? (
                    <>
                      <td className="px-3 py-1.5" onClick={stop}>
                        <input value={editFields.code} onChange={(e) => setEditFields({ ...editFields, code: e.target.value })}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm font-mono" />
                      </td>
                      <td className="px-3 py-1.5" onClick={stop}>
                        <input value={editFields.nameEn} onChange={(e) => setEditFields({ ...editFields, nameEn: e.target.value })}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-1.5" onClick={stop}>
                        <input value={editFields.nameEl} onChange={(e) => setEditFields({ ...editFields, nameEl: e.target.value })}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs text-primary">{loc.code}</td>
                      <td className="px-3 py-2">{loc.nameEn ?? '-'}</td>
                      <td className="px-3 py-2">{loc.nameEl ?? '-'}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {loc._count?.exhibits ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={stop}>
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => updateMutation.mutate({
                            id: loc.id,
                            code: editFields.code.trim(),
                            nameEn: editFields.nameEn.trim() || undefined,
                            nameEl: editFields.nameEl.trim() || undefined,
                          })}
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                          disabled={updateMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditId(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(loc)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
