import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScrollText, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';

interface AuditItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  diff: unknown;
  createdAt: string;
  ip: string | null;
  actor: { id: string; displayName: string } | null;
}

interface AuditList {
  items: AuditItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface Facets {
  entityTypes: string[];
  actions: string[];
  actors: { id: string; displayName: string }[];
}

const PAGE_SIZE = 50;

function actionVerbKey(action: string): string {
  switch (action) {
    case 'create': return 'audit.actionCreate';
    case 'update': return 'audit.actionUpdate';
    case 'delete': return 'audit.actionDelete';
    case 'restore': return 'audit.actionRestore';
    case 'login': return 'audit.actionLogin';
    case 'login_failed': return 'audit.actionLoginFailed';
    case 'role_change': return 'audit.actionRoleChange';
    case 'password_reset': return 'audit.actionPasswordReset';
    case 'bulk_update': return 'audit.actionBulkUpdate';
    default: return action;
  }
}

function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'exhibit') return `/exhibits/${entityId}`;
  return null;
}

export function AuditPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const entityType = params.get('entityType') ?? '';
  const action = params.get('action') ?? '';
  const actorId = params.get('actorId') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10) || 1;
  const [expanded, setExpanded] = useState<string | null>(null);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const filterKey = `${entityType}|${action}|${actorId}|${page}`;

  const { data: facets } = useQuery({
    queryKey: ['audit-facets'],
    queryFn: () => api.get<Facets>('/audit/facets'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-list', filterKey],
    queryFn: () => {
      const p = new URLSearchParams();
      if (entityType) p.set('entityType', entityType);
      if (action) p.set('action', action);
      if (actorId) p.set('actorId', actorId);
      p.set('page', String(page));
      p.set('limit', String(PAGE_SIZE));
      return api.get<AuditList>(`/audit?${p.toString()}`);
    },
  });

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">{t('audit.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('audit.filterEntity')}</label>
          <select
            value={entityType}
            onChange={(e) => updateParam('entityType', e.target.value)}
            className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{t('audit.all')}</option>
            {facets?.entityTypes.map((et) => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('audit.filterAction')}</label>
          <select
            value={action}
            onChange={(e) => updateParam('action', e.target.value)}
            className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{t('audit.all')}</option>
            {facets?.actions.map((a) => {
              const key = actionVerbKey(a);
              return (
                <option key={a} value={a}>
                  {key.startsWith('audit.') ? `${a} — ${t(key)}` : a}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('audit.filterActor')}</label>
          <select
            value={actorId}
            onChange={(e) => updateParam('actorId', e.target.value)}
            className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{t('audit.all')}</option>
            {facets?.actors.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
        {data && data.items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('audit.noEntries')}</p>
        )}
        {data && data.items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs">
                <th className="px-3 py-2 font-medium">{t('audit.filterActor')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.filterAction')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.filterEntity')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.when')}</th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => {
                const href = entityHref(it.entityType, it.entityId);
                const verbKey = actionVerbKey(it.action);
                const verb = verbKey.startsWith('audit.') ? t(verbKey) : it.action;
                const isOpen = expanded === it.id;
                const hasDiff = Boolean(it.diff && typeof it.diff === 'object' && Object.keys(it.diff as object).length > 0);
                return (
                  <Fragment key={it.id}>
                    <tr
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 text-sm">
                        {it.actor?.displayName ?? <span className="text-muted-foreground italic">{t('audit.system')}</span>}
                      </td>
                      <td className="px-3 py-2 text-sm">{verb}</td>
                      <td className="px-3 py-2 text-sm">
                        {href ? (
                          <Link to={href} className="text-primary hover:underline">
                            <span className="font-mono text-xs">{it.entityType}</span>
                            <span className="ml-1 text-xs text-muted-foreground">{it.entityId.slice(0, 8)}…</span>
                          </Link>
                        ) : (
                          <>
                            <span className="font-mono text-xs">{it.entityType}</span>
                            <span className="ml-1 text-xs text-muted-foreground">{it.entityId.slice(0, 8)}…</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(it.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {hasDiff && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : it.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('audit.showDiff')}
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && hasDiff && (
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="overflow-x-auto rounded bg-background p-3 text-[11px]">
{JSON.stringify(it.diff, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => updateParam('page', String(page - 1))}
              className="flex items-center gap-1 rounded-control border border-input px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs">{page} / {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => updateParam('page', String(page + 1))}
              className="flex items-center gap-1 rounded-control border border-input px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
