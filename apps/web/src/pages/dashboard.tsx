import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive, FolderOpen, Heart, MapPin,
  Quote as QuoteIcon, ImageOff, ShieldCheck, Activity,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import quotesData from '@/data/quotes.json';

interface Quote {
  quote: string;
  author: string;
  category?: string;
}

const QUOTES = quotesData as Quote[];
const RECENT_KEY = 'dashboard-recent-quotes';
const RECENT_WINDOW = Math.min(20, Math.max(1, Math.floor(QUOTES.length / 5)));

function pickQuote(): Quote {
  let recent: number[] = [];
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (raw) recent = JSON.parse(raw);
  } catch {
    recent = [];
  }

  const recentSet = new Set(recent);
  const candidates: number[] = [];
  for (let i = 0; i < QUOTES.length; i++) {
    if (!recentSet.has(i)) candidates.push(i);
  }
  const pool = candidates.length > 0 ? candidates : Array.from({ length: QUOTES.length }, (_, i) => i);

  const pickedIdx = pool[Math.floor(Math.random() * pool.length)]!;
  const updated = [pickedIdx, ...recent].slice(0, RECENT_WINDOW);
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch {}
  return QUOTES[pickedIdx]!;
}

interface Category {
  id: string;
  code: string;
  nameEn: string;
  nameEl: string;
  idPrefix: string;
}

interface ExhibitStats {
  total: number;
  validated: number;
  notValidated: number;
  published: number;
  notPublished: number;
  withImages: number;
  withoutImages: number;
  timeline: { date: string; count: number }[];
}

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  diff: unknown;
  createdAt: string;
  actor: { id: string; displayName: string } | null;
}

function StatCard({
  label,
  value,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  value: string | number;
  icon: any;
  to?: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  const toneClasses =
    tone === 'warning'
      ? 'border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/10'
      : tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/10'
        : 'border-border bg-card';
  const inner = (
    <div className={`group rounded-lg border p-5 transition-all ${toneClasses} ${
      to ? 'hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md' : ''
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${tone === 'warning' ? 'text-amber-500/60' : tone === 'success' ? 'text-emerald-500/60' : 'text-muted-foreground/30'}`} />
      </div>
      {to && (
        <p className="mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-primary">
          View <ChevronRight className="h-3 w-3" />
        </p>
      )}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const { t } = useTranslation();
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 100;
  const H = 28;
  const stepX = W / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = H - (d.count / max) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const areaPoints = `0,${H} ${points} ${W},${H}`;
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex items-end gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-40">
        <polygon points={areaPoints} className="fill-primary/15" />
        <polyline points={points} className="fill-none stroke-primary" strokeWidth="1.5" />
      </svg>
      <div className="text-xs text-muted-foreground">
        {t('dashboard.additionsCount', { count: total })}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.round((now - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

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

function entityLink(entityType: string, entityId: string): string | null {
  if (entityType === 'exhibit') return `/exhibits/${entityId}`;
  return null;
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const quote = useMemo<Quote>(() => pickQuote(), []);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const { data: stats } = useQuery({
    queryKey: ['exhibits-stats'],
    queryFn: () => api.get<ExhibitStats>('/exhibits/stats'),
  });

  const { data: donors } = useQuery({
    queryKey: ['donors'],
    queryFn: () => api.get<any[]>('/donors'),
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<any[]>('/locations'),
  });

  const { data: audit } = useQuery({
    queryKey: ['audit-recent'],
    queryFn: () => api.get<AuditEntry[]>('/audit/recent?limit=8'),
    staleTime: 30_000,
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">{t('dashboard.title')}</h1>
      <figure className="mt-2 inline-flex max-w-3xl items-start gap-2 text-sm">
        <QuoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
        <div>
          <blockquote className="italic text-foreground">"{quote.quote}"</blockquote>
          <figcaption className="mt-0.5 text-xs text-muted-foreground">— {quote.author}</figcaption>
        </div>
      </figure>

      {/* KPI tiles — clickable */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.totalExhibits')}
          value={stats?.total?.toLocaleString() ?? '...'}
          icon={Archive}
          to="/exhibits"
        />
        <StatCard
          label={t('dashboard.categories')}
          value={categories?.length ?? '...'}
          icon={FolderOpen}
          to="/categories"
        />
        <StatCard
          label={t('dashboard.donors')}
          value={donors?.length ?? '...'}
          icon={Heart}
          to="/donors"
        />
        <StatCard
          label={t('dashboard.locations')}
          value={locations?.length ?? '...'}
          icon={MapPin}
          to="/locations"
        />
      </div>

      {/* Action cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('dashboard.needPhotos')}
          value={stats?.withoutImages?.toLocaleString() ?? '...'}
          icon={ImageOff}
          to="/exhibits?hasImages=false&sortBy=createdAt&sortOrder=desc"
          tone="warning"
        />
        <StatCard
          label={t('dashboard.needValidation')}
          value={stats?.notValidated?.toLocaleString() ?? '...'}
          icon={ShieldCheck}
          to="/exhibits?validated=false"
          tone="warning"
        />
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.additionsTrend')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('dashboard.last30Days')}</p>
            </div>
            <Activity className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div className="mt-3">
            {stats?.timeline ? <Sparkline data={stats.timeline} /> : <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
          </div>
        </div>
      </div>

      {/* Two-column: categories + recent activity */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">{t('dashboard.exhibitsByCategory')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories?.map((cat) => (
              <CategoryCard key={cat.id} category={cat} lang={lang} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold">{t('dashboard.recentActivity')}</h2>
          <div className="mt-3 rounded-lg border border-border bg-card">
            {!audit && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
            {audit && audit.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('dashboard.noActivity')}</p>
            )}
            {audit && audit.length > 0 && (
              <ul className="divide-y divide-border">
                {audit.map((a) => {
                  const link = entityLink(a.entityType, a.entityId);
                  const verbKey = actionVerbKey(a.action);
                  const inner = (
                    <div className="flex items-start gap-2 px-4 py-3 text-sm">
                      <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                      <div className="min-w-0 flex-1">
                        <p className="leading-tight">
                          <span className="font-medium">{a.actor?.displayName ?? t('audit.system')}</span>
                          {' '}{verbKey.startsWith('audit.') ? t(verbKey) : a.action}{' '}
                          <span className="text-muted-foreground">{a.entityType}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{relativeTime(a.createdAt)}</p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={a.id}>
                      {link ? (
                        <Link to={link} className="block hover:bg-muted/30">{inner}</Link>
                      ) : inner}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category, lang }: { category: Category; lang: string }) {
  const { data } = useQuery({
    queryKey: ['exhibits-count', category.id],
    queryFn: () => api.get<{ total: number }>(`/exhibits?categoryId=${category.id}&limit=1`),
  });

  const primary = lang === 'el' ? category.nameEl : category.nameEn;
  const secondary = lang === 'el' ? category.nameEn : category.nameEl;

  return (
    <Link
      to={`/exhibits?categoryId=${category.id}`}
      className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <div>
        <p className="text-sm font-medium">{primary}</p>
        <p className="text-xs text-muted-foreground">{secondary}</p>
      </div>
      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary tabular-nums transition-colors group-hover:bg-primary/20">
        {data?.total ?? '...'}
      </span>
    </Link>
  );
}
