import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Save, Loader2, GripVertical, Replace } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { CategoryFieldSchema, FieldDef } from '@/lib/category-fields';

type FieldType = 'string' | 'number' | 'boolean';
type InputStyle = 'free' | 'enum' | 'suggestions' | 'autocomplete';

// Editor-local representation of one field. `key` is the JSON property name and
// becomes immutable once the field exists, so stored exhibit data never strands.
interface EditorField {
  uid: string;
  key: string;
  type: FieldType;
  input: InputStyle;
  labelEn: string;
  labelEl: string;
  labelFr: string;
  values: string[];
  isNew: boolean;
}

interface ManagedCategory {
  id: string;
  code: string;
  nameEn: string;
  nameEl: string;
  schema?: CategoryFieldSchema | null;
}

function deserialize(schema: CategoryFieldSchema | null | undefined): EditorField[] {
  const props = schema?.properties ?? {};
  return Object.entries(props).map(([key, p], i) => ({
    uid: `${key}-${i}`,
    key,
    type: (p.type as FieldType) ?? 'string',
    input: p.enum ? 'enum' : p.suggestions ? 'suggestions' : p.autocomplete ? 'autocomplete' : 'free',
    labelEn: p.title ?? '',
    labelEl: p.titleEl ?? '',
    labelFr: p.titleFr ?? '',
    values: p.enum ?? p.suggestions ?? [],
    isNew: false,
  }));
}

