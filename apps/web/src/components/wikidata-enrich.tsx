import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, ExternalLink, Loader2, Plus, Check } from 'lucide-react';
import { api } from '@/lib/api';

// --- Wikidata enrichment ---------------------------------------------------
export interface WikidataCandidate { id: string; label: string; description: string | null }
export interface WikidataFact { key: string; label: string; value: string }
export interface WikidataEntity {
  qid: string;
  url: string;
  label: { en: string | null; el: string | null };
  description: { en: string | null; el: string | null };
  wikipedia: { en: string | null; el: string | null };
  image: string | null;
  facts: WikidataFact[];
}

// The resolved set of values to merge into the host form.
export interface EnrichPatch {
  manufacturer?: string;
  year?: string;
  attributes: Record<string, string>;
}

type SchemaProps = Record<
  string,
  { type?: string; title?: string; titleEl?: string; enum?: string[]; suggestions?: string[]; autocomplete?: boolean }
>;

// Semantic aliases: a Wikidata fact key → the conventional attribute key used
// in the seeded schemas (computers/terminals store the CPU under `processor`,
// processors store clock speed under `speed`). Anything not listed keeps its
// own key. This is also the key we create when "Add as field" is used.
const ATTR_ALIAS: Record<string, string> = {
  cpu: 'processor',
  clockSpeed: 'speed',
};

function suggestedFieldKey(factKey: string): string {
  return ATTR_ALIAS[factKey] ?? factKey;
}

// Where a fact lands. `manufacturer`/`year` are core columns for every
// category; everything else maps to an attribute *only if that field exists in
// the category schema* (so it becomes mappable the moment it's added).
function factTarget(
  key: string,
  schemaKeys: Set<string>,
): { kind: 'core' | 'attr'; field: string } | null {
  if (key === 'manufacturer') return { kind: 'core', field: 'manufacturer' };
  if (key === 'year') return { kind: 'core', field: 'year' };
  const fk = suggestedFieldKey(key);
  return schemaKeys.has(fk) ? { kind: 'attr', field: fk } : null;
}

