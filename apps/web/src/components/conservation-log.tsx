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
import {
  MentionText, MentionTextarea, useMentionResolver,
  type MentionMaps,
} from '@/components/exhibit-mentions';

const NOTE_TYPES = [
  'acquired', 'cleaned', 'repaired', 'maintenance', 'inspected',
  'photographed', 'displayed', 'damaged', 'other',
] as const;
type NoteType = (typeof NOTE_TYPES)[number];

// Icon + accent colour per type. Same vocabulary as the PWA — kept here
// rather than in @museumos/ui because lucide-react imports differ between
// admin and PWA bundles (tree-shaking).
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
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const canWrite = hasPermission('exhibit:write');
  const canDeleteOthers = hasPermission('exhibit:delete');

  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', exhibitId, order],
    queryFn: () => api.get<Note[]>(`/exhibits/${exhibitId}/notes?order=${order}`),
  });

  // Resolve every @exhibit mention across all notes in one request, so each
  // mention can render as a link to its exhibit.
  const mentions = useMentionResolver(useMemo(() => (notes ?? []).map((n) => n.text), [notes]));

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => api.delete<void>(`/exhibits/${exhibitId}/notes/${noteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', exhibitId] });
      toast.success(t('toast.deleted'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  function canEdit(note: Note): boolean {
    if (!canWrite) return false;
    return note.authorId === user?.id || canDeleteOthers;
  }
  function canDelete(note: Note): boolean {
    return canDeleteOthers || (canWrite && note.authorId === user?.id);
  }

  return (
    <div className="border-t border-border p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">{t('notes.title')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1 rounded-control border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            title={t('notes.toggleOrder') as string}
          >
            <ArrowUpDown className="h-3 w-3" />
            {order === 'desc' ? t('notes.orderNewest') : t('notes.orderOldest')}
          </button>
          {canWrite && (
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('notes.add')}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {!isLoading && (!notes || notes.length === 0) && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('notes.empty')}</p>
      )}

      {notes && notes.length > 0 && (
        <ul className="space-y-3">
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              mentions={mentions}
              onEdit={canEdit(n) ? () => setEditing(n) : null}
              onDelete={canDelete(n) ? () => {
                if (confirm(t('notes.deleteConfirm') as string)) {
                  deleteMutation.mutate(n.id);
                }
              } : null}
            />
          ))}
        </ul>
      )}

      {addOpen && (
        <NoteModal
          exhibitId={exhibitId}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editing && (
        <NoteModal
          exhibitId={exhibitId}
          note={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NoteRow({
  note,
  mentions,
  onEdit,
  onDelete,
}: {
  note: Note;
  mentions: MentionMaps;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const { t } = useTranslation();
  const meta = TYPE_META[note.type] ?? TYPE_META.other;
  const Icon = meta.icon;

  return (
    <li className="group flex gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted ${meta.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">{t(`notes.types.${note.type}`)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(note.occurredAt).toLocaleDateString()}
            </span>
          </div>
          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {onEdit && (
                <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:bg-muted">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        <MentionText text={note.text} mentions={mentions} className="mt-1 whitespace-pre-wrap text-sm" />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          — {note.authorDisplayName ?? t('notes.unknownAuthor')}
        </p>
      </div>
    </li>
  );
}

function NoteModal({
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate({ type, occurredAt, text }); }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-medium">{t(isEdit ? 'notes.editTitle' : 'notes.addTitle')}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('notes.fields.type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NoteType)}
                className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm"
              >
                {NOTE_TYPES.map((nt) => (
                  <option key={nt} value={nt}>{t(`notes.types.${nt}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('notes.fields.date')}</label>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('notes.fields.text')}</label>
            <MentionTextarea
              value={text}
              onChange={setText}
              rows={4}
              maxLength={5000}
              className="w-full resize-y rounded-control border border-input bg-background px-3 py-2 text-sm"
              placeholder={t('notes.fields.textPlaceholder') as string}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('notes.mentionTip')}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control px-3 py-1.5 text-sm text-muted-foreground"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
