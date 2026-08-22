import { useState, useEffect } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { CommandPalette } from '@/components/command-palette';

const PATTERN_MAP: Record<string, string> = {
  blue: '/header-blue.jpg',
  orange: '/header-orange.jpg',
  pink: '/header-pink.jpg',
};

function getPattern() {
  return localStorage.getItem('header-pattern') || 'blue';
}

export function Header({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [pattern, setPattern] = useState(getPattern);

  useEffect(() => {
    const handler = (e: Event) => setPattern((e as CustomEvent).detail);
    window.addEventListener('header-pattern-change', handler);
    return () => window.removeEventListener('header-pattern-change', handler);
  }, []);

  const bgUrl = PATTERN_MAP[pattern];

  return (
    <header className="relative flex h-14 items-center gap-3 overflow-hidden border-b border-border bg-card px-4 sm:px-6">
      {/* Doodle pattern as its own layer behind the content. In the dark theme
          the `.header-pattern` rule (globals.css) inverts it to faint line-art
          so the light artwork doesn't read as a bright band on the OLED UI. */}
      {bgUrl && (
        <div
          aria-hidden
          className="header-pattern pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'auto 100%',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'center',
          }}
        />
      )}

      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="relative z-10 rounded p-1.5 hover:bg-white/20 dark:hover:bg-white/10 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="relative z-10 flex items-center gap-3">
        <CommandPalette />
      </div>

      <div className="relative z-10 ml-auto flex items-center">
        {bgUrl ? (
          <div className="flex items-center gap-3 rounded-full bg-white/70 px-4 py-1.5 backdrop-blur-sm dark:bg-white/10">
            <span className="text-sm font-medium text-[#1e3a5f] dark:text-foreground">
              {user?.displayName}
              <span className="ml-1.5 rounded bg-[#1e3a5f]/10 px-1.5 py-0.5 text-xs dark:bg-white/10">
                {user?.role}
              </span>
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm font-medium text-[#1e3a5f]/70 transition-colors hover:text-destructive dark:text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('common.logout')}</span>
            </button>
          </div>
        ) : (
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.displayName}
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">
                {user?.role}
              </span>
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('common.logout')}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
