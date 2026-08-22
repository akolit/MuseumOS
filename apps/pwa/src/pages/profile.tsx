import { useTranslation } from 'react-i18next';
import { LogOut, Languages, Moon, Sun, Landmark, Sparkles, Newspaper, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'museum', label: 'Museum', icon: Landmark },
  { id: 'modern', label: 'Modern', icon: Sparkles },
] as const;
type ThemeId = (typeof THEMES)[number]['id'];

// Tapping the language row cycles English → Greek → French → English.
const LANGS = ['en', 'el', 'fr'] as const;
const LANG_LABELS: Record<(typeof LANGS)[number], string> = {
  en: 'English',
  el: 'Ελληνικά',
  fr: 'Français',
};
function currentLang(code: string): (typeof LANGS)[number] {
  return LANGS.find((l) => code.startsWith(l)) ?? 'en';
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<ThemeId>(() => {
    const stored = (document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'modern') as ThemeId;
    return THEMES.some((t) => t.id === stored) ? stored : 'modern';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="flex flex-col">
      <header className="border-b border-border bg-card/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <h1 className="font-display text-xl font-bold">{t('pwa.tabs.profile')}</h1>
      </header>

      <div className="px-4 py-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold">{user?.displayName}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            {user?.role}
          </span>
        </div>
      </div>

      <ul className="px-4">
        <li>
          <button
            onClick={() => {
              const next = LANGS[(LANGS.indexOf(currentLang(i18n.language)) + 1) % LANGS.length]!;
              void i18n.changeLanguage(next);
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm active:bg-muted"
          >
            <span className="flex items-center gap-3">
              <Languages className="h-4 w-4 text-muted-foreground" />
              {t('pwa.profile.language')}
            </span>
            <span className="text-muted-foreground">
              {LANG_LABELS[currentLang(i18n.language)]}
            </span>
          </button>
        </li>
        <li className="mt-2">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="mb-2 text-xs text-muted-foreground">{t('pwa.profile.theme')}</p>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  aria-pressed={theme === id}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[10px] font-medium transition-colors ${
                    theme === id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </li>
        {/* "What's new" — links to the curated changelog (same content as
            the admin web's /changelog page). */}
        <li className="mt-4">
          <Link
            to="/changelog"
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-input bg-card px-4 py-3 active:bg-muted"
          >
            <span className="flex items-center gap-3">
              <Newspaper className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t('changelog.title')}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
        <li className="mt-6">
          <button
            onClick={() => logout()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive active:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t('pwa.profile.logout')}
          </button>
        </li>
      </ul>
    </div>
  );
}