function serialize(fields: EditorField[]): CategoryFieldSchema {
  const properties: Record<string, FieldDef> = {};
  for (const f of fields) {
    const def: FieldDef = { type: f.type };
    if (f.labelEn.trim()) def.title = f.labelEn.trim();
    if (f.labelEl.trim()) def.titleEl = f.labelEl.trim();
    if (f.labelFr.trim()) def.titleFr = f.labelFr.trim();
    if (f.type === 'string') {
      const vals = [...new Set(f.values.map((v) => v.trim()).filter(Boolean))];
      if (f.input === 'enum') def.enum = vals;
      else if (f.input === 'suggestions') def.suggestions = vals;
      else if (f.input === 'autocomplete') def.autocomplete = true;
    }
    properties[f.key] = def;
  }
  return { type: 'object', properties };
}

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function CategoryFieldManager({
  category,
  onClose,
  onSaved,
}: {
  category: ManagedCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const qc = useQueryClient();
  const [fields, setFields] = useState<EditorField[]>(() => deserialize(category.schema));
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // {uid, attributeKey} of the field currently in the rename-value modal
  const [renaming, setRenaming] = useState<{ uid: string; attributeKey: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/categories/${category.id}`, { schema: serialize(fields) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success(t('toast.saved'));
      onSaved();
    },
    onError: () => toast.error(t('toast.error')),
  });

  const keyError = useMemo(() => {
    const seen = new Set<string>();
    for (const f of fields) {
      const k = f.key.trim();
      if (!k || !KEY_RE.test(k)) return t('categories.fields.keyInvalid', { key: k || '∅' });
      if (seen.has(k)) return t('categories.fields.keyDuplicate', { key: k });
      seen.add(k);
    }
    return null;
  }, [fields, t]);

  function update(uid: string, patch: Partial<EditorField>) {
    setFields((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  }
  function move(uid: string, dir: -1 | 1) {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function remove(uid: string) {
    setFields((fs) => fs.filter((f) => f.uid !== uid));
    if (editing === uid) setEditing(null);
    setConfirmingDelete(null);
  }
  function addField() {
    const uid = `new-${fields.length}-${fields.reduce((n, f) => n + f.key.length, 0)}`;
    setFields((fs) => [
      ...fs,
      { uid, key: '', type: 'string', input: 'free', labelEn: '', labelEl: '', labelFr: '', values: [], isNew: true },
    ]);
    setEditing(uid);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-display text-base font-semibold">{t('categories.fields.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {lang === 'el' ? category.nameEl : category.nameEn} · <span className="font-mono">{category.code}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {fields.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('categories.fields.empty')}</p>
          )}
          {fields.map((f, idx) => (
            <div key={f.uid} className="rounded-lg border border-border bg-card/50">
              {editing === f.uid ? (
                <FieldEditor
                  field={f}
                  onChange={(patch) => update(f.uid, patch)}
                  onDone={() => setEditing(null)}
                  onRename={() => setRenaming({ uid: f.uid, attributeKey: f.key })}
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">
                        {f.labelEn || f.key || t('categories.fields.untitled')}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{f.key || '—'}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t(`categories.fields.type_${f.type}`)}
                      {f.type === 'string' && f.input !== 'free' && ` · ${t(`categories.fields.input_${f.input}`)}`}
                    </p>
                  </div>
                  {confirmingDelete === f.uid ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{t('categories.fields.deleteConfirm')}</span>
                      <button type="button" onClick={() => setConfirmingDelete(null)}
                        className="rounded-control px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                        {t('common.cancel')}
                      </button>
                      <button type="button" onClick={() => remove(f.uid)}
                        className="rounded-control bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">
                        {t('common.delete')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(f.uid, -1)} disabled={idx === 0}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(f.uid, 1)} disabled={idx === fields.length - 1}
                        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditing(f.uid)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(f.uid)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <button type="button" onClick={addField}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-input py-2 text-sm text-muted-foreground hover:bg-muted">
            <Plus className="h-3.5 w-3.5" />
            {t('categories.fields.addField')}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-xs text-destructive">{keyError ?? ''}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!!keyError || mutation.isPending || editing !== null}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
      {renaming && (
        <RenameValueModal
          categoryId={category.id}
          categoryName={lang === 'el' ? category.nameEl : category.nameEn}
          attributeKey={renaming.attributeKey}
          knownValues={fields.find((f) => f.uid === renaming.uid)?.values ?? []}
          onClose={() => setRenaming(null)}
          onRenamed={(from, to) => {
            // Update the local editor state so the textarea reflects the new
            // enum value without having to re-open the drawer.
            update(renaming.uid, {
              values: (fields.find((f) => f.uid === renaming.uid)?.values ?? [])
                .map((v) => (v === from ? to : v))
                .filter((v, i, arr) => arr.indexOf(v) === i),
            });
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function FieldEditor({
  field,
  onChange,
  onDone,
  onRename,
}: {
  field: EditorField;
  onChange: (patch: Partial<EditorField>) => void;
  onDone: () => void;
  // Only available on saved (non-`isNew`) enum/suggestions fields.
  // Called when the "Rename existing value…" button is clicked.
  onRename?: () => void;
}) {
  const { t } = useTranslation();
  const inputCls = 'w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm';
  const labelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('categories.fields.key')}</label>
          {field.isNew ? (
            <input
              value={field.key}
              onChange={(e) => onChange({ key: e.target.value })}
              placeholder="author"
              className={`${inputCls} font-mono`}
              autoFocus
            />
          ) : (
            <p className="rounded-control border border-transparent bg-muted px-2 py-1.5 font-mono text-sm text-muted-foreground" title={t('categories.fields.keyLocked') as string}>
              {field.key}
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>{t('categories.fields.fieldType')}</label>
          <select value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType })} className={inputCls}>
            <option value="string">{t('categories.fields.type_string')}</option>
            <option value="number">{t('categories.fields.type_number')}</option>
            <option value="boolean">{t('categories.fields.type_boolean')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{t('common.languageEnglish')}</label>
          <input value={field.labelEn} onChange={(e) => onChange({ labelEn: e.target.value })} placeholder="Author" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('common.languageGreek')}</label>
          <input value={field.labelEl} onChange={(e) => onChange({ labelEl: e.target.value })} placeholder="Συγγραφέας" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('common.languageFrench')}</label>
          <input value={field.labelFr} onChange={(e) => onChange({ labelFr: e.target.value })} placeholder="Auteur" className={inputCls} />
        </div>
      </div>

      {field.type === 'string' && (
        <div>
          <label className={labelCls}>{t('categories.fields.inputStyle')}</label>
          <select value={field.input} onChange={(e) => onChange({ input: e.target.value as InputStyle })} className={inputCls}>
            <option value="free">{t('categories.fields.input_free')}</option>
            <option value="enum">{t('categories.fields.input_enum')}</option>
            <option value="suggestions">{t('categories.fields.input_suggestions')}</option>
            <option value="autocomplete">{t('categories.fields.input_autocomplete')}</option>
          </select>
        </div>
      )}

      {field.type === 'string' && (field.input === 'enum' || field.input === 'suggestions') && (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className={labelCls}>{t('categories.fields.values')}</label>
            {/* Rename button hidden on brand-new fields — nothing to rename
                yet and the field's server-side row doesn't exist. */}
            {!field.isNew && onRename && (
              <button
                type="button"
                onClick={onRename}
                className="inline-flex items-center gap-1 rounded-control border border-input bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                title={t('categories.fields.renameExistingHint') as string}
              >
                <Replace className="h-3 w-3" />
                {t('categories.fields.renameExisting')}
              </button>
            )}
          </div>
          <textarea
            value={field.values.join('\n')}
            onChange={(e) => onChange({ values: e.target.value.split('\n') })}
            rows={4}
            placeholder={t('categories.fields.valuesHint') as string}
            className={`${inputCls} resize-y font-mono`}
          />
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="rounded-control bg-muted px-3 py-1 text-sm font-medium hover:bg-muted/70">
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

// Rename-value modal.
//
// Two-step: the operator picks a "from" value (from the list of known
// enum entries) and types a "to" value; we hit the API with dryRun=true
// to preview how many exhibits will change, then a real POST commits it.
//
// The parent then patches its local editor state so the enum textarea
// updates without a drawer reload.
function RenameValueModal({
  categoryId,
  categoryName,
  attributeKey,
  knownValues,
  onClose,
  onRenamed,
}: {
  categoryId: string;
  categoryName: string;
  attributeKey: string;
  knownValues: string[];
  onClose: () => void;
  onRenamed: (from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [from, setFrom] = useState(knownValues[0] ?? '');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const inputCls = 'w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm';
  const labelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

  async function refreshPreview() {
    if (!from || !to || from === to) { setPreview(null); return; }
    try {
      setChecking(true);
      const res = await api.post<{ exhibitsAffected: number }>(
        `/categories/${categoryId}/rename-attribute-value`,
        { attributeKey, from, to, dryRun: true },
      );
      setPreview(res.exhibitsAffected);
    } catch {
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }

  const commit = useMutation({
    mutationFn: () => api.post<{ exhibitsAffected: number; enumRenamed: boolean }>(
      `/categories/${categoryId}/rename-attribute-value`,
      { attributeKey, from, to },
    ),
    onSuccess: (res) => {
      toast.success(t('categories.fields.renameDone', { count: res.exhibitsAffected }));
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['attr-values'] });
      qc.invalidateQueries({ queryKey: ['exhibits'] });
      onRenamed(from, to);
    },
    onError: (e: Error) => toast.error(e.message ?? t('toast.error')),
  });

  const canCommit = from && to && from !== to && !commit.isPending;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium">{t('categories.fields.renameTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {categoryName} · <span className="font-mono">{attributeKey}</span>
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <div>
            <label className={labelCls}>{t('categories.fields.renameFrom')}</label>
            <select
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPreview(null); }}
              className={inputCls}
            >
              {knownValues.length === 0 && <option value="">—</option>}
              {knownValues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('categories.fields.renameTo')}</label>
            <input
              value={to}
              onChange={(e) => { setTo(e.target.value); setPreview(null); }}
              onBlur={refreshPreview}
              placeholder={t('categories.fields.renameToPlaceholder') as string}
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="rounded-control border border-input bg-muted/40 px-3 py-2 text-xs">
            {checking
              ? t('categories.fields.renameChecking')
              : preview === null
                ? t('categories.fields.renameHint')
                : t('categories.fields.renamePreview', { count: preview, from, to })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={!canCommit}
            onClick={() => commit.mutate()}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {commit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Replace className="h-3.5 w-3.5" />}
            {t('categories.fields.renameCommit')}
          </button>
        </div>
      </div>
    </div>
  );
}
