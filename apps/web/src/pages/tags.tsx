import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  _count?: { exhibits: number };
}

export function TagsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ name: '', color: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newFields, setNewFields] = useState({ name: '', color: '#6366f1' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<Tag[]>('/tags'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color?: string }) => api.post('/tags', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setShowAdd(false);
      setNewFields({ name: '', color: '#6366f1' });
      toast.success(t('toast.created'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; color?: string }) =>
      api.patch(`/tags/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setEditId(null);
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setDeleteConfirm(null);
      toast.success(t('toast.deleted'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const filtered = tags?.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('tags.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {tags ? t('tags.count', { count: tags.length }) : t('common.loading')}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('tags.addTag')}
        </button>
      </div>

      <div className="mt-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('tags.filterPlaceholder')}
          className="w-full rounded-control border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
        />
      </div>

      {showAdd && (
        <div className="mt-3 flex items-end gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('common.name')} *</label>
            <input
              value={newFields.name}
              onChange={(e) => setNewFields({ ...newFields, name: e.target.value })}
              placeholder={t('tags.tagName')}
              className="w-full rounded-control border border-input bg-background px-3 py-1.5 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && newFields.name.trim() && createMutation.mutate({
                name: newFields.name.trim(),
                color: newFields.color || undefined,
              })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('tags.color')}</label>
            <input
              type="color"
              value={newFields.color}
              onChange={(e) => setNewFields({ ...newFields, color: e.target.value })}
              className="h-[34px] w-12 cursor-pointer rounded-control border border-input"
            />
          </div>
          <button
            onClick={() => newFields.name.trim() && createMutation.mutate({
              name: newFields.name.trim(),
              color: newFields.color || undefined,
            })}
            disabled={!newFields.name.trim() || createMutation.isPending}
            className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewFields({ name: '', color: '#6366f1' }); }}
            className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common.noResults')}</p>
        ) : (
          filtered.map((tag) => (
            <div key={tag.id} className="group relative">
              {editId === tag.id ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                  <input
                    type="color"
                    value={editFields.color || '#6366f1'}
                    onChange={(e) => setEditFields({ ...editFields, color: e.target.value })}
                    className="h-6 w-6 cursor-pointer rounded border-0"
                  />
                  <input
                    value={editFields.name}
                    onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                    className="w-32 rounded-control border border-input bg-background px-2 py-0.5 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && editFields.name.trim() && updateMutation.mutate({
                      id: tag.id,
                      name: editFields.name.trim(),
                      color: editFields.color || undefined,
                    })}
                  />
                  <button
                    onClick={() => updateMutation.mutate({
                      id: tag.id,
                      name: editFields.name.trim(),
                      color: editFields.color || undefined,
                    })}
                    className="rounded p-0.5 text-green-600 hover:bg-green-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEditId(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : deleteConfirm === tag.id ? (
                <div className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1.5">
                  <span className="text-xs text-destructive">Delete?</span>
                  <button
                    onClick={() => deleteMutation.mutate(tag.id)}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    disabled={deleteMutation.isPending}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div
                  className="flex cursor-default items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted/30"
                  style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
                >
                  {tag.color && (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  )}
                  {tag.name}
                  <span className="ml-1 text-xs opacity-60">
                    {tag._count?.exhibits ?? 0}
                  </span>
                  <button
                    onClick={() => { setEditId(tag.id); setEditFields({ name: tag.name, color: tag.color ?? '' }); }}
                    className="ml-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(tag.id)}
                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
