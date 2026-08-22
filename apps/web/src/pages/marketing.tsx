import { useState, useEffect, useMemo, type SVGProps, type ReactElement, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type {
  SocialAccount,
  SocialPlatform,
  MarketingPost,
  CreateMarketingPostInput,
} from '@museumos/contracts';
import {
  Megaphone,
  Construction,
  Search,
  Image as ImageIcon,
  Calendar,
  Inbox as InboxIcon,
  BarChart3,
  Plug,
  Hash,
  Link2,
  Sparkles,
  Heart,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageCircle,
  Send,
  AtSign,
  Eye,
  TrendingUp,
  Users,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { branding, publicExhibitUrl, publicExhibitUrlDisplay } from '@/lib/branding';

// ─── Brand glyphs (lucide-react dropped these after v0.474) ───────────────

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.408.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.894-4.788 4.659-4.788 1.325 0 2.463.099 2.794.143v3.24h-1.918c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.408 24 22.676V1.325C24 .593 23.407 0 22.675 0z" />
    </svg>
  );
}
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.013 7.052.072 5.776.13 4.602.396 3.635 1.363 2.668 2.33 2.402 3.504 2.344 4.78.013 8.332 0 8.741 0 12s.013 3.668.072 4.948c.058 1.276.324 2.45 1.291 3.417.967.967 2.141 1.233 3.417 1.291C8.332 23.987 8.741 24 12 24s3.668-.013 4.948-.072c1.276-.058 2.45-.324 3.417-1.291.967-.967 1.233-2.141 1.291-3.417.059-1.28.072-1.689.072-4.948s-.013-3.668-.072-4.948c-.058-1.276-.324-2.45-1.291-3.417C19.398.396 18.224.13 16.948.072 15.668.013 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}
function YoutubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ─── Top-level marketing module sections ──────────────────────────────────

type Section = {
  id: 'composer' | 'calendar' | 'inbox' | 'analytics' | 'channels';
  i18n: string;
  // Both lucide icons and our inline brand SVGs satisfy this — they're
  // any component that takes a className/size prop and renders an svg.
  Icon: ComponentType<{ className?: string }>;
};

const SECTIONS: Section[] = [
  { id: 'composer',  i18n: 'marketing.composer',  Icon: Sparkles },
  { id: 'calendar',  i18n: 'marketing.calendar',  Icon: Calendar },
  { id: 'inbox',     i18n: 'marketing.inbox',     Icon: InboxIcon },
  { id: 'analytics', i18n: 'marketing.analytics', Icon: BarChart3 },
  { id: 'channels',  i18n: 'marketing.channelsTab', Icon: Plug },
];

export function MarketingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<Section['id']>(() => {
    // Land on Channels when we're coming back from an OAuth round-trip
    // — the operator's just connected an account and wants to see it.
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has('oauth_connected') || sp.has('oauth_error')) return 'channels';
    }
    return 'composer';
  });

  // Pick up post-OAuth-callback redirects and show a toast. Strips the
  // query string after so a page refresh doesn't re-fire the toast.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get('oauth_connected');
    const error = sp.get('oauth_error');
    if (connected) {
      toast.success(t('marketing.oauthConnectedToast', { count: Number(connected) }) as string);
      qc.invalidateQueries({ queryKey: ['marketing-accounts'] });
    } else if (error) {
      toast.error(t('marketing.oauthErrorToast', { message: error }) as string);
    }
    if (connected || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <header>
        <h1 className="font-display text-2xl font-bold inline-flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          {t('marketing.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('marketing.subtitle')}</p>
      </header>

      {/* Wireframe banner — shown on every section so it never gets confused
          for production. Removed once the OAuth + posting backend lands. */}
      <div className="mt-4 flex items-start gap-2 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        <Construction className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p className="leading-relaxed">{t('marketing.wireframeBanner')}</p>
      </div>

      <nav role="tablist" className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {SECTIONS.map((s) => {
          const Icon = s.Icon;
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(s.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(s.i18n)}
            </button>
          );
        })}
      </nav>

      <section role="tabpanel" className="mt-6">
        {activeId === 'composer'  && <ComposerWireframe />}
        {activeId === 'calendar'  && <CalendarWireframe />}
        {activeId === 'inbox'     && <InboxWireframe />}
        {activeId === 'analytics' && <AnalyticsWireframe />}
        {activeId === 'channels'  && <ChannelsWireframe />}
      </section>
    </div>
  );
}

// ─── Composer (live data) ─────────────────────────────────────────────────

// Catalogue row shape — matches what /api/exhibits returns. Only the
// fields the picker + composer actually use are listed; the search
// endpoint returns more we ignore.
type ExhibitListItem = {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  primaryThumbnailUrl: string | null;
  primaryStorageKey?: string | null;
  imageCount?: number;
};

// Map from our generic Plat key to the brand glyph used by the chip row.
const PLAT_ICON: Record<SocialPlatform, ComponentType<SVGProps<SVGSVGElement>>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  x: XIcon,
  linkedin: LinkedinIcon,
};

// Per-platform colour used as the active-tab tint. Mirrors the
// PLAT_COLOR map in the Calendar wireframe so the same chip styling
// works across tabs.
const PLAT_BRAND_COLOR: Record<SocialPlatform, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  youtube: '#FF0000',
  x: '#000000',
  linkedin: '#0A66C2',
};

