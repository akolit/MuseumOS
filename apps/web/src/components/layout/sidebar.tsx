import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Archive,
  FolderOpen,
  Users,
  Tags,
  MapPin,
  Heart,
  Sun,
  Moon,
  Landmark,
  Sparkles,
  Settings as SettingsIcon,
  ScrollText,
  Map,
  GanttChartSquare,
  PiggyBank,
  Megaphone,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EasterEggOverlay } from '@/components/ui/easter-egg';

// Module-level click-timestamp buffer for the logo easter egg. Lives outside
// the component so Vite Fast Refresh / HMR edits to this file don't reset it
// mid-debug. Two Sidebar instances (desktop + mobile) share the same buffer,
// which is actually what we want — clicks from either count toward the egg.
const clickTs: number[] = [];
// Expose for debugging in dev
if (typeof window !== 'undefined') (window as unknown as { __clickTs?: number[] }).__clickTs = clickTs;

// Permission gates per nav item. A missing `permission` means "any
// authenticated user sees this link". The permission strings mirror those
// enforced by the API (apps/api/src/auth/permissions.ts) so the matrix
// editable in Users → Roles & Permissions controls UI visibility too.
//
// Items are split into three groups separated by horizontal rules in the
// sidebar render. "Main" holds the day-to-day catalogue tools, "money"
// isolates the Financials view, and "meta" parks the system / read-only
// pages at the bottom so they don't crowd the catalogue.
type NavItem = { to: string; i18n: string; icon: any; permission?: string; beta?: boolean };
const NAV_MAIN: NavItem[] = [
  { to: '/',           i18n: 'nav.dashboard',  icon: LayoutDashboard },
  { to: '/exhibits',   i18n: 'nav.exhibits',   icon: Archive,        permission: 'exhibit:read' },
  { to: '/categories', i18n: 'nav.categories', icon: FolderOpen,     permission: 'category:read' },
  { to: '/donors',     i18n: 'nav.donors',     icon: Heart,          permission: 'donor:read' },
  { to: '/locations',  i18n: 'nav.locations',  icon: MapPin,         permission: 'location:read' },
  { to: '/tags',       i18n: 'nav.tags',       icon: Tags,           permission: 'tag:read' },
  { to: '/users',      i18n: 'nav.users',      icon: Users,          permission: 'user:read' },
  { to: '/settings',   i18n: 'nav.settings',   icon: SettingsIcon,   permission: 'settings:write' },
  { to: '/floor-plan', i18n: 'nav.floorPlan',  icon: Map,            permission: 'exhibit:write' },
];
const NAV_MONEY: NavItem[] = [
  { to: '/timeline',   i18n: 'nav.timeline',   icon: GanttChartSquare, permission: 'timeline:read', beta: true },
  { to: '/financials', i18n: 'nav.financials', icon: PiggyBank,      permission: 'budget:read', beta: true },
  // Marketing is a placeholder for now — no permission gate while it's
  // under development so the whole team can preview the channel tabs.
  { to: '/marketing',  i18n: 'nav.marketing',  icon: Megaphone, beta: true },
];
const NAV_META: NavItem[] = [
  { to: '/audit',      i18n: 'audit.title',    icon: ScrollText,     permission: 'audit:read' },
  // No permission → visible to every authenticated user. "What's new" should
  // be a benefit for the whole team, not just admins.
  { to: '/changelog',  i18n: 'nav.changelog',  icon: Sparkles },
];

const PATTERNS = [
  { id: 'none', color: 'transparent', i18n: 'common.headerPatternNone' },
  { id: 'blue', color: '#4A7CBF', i18n: 'common.headerPatternBlue' },
  { id: 'orange', color: '#C8723A', i18n: 'common.headerPatternOrange' },
  { id: 'pink', color: '#D4619A', i18n: 'common.headerPatternPink' },
] as const;

function setHeaderPattern(id: string) {
  localStorage.setItem('header-pattern', id);
  window.dispatchEvent(new CustomEvent('header-pattern-change', { detail: id }));
}

function ThemeSwitcher() {
  const { t } = useTranslation();
  const setTheme = (id: string) => {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('theme', id);
  };
  return (
    <div className="flex gap-1">
      <button onClick={() => setTheme('light')} className="rounded p-1.5 hover:bg-muted" title={t('common.themeLight') as string}>
        <Sun className="h-4 w-4" />
      </button>
      <button onClick={() => setTheme('dark')} className="rounded p-1.5 hover:bg-muted" title={t('common.themeDark') as string}>
        <Moon className="h-4 w-4" />
      </button>
      <button onClick={() => setTheme('museum')} className="rounded p-1.5 hover:bg-muted" title={t('common.themeMuseum') as string}>
        <Landmark className="h-4 w-4" />
      </button>
      <button onClick={() => setTheme('modern')} className="rounded p-1.5 hover:bg-muted" title={t('common.themeModern') as string}>
        <Sparkles className="h-4 w-4" />
      </button>
    </div>
  );
}