export function WikidataEnrichModal({
  initialQuery,
  category,
  schemaProperties,
  canManageCategory,
  onApply,
  onSchemaChanged,
  onClose,
}: {
  initialQuery: string;
  category: { id: string; code: string } | null;
  schemaProperties: SchemaProps | null;
  canManageCategory: boolean;
  onApply: (patch: EnrichPatch) => void;
  onSchemaChanged?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<WikidataCandidate[] | null>(null);
  const [entity, setEntity] = useState<WikidataEntity | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fields created during this session via "Add as field" — merged into the
  // schema PATCH (so successive adds don't clobber each other) and into the
  // live key set (so the fact becomes mappable immediately).
  const [addedProps, setAddedProps] = useState<SchemaProps>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const schemaKeys = useMemo(
    () => new Set([...Object.keys(schemaProperties ?? {}), ...Object.keys(addedProps)]),
    [schemaProperties, addedProps],
  );

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setEntity(null);
    setCandidates(null);
    try {
      const res = await api.get<{ candidates: WikidataCandidate[] }>(
        `/integrations/wikidata/search?q=${encodeURIComponent(term)}`,
      );
      setCandidates(res.candidates);
      if (res.candidates.length === 0) setError(t('exhibit.wikidataNoResults'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pick(qid: string) {
    setLoading(true);
    setError(null);
    try {
      const ent = await api.get<WikidataEntity>(`/integrations/wikidata/entity/${qid}`);
      setEntity(ent);
      // Pre-check every fact that already has a target field.
      const init: Record<string, boolean> = {};
      ent.facts.forEach((f, i) => { init[`${f.key}:${i}`] = !!factTarget(f.key, schemaKeys); });
      setChecked(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Create a new attribute on the category schema for an unmapped fact, then
  // mark it mappable + checked. Category-wide change — hence the confirm.
  async function addField(fact: WikidataFact, id: string) {
    if (!category) return;
    const fieldKey = suggestedFieldKey(fact.key);
    setBusyId(id);
    try {
      const props: SchemaProps = {
        ...(schemaProperties ?? {}),
        ...addedProps,
        [fieldKey]: { type: 'string', title: fact.label },
      };
      await api.patch(`/categories/${category.id}`, { schema: { type: 'object', properties: props } });
      setAddedProps((p) => ({ ...p, [fieldKey]: { type: 'string', title: fact.label } }));
      setChecked((c) => ({ ...c, [id]: true }));
      setConfirmId(null);
      onSchemaChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  // Auto-search on open.
  useEffect(() => { void runSearch(initialQuery); /* eslint-disable-line */ }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function buildPatch(): EnrichPatch {
    const patch: EnrichPatch = { attributes: {} };
    entity?.facts.forEach((f, i) => {
      if (!checked[`${f.key}:${i}`]) return;
      const target = factTarget(f.key, schemaKeys);
      if (!target) return;
      if (target.kind === 'core') patch[target.field as 'manufacturer' | 'year'] = f.value;
      else patch.attributes[target.field] = f.value;
    });
    return patch;
  }

  const applyCount = entity
    ? entity.facts.filter((f, i) => checked[`${f.key}:${i}`] && factTarget(f.key, schemaKeys)).length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-medium">{t('exhibit.wikidataTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(query); } }}
            placeholder={t('exhibit.wikidataSearchPlaceholder') as string}
            className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
          />
          <button type="button"
            onClick={() => void runSearch(query)}
            className="shrink-0 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('common.search')}
          </button>
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
            </div>
          )}
          {error && !loading && <p className="py-8 text-center text-sm text-destructive">{error}</p>}

          {/* Candidate list (before a match is picked) */}
          {!loading && !entity && candidates && candidates.length > 0 && (
            <div className="space-y-1">
              <p className="mb-2 text-xs text-muted-foreground">{t('exhibit.wikidataPickMatch')}</p>
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => void pick(c.id)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-control border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-muted/50"
                >
                  <span className="font-medium">{c.label}</span>
                  {c.description && <span className="text-xs text-muted-foreground">{c.description}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Field picker (after a match is picked) */}
          {!loading && entity && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {entity.image && (
                  <img src={entity.image} alt="" className="h-20 w-20 shrink-0 rounded border border-border object-cover" />
                )}
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entity.label.en ?? entity.qid}</span>
                    <a href={entity.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {entity.qid} <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                  {entity.description.en && <p className="text-muted-foreground">{entity.description.en}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {entity.wikipedia.en && <a href={entity.wikipedia.en} target="_blank" rel="noreferrer" className="text-primary hover:underline">Wikipedia (EN)</a>}
                    {entity.wikipedia.el && <a href={entity.wikipedia.el} target="_blank" rel="noreferrer" className="text-primary hover:underline">Wikipedia (EL)</a>}
                  </div>
                </div>
              </div>

              {entity.facts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('exhibit.wikidataNoFields')}</p>
              )}
              <div className="space-y-1">
                {entity.facts.map((f, i) => {
                  const target = factTarget(f.key, schemaKeys);
                  const id = `${f.key}:${i}`;
                  const canAdd = !target && canManageCategory && !!category;
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-3 rounded-control border px-3 py-2 text-sm ${target ? 'border-border cursor-pointer hover:bg-muted/40' : 'border-dashed border-border'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!target}
                        checked={!!checked[id]}
                        onChange={(e) => setChecked((c) => ({ ...c, [id]: e.target.checked }))}
                      />
                      <span className={`w-32 shrink-0 text-xs font-medium ${target ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>{f.label}</span>
                      <span className={`min-w-0 flex-1 truncate ${target ? '' : 'text-muted-foreground/60'}`}>{f.value}</span>
                      {target ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">→ {target.field}</span>
                      ) : confirmId === id ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px]">
                          <span className="text-muted-foreground">{t('exhibit.wikidataAddConfirm', { category: category?.code ?? '' })}</span>
                          <button type="button" disabled={busyId === id} onClick={() => void addField(f, id)}
                            className="rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground hover:bg-primary/90">
                            {busyId === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)}
                            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : canAdd ? (
                        <button type="button" onClick={() => setConfirmId(id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
                          <Plus className="h-3 w-3" /> {t('exhibit.wikidataAddField')}
                        </button>
                      ) : (
                        <span className="shrink-0 text-[11px] text-muted-foreground/60">{t('exhibit.wikidataNoFieldHint')}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {entity && !loading && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <button type="button" onClick={() => { setEntity(null); setConfirmId(null); }} className="text-sm text-muted-foreground hover:underline">
              ← {t('exhibit.wikidataBackToResults')}
            </button>
            <button
              type="button"
              onClick={() => onApply(buildPatch())}
              disabled={applyCount === 0}
              className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t('exhibit.wikidataApply', { count: applyCount })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