function ComposerWireframe() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // ─── Picker state ─────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [hasPhoto, setHasPhoto] = useState(true);
  const debouncedSearch = useDebounced(search, 300);

  const exhibitsQuery = useQuery({
    queryKey: ['exhibits', { q: debouncedSearch, hasPhoto }],
    queryFn: () => api.get<{ items: ExhibitListItem[]; total: number }>(
      `/exhibits?q=${encodeURIComponent(debouncedSearch)}&hasImages=${hasPhoto}&limit=25&sortBy=updatedAt&sortOrder=desc`,
    ),
    placeholderData: (prev) => prev,
  });
  const exhibits = exhibitsQuery.data?.items ?? [];

  const [selectedExhibitId, setSelectedExhibitId] = useState<string | null>(null);
  useEffect(() => {
    // Auto-pick the first exhibit when the list arrives or the current
    // selection drops out of the filtered set.
    if (exhibits.length > 0 && !exhibits.some((e) => e.id === selectedExhibitId)) {
      setSelectedExhibitId(exhibits[0]!.id);
    }
  }, [exhibits, selectedExhibitId]);
  const selected = exhibits.find((e) => e.id === selectedExhibitId) ?? null;

  // ─── Connected accounts → platform chip set ────────────────
  const accountsQuery = useQuery({
    queryKey: ['marketing-accounts'],
    queryFn: () => api.get<SocialAccount[]>('/marketing/accounts'),
  });
  const accounts = accountsQuery.data ?? [];

  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Default to all connected accounts on first load.
    if (selectedAccountIds.size === 0 && accounts.length > 0) {
      setSelectedAccountIds(new Set(accounts.map((a) => a.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // ─── Captions, hashtags, scheduling ───────────────────────
  const [captionEl, setCaptionEl] = useState('');
  const [captionEn, setCaptionEn] = useState('');
  const [hashtagsArr, setHashtagsArr] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'schedule'>('schedule');
  // datetime-local needs the LOCAL ISO format "YYYY-MM-DDTHH:MM".
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() => defaultScheduleLocal());

  // Pre-fill captions when a different exhibit is picked, BUT only when
  // both caption fields are still empty — never stomp user input.
  useEffect(() => {
    if (!selected) return;
    if (captionEl.trim() === '' && captionEn.trim() === '') {
      setCaptionEl(`Σήμερα στο ${branding.shortName}: ${selected.exhibitName}${selected.year ? ` (${selected.year})` : ''}. ${selected.manufacturer ?? ''}`.trim());
      setCaptionEn(`Today at ${branding.shortName}: ${selected.exhibitName}${selected.year ? ` (${selected.year})` : ''}${selected.manufacturer ? `, made by ${selected.manufacturer}` : ''}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Hashtag suggestions are computed from the selected exhibit. The
  // user adds them to the captions by clicking the chip; clicking again
  // toggles them off.
  const suggestedHashtags = useMemo(() => {
    if (!selected) return branding.baseHashtags;
    const tags = [...branding.baseHashtags];
    if (selected.manufacturer) tags.push(`#${selected.manufacturer.replace(/\s+/g, '').toLowerCase()}`);
    tags.push(`#${selected.exhibitName.replace(/[^\p{L}\p{N}]+/gu, '')}`);
    return tags;
  }, [selected]);
  function toggleHashtag(h: string) {
    setHashtagsArr((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));
  }

  // ─── Save mutation ────────────────────────────────────────
  const createPost = useMutation({
    mutationFn: (payload: CreateMarketingPostInput) =>
      api.post<MarketingPost>('/marketing/posts', payload),
    onSuccess: (post) => {
      toast.success(t('marketing.postSaved', { status: post.status }) as string);
      qc.invalidateQueries({ queryKey: ['marketing-posts'] });
      // Reset captions so the next post starts clean; keep exhibit + accounts.
      setCaptionEl(''); setCaptionEn(''); setHashtagsArr([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(asDraft: boolean) {
    if (!selected) { toast.error(t('marketing.errPickExhibit') as string); return; }
    const targetAccountIds = Array.from(selectedAccountIds);
    if (!asDraft && targetAccountIds.length === 0) {
      toast.error(t('marketing.errPickAccount') as string);
      return;
    }
    const payload: CreateMarketingPostInput = {
      kind: 'exhibit',
      exhibitId: selected.id,
      captionEl: captionEl.trim() || undefined,
      captionEn: captionEn.trim() || undefined,
      hashtags: hashtagsArr.length > 0 ? hashtagsArr : undefined,
      imageStorageKey: selected.primaryStorageKey ?? undefined,
      linkUrl: publicExhibitUrl(selected.displayId),
      scheduledAt: !asDraft && when === 'schedule'
        ? new Date(scheduledAtLocal).toISOString()
        : undefined,
      targetAccountIds: asDraft ? [] : targetAccountIds,
    };
    createPost.mutate(payload);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* ── Left: exhibit picker ─────────────────────────────────────── */}
      <aside className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('marketing.pickExhibit')}
        </div>
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 rounded-control border border-input bg-background px-2 py-1.5 text-sm focus-within:border-primary">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('marketing.searchExhibits') as string}
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterChip active={hasPhoto} onClick={() => setHasPhoto((v) => !v)}>
              {t('marketing.filterWithPhoto')}
            </FilterChip>
          </div>
        </div>
        <ul className="max-h-[460px] divide-y divide-border overflow-y-auto">
          {exhibitsQuery.isLoading && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('common.loading')}…
            </li>
          )}
          {!exhibitsQuery.isLoading && exhibits.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('marketing.noExhibits')}
            </li>
          )}
          {exhibits.map((ex) => {
            const isSelected = ex.id === selectedExhibitId;
            return (
              <li
                key={ex.id}
                onClick={() => setSelectedExhibitId(ex.id)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30 ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-border bg-muted/40">
                  {ex.primaryThumbnailUrl ? (
                    <img src={ex.primaryThumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ex.exhibitName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[ex.manufacturer, ex.year, ex.displayId].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Right: composer ──────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Selected exhibit card */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded border border-border bg-muted/40">
            {selected?.primaryThumbnailUrl ? (
              <img src={selected.primaryThumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold">{selected?.exhibitName ?? '—'}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selected ? [selected.manufacturer, selected.year, selected.displayId].filter(Boolean).join(' · ') : ''}
            </p>
          </div>
        </div>

        {/* Bilingual captions side by side */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <LiveCaptionField
            flag="🇬🇷"
            label={t('marketing.captionGreek') as string}
            placeholder={t('marketing.captionGreekPlaceholder') as string}
            value={captionEl}
            onChange={setCaptionEl}
          />
          <LiveCaptionField
            flag="🇬🇧"
            label={t('marketing.captionEnglish') as string}
            placeholder={t('marketing.captionEnglishPlaceholder') as string}
            value={captionEn}
            onChange={setCaptionEn}
          />
        </div>

        {/* Hashtags + permalink */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              {t('marketing.suggestedHashtags')}
            </span>
            {suggestedHashtags.map((h) => {
              const isActive = hashtagsArr.includes(h);
              return (
                <button
                  key={h}
                  onClick={() => toggleHashtag(h)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background hover:bg-muted'
                  }`}
                >
                  {isActive ? '✓ ' : '+ '}{h}
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t('marketing.permalink')}:</span>
              <code className="rounded bg-muted px-1.5 py-0.5">{publicExhibitUrlDisplay(selected.displayId)}</code>
              <span className="ml-auto text-emerald-600">✓ {t('marketing.permalinkAuto')}</span>
            </div>
          )}
        </div>

        {/* Platforms + scheduling */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('marketing.publishTo')}
          </div>
          {accountsQuery.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">{t('common.loading')}…</p>
          ) : accounts.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t('marketing.noAccountsHint')}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {accounts.map((acct) => {
                const Icon = PLAT_ICON[acct.platform];
                const active = selectedAccountIds.has(acct.id);
                return (
                  <PlatformChip
                    key={acct.id}
                    Icon={Icon}
                    label={`${capitalize(acct.platform)}${acct.handle ? ` · ${acct.handle}` : ''}`}
                    color={PLAT_BRAND_COLOR[acct.platform]}
                    active={active}
                    onClick={() => {
                      setSelectedAccountIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(acct.id)) next.delete(acct.id); else next.add(acct.id);
                        return next;
                      });
                    }}
                  />
                );
              })}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:pt-2">
              {t('marketing.when')}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
                {t('marketing.whenNow')}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="when" checked={when === 'schedule'} onChange={() => setWhen('schedule')} />
                {t('marketing.whenSchedule')}
              </label>
              {when === 'schedule' && (
                <span className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-2 py-1 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  <input
                    type="datetime-local"
                    value={scheduledAtLocal}
                    onChange={(e) => setScheduledAtLocal(e.target.value)}
                    className="bg-transparent outline-none"
                  />
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => submit(true)}
              disabled={createPost.isPending}
              className="rounded-control border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {t('marketing.saveDraft')}
            </button>
            <button
              onClick={() => submit(false)}
              disabled={createPost.isPending || !selected}
              className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {when === 'now' ? t('marketing.postNow') : t('marketing.schedulePost')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny utilities used by the live composer ────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function defaultScheduleLocal(): string {
  // Default to "tomorrow at 18:00", in the local timezone, formatted for
  // <input type="datetime-local">. Avoids the awkward "0000-00-00" default
  // empty value the browser shows otherwise.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function LiveCaptionField({ flag, label, placeholder, value, onChange }: {
  flag: string; label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        <span className="mr-1.5">{flag}</span>{label}
      </div>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>{value.length} / 2,200</span>
        <span>{value.trim() === '' ? 0 : value.trim().split(/\s+/).length} words</span>
      </div>
    </div>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

// (CaptionField replaced by LiveCaptionField above — keeping the helper
// out of this file once the composer is fully wired.)

function PlatformChip({
  Icon, label, color, active, onClick, disabled, disabledReason,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-sm font-medium transition-colors ${
        disabled
          ? 'border-input bg-muted/30 text-muted-foreground/60 cursor-not-allowed'
          : active
            ? 'border-primary text-primary'
            : 'border-input bg-background text-muted-foreground hover:bg-muted'
      }`}
      style={active && !disabled ? { borderColor: color, color } : undefined}
    >
      <Icon className="h-4 w-4" />
      {label}
      {disabled && <span className="text-[10px]">({disabledReason ? '!' : ''})</span>}
    </button>
  );
}

// ─── Calendar wireframe ──────────────────────────────────────────────────

// Mock scheduled posts for the visible month. Each entry pins a few
// platforms; the calendar renders them as small colour dots in the day
// cell. Production swaps this for `/api/marketing-posts?from=…&to=…`.
type Plat = 'facebook' | 'instagram' | 'youtube' | 'x' | 'linkedin';
const PLAT_COLOR: Record<Plat, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  youtube: '#FF0000',
  x: '#000000',
  linkedin: '#0A66C2',
};
type MockPost = { day: number; title: string; platforms: Plat[]; status: 'scheduled' | 'published' | 'draft'; time?: string };
const MAY_2026: MockPost[] = [
  { day: 1,  title: 'May Day — gallery closed',  platforms: ['facebook','instagram'],          status: 'published', time: '09:00' },
  { day: 4,  title: 'ZX Spectrum 48K spotlight', platforms: ['facebook','instagram','linkedin'], status: 'published', time: '18:00' },
  { day: 7,  title: 'Donor wall thank-you',      platforms: ['facebook','linkedin'],            status: 'published', time: '12:00' },
  { day: 10, title: 'Olivetti M20 deep-dive',    platforms: ['instagram','linkedin'],           status: 'published', time: '18:00' },
  { day: 13, title: 'Sunday opening reminder',   platforms: ['facebook','instagram'],           status: 'published', time: '10:00' },
  { day: 17, title: 'Commodore 64 history',      platforms: ['facebook','instagram','youtube'], status: 'scheduled', time: '18:00' },
  { day: 20, title: 'Volunteer day recap',       platforms: ['facebook','instagram'],           status: 'scheduled', time: '11:00' },
  { day: 22, title: 'Atari 800XL feature',       platforms: ['instagram'],                      status: 'scheduled', time: '17:30' },
  { day: 24, title: 'Open lecture — early PCs',  platforms: ['facebook','linkedin','youtube'],  status: 'scheduled', time: '19:00' },
  { day: 27, title: 'Behind-the-scenes Reel',    platforms: ['instagram'],                      status: 'draft' },
  { day: 30, title: 'May newsletter recap',      platforms: ['facebook','linkedin'],            status: 'scheduled', time: '12:00' },
];

function CalendarWireframe() {
  const { t } = useTranslation();

  // May 2026 starts on Friday. Build a 6×7 grid with leading blanks.
  const monthDays = 31;
  const startWeekday = 5; // 0=Sun … 6=Sat → Fri
  const cells: { day: number | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= monthDays; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const postsByDay = new Map<number, MockPost[]>();
  for (const p of MAY_2026) {
    if (!postsByDay.has(p.day)) postsByDay.set(p.day, []);
    postsByDay.get(p.day)!.push(p);
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="inline-flex items-center gap-1">
          <button className="rounded-control p-1.5 text-muted-foreground hover:bg-muted" title={t('marketing.calPrev') as string}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 font-display text-base font-semibold">May 2026</span>
          <button className="rounded-control p-1.5 text-muted-foreground hover:bg-muted" title={t('marketing.calNext') as string}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="ml-2 rounded-control border border-input bg-background px-2 py-1 text-xs hover:bg-muted">
            {t('marketing.calToday')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* View toggle — only "Month" is "active" in the sketch */}
          <div className="inline-flex rounded-control border border-input overflow-hidden">
            <button className="bg-primary px-2.5 py-1 text-primary-foreground">{t('marketing.calMonth')}</button>
            <button className="px-2.5 py-1 text-muted-foreground hover:bg-muted">{t('marketing.calWeek')}</button>
            <button className="px-2.5 py-1 text-muted-foreground hover:bg-muted">{t('marketing.calList')}</button>
          </div>
          <span className="inline-flex items-center gap-1 text-muted-foreground"><Filter className="h-3.5 w-3.5" /> {t('marketing.calFilter')}:</span>
          {(['facebook','instagram','youtube','linkedin'] as Plat[]).map((p) => (
            <PlatPill key={p} plat={p} active />
          ))}
          <PlatPill plat="x" disabled />
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />
          {t('marketing.calNewPost')}
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w) => (
            <div key={w} className="px-2 py-1.5 text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-[repeat(6,minmax(90px,1fr))]">
          {cells.map((c, i) => {
            const isToday = c.day === 17; // arbitrary in the wireframe; matches a "scheduled" item
            const posts = c.day ? postsByDay.get(c.day) ?? [] : [];
            return (
              <div
                key={i}
                className={`relative border-b border-r border-border p-1.5 text-xs ${c.day === null ? 'bg-muted/10' : 'hover:bg-muted/20'}`}
              >
                {c.day !== null && (
                  <>
                    <span className={`absolute right-1.5 top-1 text-[10px] tabular-nums ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {c.day}
                    </span>
                    <div className="mt-4 space-y-1">
                      {posts.slice(0, 2).map((p, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] ${
                            p.status === 'published' ? 'bg-emerald-500/10 text-emerald-700'
                            : p.status === 'scheduled' ? 'bg-blue-500/10 text-blue-700'
                            : 'bg-muted/60 text-muted-foreground'
                          }`}
                          title={`${p.time ?? ''} ${p.title}`}
                        >
                          <span className="flex flex-shrink-0 gap-0.5">
                            {p.platforms.slice(0, 3).map((pl) => (
                              <span key={pl} className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PLAT_COLOR[pl] }} />
                            ))}
                          </span>
                          <span className="truncate">{p.time ? `${p.time} ` : ''}{p.title}</span>
                        </div>
                      ))}
                      {posts.length > 2 && (
                        <div className="text-[10px] text-muted-foreground">+{posts.length - 2} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend + summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label={t('marketing.calStatPublished') as string} value="5" tint="emerald" />
        <SummaryTile label={t('marketing.calStatScheduled') as string} value="5" tint="blue" />
        <SummaryTile label={t('marketing.calStatDrafts')   as string} value="1" tint="muted" />
        <SummaryTile label={t('marketing.calStatNextSlot') as string} value="Sat 18:00" tint="muted" />
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tint }: { label: string; value: string; tint: 'emerald' | 'blue' | 'muted' }) {
  const ringClass =
    tint === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' :
    tint === 'blue'    ? 'border-blue-500/30 bg-blue-500/5' :
                         'border-border bg-card';
  return (
    <div className={`rounded-lg border ${ringClass} p-3`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
    </div>
  );
}

function PlatPill({ plat, active, disabled }: { plat: Plat; active?: boolean; disabled?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] capitalize ${
        disabled
          ? 'border-input bg-muted/30 text-muted-foreground/60'
          : active
            ? 'border-current text-current'
            : 'border-input text-muted-foreground'
      }`}
      style={active && !disabled ? { color: PLAT_COLOR[plat], borderColor: PLAT_COLOR[plat] } : undefined}
    >
      <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: PLAT_COLOR[plat] }} />
      {plat}
    </span>
  );
}

// ─── Inbox wireframe ─────────────────────────────────────────────────────

type InboxThread = {
  id: string;
  platform: Plat;
  author: string;
  authorHandle: string;
  snippet: string;
  time: string;
  unread: boolean;
  kind: 'comment' | 'reply' | 'dm' | 'mention';
  postTitle?: string;
};
const MOCK_THREADS: InboxThread[] = [
  { id: 't1', platform: 'instagram', author: 'Δημήτρης Κωνσταντίνου', authorHandle: '@dimk_retro',     snippet: 'Πανέμορφο! Πότε ανοίγει το μουσείο τα Σαββατοκύριακα;',          time: '17m', unread: true,  kind: 'comment', postTitle: 'ZX Spectrum 48K spotlight' },
  { id: 't2', platform: 'facebook',  author: 'Maria Antoniou',         authorHandle: 'Maria Antoniou',  snippet: 'I donated this exact model 3 years ago — happy to see it featured!', time: '42m', unread: true,  kind: 'comment', postTitle: 'Olivetti M20 deep-dive' },
  { id: 't3', platform: 'instagram', author: 'retroshop_athens',       authorHandle: '@retroshop_athens',snippet: 'DM: would you be interested in a Commodore PET we have in storage?', time: '1h',  unread: true,  kind: 'dm' },
  { id: 't4', platform: 'linkedin',  author: 'George Pantelis',        authorHandle: 'George Pantelis', snippet: 'Wonderful initiative — our company would love to sponsor the next opening.', time: '3h',  unread: false, kind: 'mention' },
  { id: 't5', platform: 'youtube',   author: '@vintagepc_gr',          authorHandle: '@vintagepc_gr',   snippet: 'Could you do a video on the Olivetti M24 next? Subscribed!',         time: '5h',  unread: false, kind: 'comment', postTitle: 'Olivetti M20 deep-dive' },
  { id: 't6', platform: 'instagram', author: 'Στέλιος Ν.',             authorHandle: '@stelios_n',     snippet: 'Είναι ανοιχτό την Πέμπτη το απόγευμα; Θα φέρω και την κόρη μου.', time: '8h',  unread: false, kind: 'dm' },
  { id: 't7', platform: 'facebook',  author: 'Anonymous',              authorHandle: 'Anonymous',       snippet: 'My grandfather had one of these! Brought back so many memories.',    time: '1d',  unread: false, kind: 'comment', postTitle: 'BBC Micro spotlight' },
];

function InboxWireframe() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>(MOCK_THREADS[0]!.id);
  const active = MOCK_THREADS.find((t) => t.id === activeId) ?? MOCK_THREADS[0]!;
  const unreadCount = MOCK_THREADS.filter((t) => t.unread).length;

  const platforms: Record<Plat, ComponentType<{ className?: string; style?: any }>> = {
    facebook: FacebookIcon, instagram: InstagramIcon, youtube: YoutubeIcon, x: XIcon, linkedin: LinkedinIcon,
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(280px,360px)_1fr]">
      {/* Filter rail */}
      <aside className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('marketing.inboxFilter')}
        </div>
        <ul className="p-1 text-sm">
          <FilterRow icon={<InboxIcon className="h-3.5 w-3.5" />} label={t('marketing.inboxAll') as string} count={MOCK_THREADS.length} active />
          <FilterRow icon={<span className="block h-2 w-2 rounded-full bg-primary" />} label={t('marketing.inboxUnread') as string} count={unreadCount} />
          <FilterRow icon={<AtSign className="h-3.5 w-3.5" />} label={t('marketing.inboxMentions') as string} count={1} />
          <FilterRow icon={<MessageCircle className="h-3.5 w-3.5" />} label={t('marketing.inboxComments') as string} count={4} />
          <FilterRow icon={<Send className="h-3.5 w-3.5" />} label={t('marketing.inboxDMs') as string} count={2} />
        </ul>
        <div className="border-t border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('marketing.inboxByPlatform')}
        </div>
        <ul className="p-1 pb-3 text-sm">
          {(['facebook','instagram','youtube','linkedin'] as Plat[]).map((p) => {
            const Icon = platforms[p];
            const n = MOCK_THREADS.filter((t) => t.platform === p).length;
            return <FilterRow key={p} icon={<Icon className="h-3.5 w-3.5" style={{ color: PLAT_COLOR[p] }} />} label={p.charAt(0).toUpperCase() + p.slice(1)} count={n} />;
          })}
        </ul>
      </aside>

      {/* Thread list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">{t('marketing.inboxThreads')}</span>
          <span className="text-xs text-muted-foreground">{unreadCount} {t('marketing.inboxUnreadShort')}</span>
        </div>
        <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
          {MOCK_THREADS.map((m) => {
            const Icon = platforms[m.platform];
            const isActive = m.id === activeId;
            return (
              <li
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 hover:bg-muted/30 ${isActive ? 'bg-primary/10' : ''} ${m.unread ? 'border-l-2 border-l-primary' : ''}`}
              >
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: PLAT_COLOR[m.platform] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-sm ${m.unread ? 'font-semibold' : ''}`}>{m.author}</p>
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground">{m.time}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
                  {m.postTitle && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">↳ {m.postTitle}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Thread detail */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {(() => { const Icon = platforms[active.platform]; return <Icon className="h-5 w-5" style={{ color: PLAT_COLOR[active.platform] }} />; })()}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{active.author}</p>
            <p className="text-xs text-muted-foreground">{active.authorHandle} · {active.time} ago</p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{active.kind}</span>
        </div>
        {active.postTitle && (
          <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium">{t('marketing.inboxOnPost')}:</span> {active.postTitle}
          </div>
        )}
        <div className="px-4 py-4 text-sm leading-relaxed">{active.snippet}</div>
        <div className="border-t border-border bg-muted/10 p-3">
          <div className="flex items-start gap-2 rounded-control border border-input bg-background px-3 py-2 focus-within:border-primary">
            <textarea
              rows={2}
              placeholder={t('marketing.inboxReplyPlaceholder') as string}
              disabled
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Send className="inline h-3.5 w-3.5" /> {t('marketing.inboxReplyBtn')}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span>{t('marketing.inboxQuickReplies')}:</span>
            <button className="rounded-full border border-input bg-background px-2 py-0.5 hover:bg-muted">{t('marketing.qrHours')}</button>
            <button className="rounded-full border border-input bg-background px-2 py-0.5 hover:bg-muted">{t('marketing.qrThanks')}</button>
            <button className="rounded-full border border-input bg-background px-2 py-0.5 hover:bg-muted">{t('marketing.qrDonate')}</button>
            <button className="rounded-full border border-input bg-background px-2 py-0.5 hover:bg-muted">{t('marketing.qrPress')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterRow({ icon, label, count, active }: { icon: ReactElement; label: string; count: number; active?: boolean }) {
  return (
    <li className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 ${active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
      <span className="inline-flex items-center gap-2">{icon}{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </li>
  );
}

// ─── Analytics wireframe ────────────────────────────────────────────────

// Mock per-platform stats. Real numbers come from Meta Graph Insights,
// YouTube Analytics API and the LinkedIn Marketing API.
const ANALYTICS = {
  reach30d:      48230,
  reachDelta:    +12.4, // % vs previous 30-day window
  engagementPct: 4.8,
  engagementDelta: -0.3,
  followers:     11842,
  followerDelta: +176,
  topPost: { title: 'ZX Spectrum 48K spotlight', platform: 'instagram' as Plat, reach: 9842, engagement: 712, when: 'May 4, 18:00' },
};
const PLATFORM_BREAKDOWN: { plat: Plat; followers: number; reach30d: number; engagement: number; growth: number }[] = [
  { plat: 'facebook',  followers: 5210, reach30d: 18420, engagement: 3.6, growth: +1.2 },
  { plat: 'instagram', followers: 4830, reach30d: 22310, engagement: 6.4, growth: +2.7 },
  { plat: 'youtube',   followers: 612,  reach30d:  3120, engagement: 2.1, growth: +0.5 },
  { plat: 'linkedin',  followers: 1190, reach30d:  4380, engagement: 5.2, growth: +0.9 },
];
const TOP_POSTS = [
  { title: 'ZX Spectrum 48K spotlight', plat: 'instagram' as Plat, reach: 9842, eng: 712, when: 'May 4' },
  { title: 'Donor wall thank-you',      plat: 'facebook'  as Plat, reach: 7210, eng: 384, when: 'May 7' },
  { title: 'Olivetti M20 deep-dive',    plat: 'instagram' as Plat, reach: 6520, eng: 489, when: 'May 10' },
  { title: 'Sunday opening reminder',   plat: 'facebook'  as Plat, reach: 4180, eng: 156, when: 'May 13' },
  { title: 'Volunteer day recap',       plat: 'linkedin'  as Plat, reach: 2240, eng: 198, when: 'May 20' },
];

function AnalyticsWireframe() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          icon={<Eye className="h-4 w-4" />}
          label={t('marketing.analyticsReach') as string}
          value={fmt(ANALYTICS.reach30d)}
          delta={ANALYTICS.reachDelta}
          deltaSuffix="%"
        />
        <KpiTile
          icon={<Heart className="h-4 w-4 text-rose-500" />}
          label={t('marketing.analyticsEngagement') as string}
          value={`${ANALYTICS.engagementPct.toFixed(1)}%`}
          delta={ANALYTICS.engagementDelta}
          deltaSuffix="pp"
        />
        <KpiTile
          icon={<Users className="h-4 w-4" />}
          label={t('marketing.analyticsFollowers') as string}
          value={fmt(ANALYTICS.followers)}
          delta={ANALYTICS.followerDelta}
          deltaSuffix=""
          rawDelta
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label={t('marketing.analyticsTopPost') as string}
          value={ANALYTICS.topPost.title}
          subtle={`${fmt(ANALYTICS.topPost.reach)} reach · ${ANALYTICS.topPost.when}`}
        />
      </div>

      {/* Trend "charts" — represented as sparkline placeholders. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartPlaceholder title={t('marketing.analyticsChartReach') as string} hint={t('marketing.analyticsChartHint') as string} />
        <ChartPlaceholder title={t('marketing.analyticsChartFollowers') as string} hint={t('marketing.analyticsChartHint') as string} />
      </div>

      {/* Per-platform breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">{t('marketing.analyticsByPlatform')}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">{t('marketing.analyticsPlatform')}</th>
              <th className="px-4 py-2 text-right">{t('marketing.analyticsFollowers')}</th>
              <th className="px-4 py-2 text-right">{t('marketing.analyticsReach30')}</th>
              <th className="px-4 py-2 text-right">{t('marketing.analyticsEngagementRate')}</th>
              <th className="px-4 py-2 text-right">{t('marketing.analyticsGrowth30')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PLATFORM_BREAKDOWN.map((p) => {
              const Icon = ({facebook: FacebookIcon, instagram: InstagramIcon, youtube: YoutubeIcon, x: XIcon, linkedin: LinkedinIcon})[p.plat];
              return (
                <tr key={p.plat}>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4" style={{ color: PLAT_COLOR[p.plat] }} />
                      <span className="capitalize">{p.plat}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(p.followers)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(p.reach30d)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.engagement.toFixed(1)}%</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${p.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {p.growth >= 0 ? '+' : ''}{p.growth.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top posts */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-sm font-semibold">{t('marketing.analyticsTopPosts')}</span>
          <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {t('marketing.viewAll')} <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        <ul className="divide-y divide-border">
          {TOP_POSTS.map((p, idx) => {
            const Icon = ({facebook: FacebookIcon, instagram: InstagramIcon, youtube: YoutubeIcon, x: XIcon, linkedin: LinkedinIcon})[p.plat];
            return (
              <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 text-right text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                <Icon className="h-4 w-4 flex-shrink-0" style={{ color: PLAT_COLOR[p.plat] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">{p.when}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{fmt(p.reach)} <span className="text-[10px] text-muted-foreground">reach</span></p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{p.eng} engagements</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Suggestion cards — gives a feel for the "smart" features described in
          the earlier strategy chat (best time to post, content-gap detector). */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SuggestionCard
          icon={<Clock className="h-4 w-4" />}
          title={t('marketing.suggestBestTimeTitle') as string}
          body={t('marketing.suggestBestTimeBody') as string}
        />
        <SuggestionCard
          icon={<ImageIcon className="h-4 w-4" />}
          title={t('marketing.suggestGapTitle') as string}
          body={t('marketing.suggestGapBody') as string}
        />
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, delta, deltaSuffix, rawDelta, subtle }: {
  icon: ReactElement;
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  rawDelta?: boolean;
  subtle?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 font-display text-xl font-bold truncate">{value}</div>
      {delta !== undefined && (
        <p className={`text-xs ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {positive ? '+' : ''}{rawDelta ? delta : delta.toFixed(1)}{deltaSuffix} vs prev 30 days
        </p>
      )}
      {subtle && <p className="text-xs text-muted-foreground">{subtle}</p>}
    </div>
  );
}

function ChartPlaceholder({ title, hint }: { title: string; hint: string }) {
  // Inline SVG sparkline so the wireframe doesn't depend on a chart library
  // yet. Production will swap this for recharts or visx pulling time-series
  // data from the analytics endpoint.
  const points = [10, 14, 12, 18, 22, 19, 26, 24, 30, 28, 34, 32, 40, 38, 44];
  const max = Math.max(...points);
  const w = 100, h = 40;
  const path = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - (p / max) * h}`).join(' ');
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-semibold">{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-24 w-full" preserveAspectRatio="none">
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1" className="text-primary" />
        <polyline points={`0,${h} ${path} ${w},${h}`} fill="currentColor" className="text-primary/10" />
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function SuggestionCard({ icon, title, body }: { icon: ReactElement; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
        {icon}{title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB').format(n);
}

// ─── Channels (live data + Connect modal) ─────────────────────────────────

type Row = {
  platform: SocialPlatform;
  name: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  oauthSupported: boolean;
};
const CHANNEL_ROWS: Row[] = [
  { platform: 'facebook',  name: 'Facebook',  Icon: FacebookIcon,  color: PLAT_BRAND_COLOR.facebook,  oauthSupported: true  },
  { platform: 'instagram', name: 'Instagram', Icon: InstagramIcon, color: PLAT_BRAND_COLOR.instagram, oauthSupported: true  },
  { platform: 'youtube',   name: 'YouTube',   Icon: YoutubeIcon,   color: PLAT_BRAND_COLOR.youtube,   oauthSupported: false },
  { platform: 'x',         name: 'X',         Icon: XIcon,         color: PLAT_BRAND_COLOR.x,         oauthSupported: false },
  { platform: 'linkedin',  name: 'LinkedIn',  Icon: LinkedinIcon,  color: PLAT_BRAND_COLOR.linkedin,  oauthSupported: false },
];

function ChannelsWireframe() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['marketing-accounts'],
    queryFn: () => api.get<SocialAccount[]>('/marketing/accounts'),
  });
  const accounts = accountsQuery.data ?? [];

  // Index by platform — we list one row per platform regardless of whether
  // an account is connected, so the operator can connect or see status.
  const byPlatform = useMemo(() => {
    const map = new Map<SocialPlatform, SocialAccount>();
    for (const a of accounts) map.set(a.platform, a);
    return map;
  }, [accounts]);

  const [connectFor, setConnectFor] = useState<SocialPlatform | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/accounts/${id}`),
    onSuccess: () => {
      toast.success(t('marketing.channelsDisconnected') as string);
      qc.invalidateQueries({ queryKey: ['marketing-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {CHANNEL_ROWS.map((r) => {
            const acct = byPlatform.get(r.platform);
            const connected = !!acct;
            return (
              <li key={r.platform} className="flex items-center gap-4 px-4 py-3">
                <r.Icon className="h-6 w-6 flex-shrink-0" style={{ color: r.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connected && acct.handle ? `${acct.handle} · ${t('marketing.channelsConnected', { date: acct.connectedAt.slice(0, 10) })}`
                      : connected ? t('marketing.channelsConnected', { date: acct.connectedAt.slice(0, 10) })
                      : t('marketing.channelsDisconnected')}
                  </p>
                </div>
                {connected ? (
                  <button
                    onClick={() => {
                      if (window.confirm(t('marketing.confirmDisconnect', { platform: r.name }) as string)) {
                        remove.mutate(acct.id);
                      }
                    }}
                    disabled={remove.isPending}
                    className="rounded-control border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {t('marketing.channelsDisconnectBtn')}
                  </button>
                ) : (
                  <button
                    onClick={() => setConnectFor(r.platform)}
                    className="rounded-control border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {t('marketing.channelsConnectBtn')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {connectFor && (
        <ConnectAccountModal
          platform={connectFor}
          onClose={() => setConnectFor(null)}
          onConnected={() => {
            qc.invalidateQueries({ queryKey: ['marketing-accounts'] });
            setConnectFor(null);
          }}
        />
      )}
    </>
  );
}

// Manual token-paste modal. Used pre-OAuth so curators can seed a
// connected account from a token they pasted out of the platform's
// graph-explorer tool. Once the OAuth scaffolding lands, this becomes
// the fallback for platforms whose OAuth we don't support yet.
function ConnectAccountModal({
  platform, onClose, onConnected,
}: {
  platform: SocialPlatform;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { t } = useTranslation();
  const [externalId, setExternalId] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const create = useMutation({
    mutationFn: () => api.post<SocialAccount>('/marketing/accounts', {
      platform,
      externalId: externalId.trim(),
      handle: handle.trim() || undefined,
      displayName: displayName.trim() || undefined,
      accessToken: accessToken.trim(),
    }),
    onSuccess: () => {
      toast.success(t('marketing.channelConnected', { platform }) as string);
      onConnected();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = PLAT_ICON[platform];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Icon className="h-5 w-5" style={{ color: PLAT_BRAND_COLOR[platform] }} />
          <h2 className="font-medium">{t('marketing.connectModalTitle', { platform: capitalize(platform) })}</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          {(platform === 'facebook' || platform === 'instagram') && (
            <a
              href={`/api/marketing/oauth/meta/start`}
              className="flex items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: PLAT_BRAND_COLOR.facebook }}
            >
              <FacebookIcon className="h-4 w-4" />
              {t('marketing.connectViaFacebook')}
            </a>
          )}
          <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {(platform === 'facebook' || platform === 'instagram')
              ? t('marketing.connectOrPaste')
              : t('marketing.connectModalBody')}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('marketing.connectExternalId')} *
            </span>
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder={t('marketing.connectExternalIdPlaceholder') as string}
              className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('marketing.connectHandle')}
              </span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={branding.socialHandle}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('marketing.connectDisplayName')}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={branding.shortName}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('marketing.connectAccessToken')} *
            </span>
            <textarea
              rows={3}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t('marketing.connectAccessTokenPlaceholder') as string}
              className="w-full resize-none rounded-control border border-input bg-background px-2 py-1.5 font-mono text-xs focus:border-primary focus:outline-none"
            />
          </label>
          <p className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            ⚠ {t('marketing.connectTokenWarning')}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !externalId.trim() || !accessToken.trim()}
            className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('marketing.channelsConnectBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// (The previous `Stub` placeholder is gone now that Calendar/Inbox/Analytics
// are sketched — leaving it would trigger an unused-export warning. If a
// future section needs a stub again, re-introduce the component then.)
