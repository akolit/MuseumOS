import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, PlusCircle, User } from 'lucide-react';

const tabs = [
  { to: '/inventory', i18n: 'pwa.tabs.inventory', icon: Search, primary: false },
  { to: '/add', i18n: 'pwa.tabs.add', icon: PlusCircle, primary: true },
  { to: '/profile', i18n: 'pwa.tabs.profile', icon: User, primary: false },
] as const;

export function TabBar() {
  const { t } = useTranslation();
  const location = useLocation();

  // iOS-style: tapping the already-active tab scrolls main to top.
  function handleTabClick(e: React.MouseEvent<HTMLAnchorElement>, to: string) {
    if (location.pathname === to) {
      e.preventDefault();
      const main = document.querySelector('main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <nav className="sticky bottom-0 z-40 grid h-16 grid-cols-3 border-t border-border bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, i18n: key, icon: Icon, primary }) => (
        <NavLink
          key={to}
          to={to}
          onClick={(e) => handleTabClick(e, to)}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={primary ? 'h-7 w-7' : `h-5 w-5 ${isActive ? '' : ''}`} />
              <span>{t(key)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