function PatternSelector() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() => localStorage.getItem('header-pattern') || 'blue');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 300);
  };

  useEffect(() => {
    const handler = (e: Event) => setCurrent((e as CustomEvent).detail);
    window.addEventListener('header-pattern-change', handler);
    return () => window.removeEventListener('header-pattern-change', handler);
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {open && (
        <div className="absolute bottom-full left-0 mb-1 flex gap-1.5 rounded-lg border border-border bg-card p-2 shadow-lg">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              onClick={() => setHeaderPattern(p.id)}
              title={t(p.i18n) as string}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                current === p.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              }`}
              style={{
                background: p.id === 'none'
                  ? 'repeating-linear-gradient(-45deg, transparent, transparent 2px, #e5e7eb 2px, #e5e7eb 3px)'
                  : p.color,
              }}
            />
          ))}
        </div>
      )}
      <button
        className="rounded p-1.5 hover:bg-muted"
        title={t('common.headerPattern') as string}
      >
        <div
          className="h-4 w-4 rounded-sm border border-border"
          style={{
            background: current === 'none'
              ? 'repeating-linear-gradient(-45deg, transparent, transparent 2px, #e5e7eb 2px, #e5e7eb 3px)'
              : PATTERNS.find((p) => p.id === current)?.color ?? '#4A7CBF',
          }}
        />
      </button>
    </div>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  // Show nav items with no permission requirement to any authenticated user;
  // otherwise check the granted-permissions snapshot from the AuthContext.
  const visible = (group: NavItem[]) =>
    group.filter((n) => user && (!n.permission || hasPermission(n.permission)));
  const mainItems = visible(NAV_MAIN);
  const moneyItems = visible(NAV_MONEY);
  const metaItems = visible(NAV_META);

  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (prevPath.current !== location.pathname && onClose) {
      onClose();
    }
    prevPath.current = location.pathname;
  }, [location.pathname, onClose]);

  // Easter egg: 5 clicks on the MuseumOS logo within ~5 s reveals the
  // President. clickTs is module-scoped (top of file) so HMR edits don't
  // reset it mid-debug.
  const [eggOpen, setEggOpen] = useState(false);
  const handleLogoClick = () => {
    const now = performance.now();
    const recent = clickTs.filter((t) => now - t < 5000);
    recent.push(now);
    clickTs.length = 0;
    for (const t of recent) clickTs.push(t);
    if (recent.length >= 5) {
      clickTs.length = 0;
      setEggOpen(true);
    }
  };

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <button
          type="button"
          onClick={handleLogoClick}
          className="flex items-center gap-2 select-none rounded transition-transform duration-150 hover:opacity-80 active:scale-95 focus:outline-none"
          aria-label="MuseumOS"
        >
          <Archive className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-bold tracking-tight">MuseumOS</span>
        </button>
        {onClose && (
          <button onClick={onClose} className="ml-auto rounded p-1 hover:bg-muted lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <EasterEggOverlay
        open={eggOpen}
        imageSrc="/easter-egg.png"
        onClose={() => setEggOpen(false)}
      />


      <nav className="flex-1 overflow-y-auto py-3">
        {/* Group 1 — catalogue and admin pages */}
        {mainItems.map(({ to, i18n: i18nKey, icon: Icon, beta }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {t(i18nKey)}
            {beta && (
              <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary">
                Beta
              </span>
            )}
          </NavLink>
        ))}

        {/* Separator → Timeline, Financials & Marketing between two rules. */}
        {moneyItems.length > 0 && mainItems.length > 0 && (
          <hr className="my-2 border-t border-border/60" />
        )}
        {moneyItems.map(({ to, i18n: i18nKey, icon: Icon, beta }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {t(i18nKey)}
            {beta && (
              <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary">
                Beta
              </span>
            )}
          </NavLink>
        ))}

        {/* Separator → Audit log + What's new live at the bottom. */}
        {metaItems.length > 0 && (mainItems.length + moneyItems.length) > 0 && (
          <hr className="my-2 border-t border-border/60" />
        )}
        {metaItems.map(({ to, i18n: i18nKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {t(i18nKey)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <div className="mx-1 h-4 w-px bg-border" />
          <PatternSelector />
        </div>
      </div>
    </aside>
  );
}
