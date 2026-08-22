import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  HandHeart, Brush, Wrench, Settings as Cog, ClipboardCheck,
  Camera, Eye, AlertTriangle, Pencil, Plus, Trash2, X, ArrowUpDown, Save, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

const NOTE_TYPES = [
  'acquired', 'cleaned', 'repaired', 'maintenance', 'inspected',
  'photographed', 'displayed', 'damaged', 'other',
] as const;
type NoteType = (typeof NOTE_TYPES)[number];

const TYPE_META: Record<NoteType, { icon: typeof HandHeart; color: string }> = {
  acquired:     { icon: HandHeart,       color: 'text-emerald-600' },
  cleaned:      { icon: Brush,           color: 'text-sky-600' },
  repaired:     { icon: Wrench,          color: 'text-amber-600' },
  maintenance:  { icon: Cog,             color: 'text-slate-500' },
  inspected:    { icon: ClipboardCheck,  color: 'text-indigo-600' },
  photographed: { icon: Camera,          color: 'text-purple-600' },
  displayed:    { icon: Eye,             color: 'text-cyan-600' },
  damaged:      { icon: AlertTriangle,   color: 'text-red-600' },
  other:        { icon: Pencil,          color: 'text-muted-foreground' },
};

interface Note {
  id: string;
  exhibitId: string;
  occurredAt: string;
  type: NoteType;
  text: string;
  authorId: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  exhibitId: string;
}

export function ConservationLog({ exhibitId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [sheetOpen, setSheetOpen] = useState<{ mode: 'add' } | { mode: 'edit'; note: Note } | null>(null);

  const canWrite = hasPermission('exhibit:write');
  const canDeleteOthers = hasPermission('exhibit:delete');

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', exhibitId, order],
    queryFn: () => api.get<Note[]>(`/exhibits/${exhibitId}/notes?order=${order}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => api.delete<void>(`/exhibits/${exhibitId}/notes/${noteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', exhibitId] });
      toast.success(t('toast.deleted'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  function canEdit(n: Note) { return canWrite && (n.authorId === user?.id || canDeleteOthers); }
  function canDelete(n: Note) { return canDeleteOthers || (canWrite && n.authorId === user?.id); }

  return (
    <section className="mt-4 border-t border-border px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('notes.title')}</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground active:bg-muted"
          >
            <ArrowUpDown className="h-3 w-3" />
            {order === 'desc' ? t('notes.orderNewest') : t('notes.orderOldest')}
          </button>
          {canWrite && (
            <button
              onClick={() => setSheetOpen({ mode: 'add' })}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
            >
              <Plus className="h-3 w-3" />
              {t('notes.add')}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {!isLoading && (!notes || notes.length === 0) && (
        <p className="py-4 text-center text-xs text-muted-foreground">{t('notes.empty')}</p>
      )}

      {notes && notes.length > 0 && (
        <ul className="space-y-2.5">
          {notes.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.other;
            const Icon = meta.icon;
            return (
              <li key={n.id} className="flex gap-2.5 rounded-lg border border-border bg-card/50 p-2.5">
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted ${meta.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium">{t(`notes.types.${n.type}`)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.occurredAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs">{n.text}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      — {n.authorDisplayName ?? t('notes.unknownAuthor')}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {canEdit(n) && (
                        <button
                          onClick={() => setSheetOpen({ mode: 'edit', note: n })}
                          className="rounded p-1 text-muted-foreground active:bg-muted"
                          aria-label={t('common.edit') as string}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {canDelete(n) && (
                        <button
                          onClick={() => {
                            if (confirm(t('notes.deleteConfirm') as string)) {
                              deleteMutation.mutate(n.id);
                            }
                          }}
                          className="rounded p-1 text-muted-foreground active:bg-muted"
                          aria-label={t('common.delete') as string}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sheetOpen && (
        <NoteSheet
          exhibitId={exhibitId}
          note={sheetOpen.mode === 'edit' ? sheetOpen.note : undefined}
          onClose={() => setSheetOpen(null)}
        />
      )}
    </section>
  );
}

function NoteSheet({
  exhibitId,
  note,
  onClose,
}: {
  exhibitId: string;
  note?: Note;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!note;

  const [type, setType] = useState<NoteType>(note?.type ?? 'other');
  const [occurredAt, setOccurredAt] = useState(
    note ? note.occurredAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [text, setText] = useState(note?.text ?? '');

  const mutation = useMutation({
    mutationFn: (payload: { type: NoteType; occurredAt: string; text: string }) => {
      const body = {
        type: payload.type,
        occurredAt: new Date(payload.occurredAt + 'T00:00:00Z').toISOString(),
        text: payload.text,
      };
      return isEdit
        ? api.patch(`/exhibits/${exhibitId}/notes/${note!.id}`, body)
        : api.post(`/exhibits/${exhibitId}/notes`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', exhibitId] });
      toast.success(t(isEdit ? 'toast.saved' : 'toast.created'));
      onClose();
    },
    onError: () => toast.error(t('toast.error')),
  });

  const canSubmit = useMemo(
    () => text.trim().length > 0 && !!occurredAt && !mutation.isPending,
    [text, occurredAt, mutation.isPending],
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-auto" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-t-2xl bg-card pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="text-base font-semibold">{t(isEdit ? 'notes.editTitle' : 'notes.addTitle')}</h2>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full active:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate({ type, occurredAt, text }); }}
            className="space-y-3 px-4 pt-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('notes.fields.type')}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as NoteType)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
                >
                  {NOTE_TYPES.map((nt) => (
                    <option key={nt} value={nt}>{t(`notes.types.${nt}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('notes.fields.date')}</label>
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('notes.fields.text')}</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={5000}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-base"
                placeholder={t('notes.fields.textPlaceholder') as string}
              />
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
