import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, Plus, Search, RefreshCw, Loader2, Eye, EyeOff, Pencil, Trash2,
  ArrowUp, ArrowDown, X, Save, ExternalLink, CircleDot, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

interface TLExhibit { id: string; displayId: string; exhibitName: string; score: number; thumbnailUrl: string | null }
interface TLModel {
  id: string; name: string; year: number | null;
  imageUrl: string | null; imageUrlRaw: string | null;
  type: string | null; country: string | null; description: string | null;
  wikidataQid: string | null; source: string; hidden: boolean;
  owned: boolean; exhibits: TLExhibit[];
}
interface TLCompany { id: string; name: string; wikidataQids: string[]; displayOrder: number; models: TLModel[] }

interface WdCandidate { id: string; label: string; description: string | null }
interface WdEntity {
  qid: string; url: string;
  description: { en: string | null; el: string | null };
  wikipedia: { en: string | null; el: string | null };
  image: string | null;
  facts: { key: string; label: string; value: string }[];
}

type SourceFilter = 'all' | 'manual' | 'epocalc' | 'wikidata';

export function TimelineManagePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('timeline:write');

  const { data, isLoading } = useQuery({
    queryKey: ['timeline', 'manage'],
    queryFn: () => api.get<{ companies: TLCompany[] }>('/timeline?includeHidden=true'),
  });
  const companies = useMemo(() => data?.companies ?? [], [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showHidden, setShowHidden] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modelEdit, setModelEdit] = useState<TLModel | 'new' | null>(null);
  const [companyEdit, setCompanyEdit] = useState<TLCompany | 'new' | null>(null);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'model' | 'company'; id: string; label: string } | null>(null);

  const selected = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['timeline'] });
  async function run(key: string, fn: () => Promise<unknown>, okMsg?: string) {
    setBusyId(key);
    try { await fn(); await invalidate(); if (okMsg) toast.success(okMsg); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  }

  const filteredModels = useMemo(() => {
    if (!selected) return [];
    const q = search.trim().toLowerCase();
    return selected.models
      .filter((m) => (showHidden || !m.hidden))
      .filter((m) => (sourceFilter === 'all' || m.source === sourceFilter))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.type ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.name.localeCompare(b.name));
  }, [selected, search, sourceFilter, showHidden]);

  if (!canManage) {
    return <div className="p-8 text-sm text-muted-foreground">{t('common.noResults')}</div>;
  }

  async function moveCompany(c: TLCompany, dir: -1 | 1) {
    const ordered = [...companies].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    const i = ordered.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const a = ordered[i]!, b = ordered[j]!;
    await run(`move-${c.id}`, async () => {
      await api.patch(`/timeline/companies/${a.id}`, { displayOrder: j });
      await api.patch(`/timeline/companies/${b.id}`, { displayOrder: i });
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/timeline')} className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> {t('timeline.backToTimeline')}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{t('timeline.manageTitle')}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('timeline.manageSubtitle')}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Companies pane */}
        <aside className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">{t('timeline.companies')}</span>
            <button onClick={() => setCompanyEdit('new')} className="flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
              <Plus className="h-3.5 w-3.5" /> {t('common.add')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {[...companies].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)).map((c, idx, arr) => {
              const owned = c.models.filter((m) => m.owned).length;
              const hiddenN = c.models.filter((m) => m.hidden).length;
              const active = selected?.id === c.id;
              return (
                <div key={c.id} className={`group mb-0.5 flex items-center gap-1 rounded-control px-2 py-1.5 ${active ? 'bg-muted' : 'hover:bg-muted/50'}`}>
                  <button onClick={() => setSelectedId(c.id)} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-sm ${active ? 'font-medium' : ''}`}>{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {owned}/{c.models.length}{hiddenN > 0 ? ` · ${hiddenN} ${t('timeline.hidden').toLowerCase()}` : ''}
                    </span>
                  </button>
                  <div className="flex flex-col opacity-0 group-hover:opacity-100">
                    <button title={t('timeline.moveUp') as string} disabled={idx === 0} onClick={() => moveCompany(c, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                    <button title={t('timeline.moveDown') as string} disabled={idx === arr.length - 1} onClick={() => moveCompany(c, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                  <button title={t('common.edit') as string} onClick={() => setCompanyEdit(c)} className="text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
            {isLoading && <div className="px-2 py-4 text-center text-xs text-muted-foreground">{t('common.loading')}</div>}
          </div>
        </aside>

        {/* Models pane */}
        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('common.noResults')}</div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <span className="mr-1 text-sm font-semibold">{selected.name}</span>
                <span className="text-xs text-muted-foreground">{t('timeline.modelsCount', { count: filteredModels.length })}</span>
                <div className="relative ml-2">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('timeline.searchModels') as string}
                    className="h-8 w-44 rounded-control border border-input bg-background pl-7 pr-2 text-xs" />
                </div>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                  className="h-8 rounded-control border border-input bg-background px-2 text-xs">
                  <option value="all">{t('timeline.allSources')}</option>
                  <option value="manual">manual</option>
                  <option value="epocalc">epocalc</option>
                  <option value="wikidata">wikidata</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> {t('timeline.showHidden')}
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setEnrichOpen(true)} className="flex items-center gap-1.5 rounded-control border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> {t('timeline.autoEnrich')}
                  </button>
                  <button onClick={() => setModelEdit('new')} className="flex items-center gap-1.5 rounded-control bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    <Plus className="h-3.5 w-3.5" /> {t('timeline.addModel')}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-16 px-3 py-2 font-medium">{t('exhibit.year')}</th>
                      <th className="px-3 py-2 font-medium">{t('common.name')}</th>
                      <th className="px-3 py-2 font-medium">{t('timeline.fieldType')}</th>
                      <th className="px-3 py-2 font-medium">{t('timeline.fieldCountry')}</th>
                      <th className="px-3 py-2 font-medium">{t('timeline.colSource')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModels.map((m) => (
                      <tr key={m.id} className={`border-t border-border hover:bg-muted/40 ${m.hidden ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{m.year ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          <button onClick={() => setModelEdit(m)} className="flex items-center gap-1.5 text-left hover:underline">
                            {m.owned && <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />}
                            <span className="truncate">{m.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{m.type ?? '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{m.country ?? '—'}</td>
                        <td className="px-3 py-1.5"><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{m.source}</span></td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <button title={m.hidden ? t('timeline.show') as string : t('timeline.hide') as string}
                              onClick={() => run(`hide-${m.id}`, () => api.patch(`/timeline/models/${m.id}`, { hidden: !m.hidden }))}
                              className="rounded p-1 text-muted-foreground hover:bg-muted">
                              {m.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                            <button title={t('common.edit') as string} onClick={() => setModelEdit(m)} className="rounded p-1 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                            <button title={t('common.delete') as string} onClick={() => setConfirm({ kind: 'model', id: m.id, label: m.name })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredModels.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">{t('timeline.noModelsMatch')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {modelEdit && selected && (
        <ModelEditor company={selected} model={modelEdit === 'new' ? null : modelEdit} busy={busyId} run={run} onClose={() => setModelEdit(null)} />
      )}
      {enrichOpen && selected && (
        <EnrichReview company={selected} busy={busyId} run={run} onClose={() => setEnrichOpen(false)} />
      )}
      {companyEdit && (
        <CompanyEditor company={companyEdit === 'new' ? null : companyEdit} busy={busyId} run={run}
          onDelete={(c) => setConfirm({ kind: 'company', id: c.id, label: c.name })} onClose={() => setCompanyEdit(null)} />
      )}
      {confirm && (
        <ConfirmDialog
          label={confirm.label}
          message={confirm.kind === 'model' ? t('timeline.deleteModelConfirm', { name: confirm.label }) : t('timeline.deleteCompanyConfirm', { name: confirm.label })}
          busy={busyId === `del-${confirm.id}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(`del-${confirm.id}`, () =>
            api.delete(confirm.kind === 'model' ? `/timeline/models/${confirm.id}` : `/timeline/companies/${confirm.id}`),
            confirm.kind === 'model' ? t('timeline.modelDeleted') as string : t('timeline.companyDeleted') as string,
          ).then(() => { setConfirm(null); setModelEdit(null); setCompanyEdit(null); })}
        />
      )}
    </div>
  );
}

// ---- Model editor dialog ----
function ModelEditor({ company, model, busy, run, onClose }: {
  company: TLCompany; model: TLModel | null; busy: string | null;
  run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    name: model?.name ?? '',
    year: model?.year != null ? String(model.year) : '',
    type: model?.type ?? '',
    country: model?.country ?? '',
    wikidataQid: model?.wikidataQid ?? '',
    imageUrl: model?.imageUrlRaw ?? '',
    description: model?.description ?? '',
    hidden: model?.hidden ?? false,
  });
  const key = model ? `save-${model.id}` : 'create-model';
  const valid = f.name.trim().length > 0 && (!f.year || /^\d{4}$/.test(f.year.trim())) && (!f.wikidataQid.trim() || /^Q\d+$/.test(f.wikidataQid.trim()));

  // --- "Suggest from Wikipedia": look the model up on Wikidata and pre-fill
  // blank fields (image, description, country, year, QID). Never overwrites
  // values the curator already typed — they review and Save.
  const [sug, setSug] = useState<{ loading: boolean; candidates: WdCandidate[] | null; msg: string | null }>({ loading: false, candidates: null, msg: null });

  async function applyEntity(qid: string) {
    setSug({ loading: true, candidates: null, msg: null });
    try {
      const e = await api.get<WdEntity>(`/integrations/wikidata/entity/${qid}`);
      const country = e.facts.find((x) => x.key === 'country')?.value ?? '';
      const year = e.facts.find((x) => x.key === 'year')?.value ?? '';
      setF((p) => ({
        ...p,
        wikidataQid: qid,
        imageUrl: p.imageUrl || e.image || '',
        description: p.description || e.description.en || e.description.el || '',
        country: p.country || country,
        year: p.year || year,
      }));
      setSug({ loading: false, candidates: null, msg: t('timeline.suggestApplied') as string });
    } catch (err) { setSug({ loading: false, candidates: null, msg: err instanceof Error ? err.message : String(err) }); }
  }

  async function suggest() {
    setSug({ loading: true, candidates: null, msg: null });
    try {
      const qid = f.wikidataQid.trim();
      if (/^Q\d+$/.test(qid)) { await applyEntity(qid); return; }
      const q = `${company.name} ${f.name}`.trim();
      const { candidates } = await api.get<{ candidates: WdCandidate[] }>(`/integrations/wikidata/search?q=${encodeURIComponent(q)}`);
      if (!candidates.length) { setSug({ loading: false, candidates: null, msg: t('timeline.suggestNoMatch') as string }); return; }
      if (candidates.length === 1) { await applyEntity(candidates[0]!.id); return; }
      setSug({ loading: false, candidates, msg: null });
    } catch (err) { setSug({ loading: false, candidates: null, msg: err instanceof Error ? err.message : String(err) }); }
  }

  function save() {
    const body = {
      name: f.name.trim(),
      year: f.year.trim() ? parseInt(f.year, 10) : null,
      type: f.type.trim() || null,
      country: f.country.trim() || null,
      wikidataQid: f.wikidataQid.trim() || null,
      imageUrl: f.imageUrl.trim() || null,
      description: f.description.trim() || null,
    };
    run(key,
      () => model
        ? api.patch(`/timeline/models/${model.id}`, body)
        : api.post('/timeline/models', { companyId: company.id, ...body }),
      model ? t('timeline.modelSaved') as string : t('timeline.modelCreated') as string,
    ).then(onClose);
  }

  return (
    <Modal onClose={onClose} title={model ? t('timeline.editModelTitle') : t('timeline.newModelTitle')} wide>
      <div className="mb-3 rounded-control border border-border bg-muted/40 p-2">
        <div className="flex items-center gap-2">
          <button disabled={!f.name.trim() || sug.loading} onClick={suggest}
            className="flex items-center gap-1.5 rounded-control border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            {sug.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
            {t('timeline.suggest')}
          </button>
          {sug.msg && <span className="text-xs text-muted-foreground">{sug.msg}</span>}
        </div>
        {sug.candidates && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-border bg-background">
            {sug.candidates.map((c) => (
              <li key={c.id}>
                <button onClick={() => applyEntity(c.id)} className="flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left hover:bg-muted">
                  <span className="text-sm">{c.label} <span className="text-xs text-muted-foreground">({c.id})</span></span>
                  {c.description && <span className="truncate text-xs text-muted-foreground">{c.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.name')} className="col-span-2">
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('exhibit.year')}>
          <input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} placeholder="1982" className={inputCls} />
        </Field>
        <Field label={t('timeline.fieldType')}>
          <input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder={t('timeline.typePlaceholder') as string} className={inputCls} />
        </Field>
        <Field label={t('timeline.fieldCountry')}>
          <input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('timeline.fieldWikidata')}>
          <input value={f.wikidataQid} onChange={(e) => setF({ ...f, wikidataQid: e.target.value })} placeholder="Q99775" className={inputCls} />
        </Field>
        <Field label={t('timeline.fieldImageUrl')} className="col-span-2">
          <div className="flex items-start gap-2">
            {f.imageUrl.trim() && (
              <img src={f.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded border border-border object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            )}
            <input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://…" className={inputCls} />
          </div>
          {!f.imageUrl && model?.owned && <p className="mt-1 text-xs text-muted-foreground">{t('timeline.imageUrlOwnedHint')}</p>}
        </Field>
        <Field label={t('timeline.fieldDescription')} className="col-span-2">
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className={`${inputCls} resize-y`} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} /> {t('timeline.hiddenFromTimeline')}
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {model?.wikidataQid && (
            <a href={`https://www.wikidata.org/wiki/${model.wikidataQid}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> {model.wikidataQid}
            </a>
          )}
          {model?.owned && <span>{t('timeline.linkedExhibits', { count: model.exhibits.length })}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-control border border-input px-3 py-1.5 text-sm hover:bg-muted">{t('common.cancel')}</button>
          <button disabled={!valid || busy === key} onClick={save} className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Company editor dialog ----
function CompanyEditor({ company, busy, run, onDelete, onClose }: {
  company: TLCompany | null; busy: string | null;
  run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onDelete: (c: TLCompany) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    name: company?.name ?? '',
    qids: company?.wikidataQids.join(', ') ?? '',
    displayOrder: company?.displayOrder != null ? String(company.displayOrder) : '',
  });
  const key = company ? `save-co-${company.id}` : 'create-company';
  const qids = f.qids.split(',').map((q) => q.trim()).filter(Boolean);
  const valid = f.name.trim().length > 0 && qids.every((q) => /^Q\d+$/.test(q));

  function save() {
    const body = { name: f.name.trim(), wikidataQids: qids, displayOrder: f.displayOrder.trim() ? parseInt(f.displayOrder, 10) : undefined };
    run(key,
      () => company ? api.patch(`/timeline/companies/${company.id}`, body) : api.post('/timeline/companies', body),
      company ? t('timeline.companySaved') as string : t('timeline.companyAdded') as string,
    ).then(onClose);
  }

  return (
    <Modal onClose={onClose} title={company ? t('timeline.editCompanyTitle') : t('timeline.addCompany')}>
      <div className="space-y-3">
        <Field label={t('timeline.companyName')}>
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('timeline.fieldWikidataQids')}>
          <input value={f.qids} onChange={(e) => setF({ ...f, qids: e.target.value })} placeholder="Q208305, Q…" className={inputCls} />
        </Field>
        <Field label={t('timeline.displayOrder')}>
          <input value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: e.target.value })} placeholder="0" className={inputCls} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {company ? (
          <button onClick={() => onDelete(company)} className="flex items-center gap-1.5 rounded-control border border-input px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> {t('common.delete')}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-control border border-input px-3 py-1.5 text-sm hover:bg-muted">{t('common.cancel')}</button>
          <button disabled={!valid || busy === key} onClick={save} className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Confirm dialog ----
function ConfirmDialog({ message, busy, onConfirm, onCancel }: { label: string; message: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onCancel} title={t('common.confirmDeleteTitle')}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-control border border-input px-3 py-1.5 text-sm hover:bg-muted">{t('common.cancel')}</button>
        <button disabled={busy} onClick={onConfirm} className="flex items-center gap-1.5 rounded-control bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {t('common.delete')}
        </button>
      </div>
    </Modal>
  );
}

// ---- Layer B: bulk enrichment review ----
interface EnrichProposal {
  modelId: string; modelName: string; year: number | null; score: number;
  candidate: { qid: string; label: string; description: string | null } | null;
  proposed: { wikidataQid: string; imageUrl: string | null; description: string | null; country: string | null; year: number | null } | null;
}

function EnrichReview({ company, busy, run, onClose }: {
  company: TLCompany; busy: string | null;
  run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ loading: boolean; scanned: number; remaining: number; proposals: EnrichProposal[] }>({ loading: true, scanned: 0, remaining: 0, proposals: [] });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const byId = useMemo(() => new Map(company.models.map((m) => [m.id, m])), [company.models]);

  const scan = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await api.post<{ proposals: EnrichProposal[]; scanned: number; remaining: number }>(`/timeline/companies/${company.id}/enrich-scan`, { limit: 12 });
      setState({ loading: false, scanned: r.scanned, remaining: r.remaining, proposals: r.proposals });
      // Pre-check confident matches that actually carry data.
      setSel(new Set(r.proposals.filter((p) => p.proposed && p.score >= 0.6).map((p) => p.modelId)));
    } catch (e) {
      setState((s) => ({ ...s, loading: false }));
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [company.id]);

  useEffect(() => { scan(); }, [scan]);

  function fillBlanks(p: EnrichProposal): { id: string; body: Record<string, unknown> } | null {
    const m = byId.get(p.modelId);
    if (!m || !p.proposed) return null;
    const body: Record<string, unknown> = {};
    if (!m.wikidataQid && p.proposed.wikidataQid) body.wikidataQid = p.proposed.wikidataQid;
    if (!m.imageUrlRaw && p.proposed.imageUrl) body.imageUrl = p.proposed.imageUrl;
    if (!m.description && p.proposed.description) body.description = p.proposed.description;
    if (!m.country && p.proposed.country) body.country = p.proposed.country;
    if (m.year == null && p.proposed.year != null) body.year = p.proposed.year;
    return Object.keys(body).length ? { id: m.id, body } : null;
  }

  const jobs = state.proposals.filter((p) => sel.has(p.modelId)).map(fillBlanks).filter(Boolean) as { id: string; body: Record<string, unknown> }[];

  async function applySelected() {
    if (!jobs.length) { onClose(); return; }
    await run('enrich-apply', async () => {
      for (const j of jobs) await api.patch(`/timeline/models/${j.id}`, j.body);
    }, t('timeline.enrichApplied', { count: jobs.length }) as string);
    onClose();
  }

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <Modal onClose={onClose} title={t('timeline.autoEnrich')} wide>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('timeline.enrichScanned', { scanned: state.scanned, remaining: state.remaining })}</span>
        {state.loading && <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wikidata…</span>}
      </div>
      <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-control border border-border">
        {!state.loading && state.proposals.length === 0 && (
          <li className="px-3 py-10 text-center text-sm text-muted-foreground">{t('timeline.enrichAllLinked')}</li>
        )}
        {state.proposals.map((p) => {
          const has = !!p.proposed;
          const meta = has ? [p.proposed!.year, p.proposed!.country, p.proposed!.description].filter(Boolean).join(' · ') : '';
          return (
            <li key={p.modelId} className={`flex items-start gap-3 px-3 py-2 ${has ? '' : 'opacity-60'}`}>
              <input type="checkbox" disabled={!has} checked={sel.has(p.modelId)} onChange={() => toggle(p.modelId)} className="mt-1.5" />
              {p.proposed?.imageUrl
                ? <img src={p.proposed.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                : <div className="h-12 w-12 shrink-0 rounded border border-dashed border-border" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.modelName}</span>
                  {p.year != null && <span className="text-xs text-muted-foreground">{p.year}</span>}
                  {has && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.score >= 0.6 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{Math.round(p.score * 100)}%</span>}
                </div>
                {has ? (
                  <>
                    <a href={`https://www.wikidata.org/wiki/${p.candidate!.qid}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      {p.candidate!.label} <span className="opacity-60">({p.candidate!.qid})</span> <ExternalLink className="h-3 w-3" />
                    </a>
                    {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
                  </>
                ) : <span className="text-xs text-muted-foreground">{t('timeline.suggestNoMatch')}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={scan} disabled={state.loading} className="flex items-center gap-1.5 rounded-control border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> {t('timeline.enrichRescan')}
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-control border border-input px-3 py-1.5 text-sm hover:bg-muted">{t('common.cancel')}</button>
          <button disabled={!jobs.length || busy === 'enrich-apply'} onClick={applySelected}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy === 'enrich-apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t('timeline.enrichApply', { count: jobs.length })}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Shared primitives ----
const inputCls = 'w-full rounded-control border border-input bg-background px-2.5 py-1.5 text-sm';

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, wide, children, onClose }: { title: string; wide?: boolean; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg border border-border bg-card shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
