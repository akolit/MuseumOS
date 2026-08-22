import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs() {
  const { t } = useTranslation();
  const location = useLocation();

  const exhibitId = location.pathname.match(/^\/exhibits\/(.+)/)?.[1];
  const { data: exhibit } = useQuery({
    queryKey: ['exhibit-crumb', exhibitId],
    queryFn: () => api.get<{ displayId: string; exhibitName: string }>(`/exhibits/${exhibitId}`),
    enabled: !!exhibitId,
    staleTime: 60_000,
  });

  const crumbs = buildCrumbs(location.pathname, t, exhibit);
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {crumb.to && i < crumbs.length - 1 ? (
            <Link to={crumb.to} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className={i === crumbs.length - 1 ? 'font-medium text-foreground' : ''}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

function buildCrumbs(
  pathname: string,
  t: (key: string) => string,
  exhibit?: { displayId: string; exhibitName: string } | null,
): Crumb[] {
  const crumbs: Crumb[] = [{ label: t('nav.dashboard'), to: '/' }];

  if (pathname === '/') return [];

  const segment = pathname.split('/').filter(Boolean)[0];

  const NAV_MAP: Record<string, string> = {
    exhibits: 'nav.exhibits',
    categories: 'nav.categories',
    donors: 'nav.donors',
    locations: 'nav.locations',
    tags: 'nav.tags',
    users: 'nav.users',
    audit: 'audit.title',
    settings: 'nav.settings',
    'floor-plan': 'nav.floorPlan',
  };

  if (segment && NAV_MAP[segment]) {
    const exhibitDetailMatch = pathname.match(/^\/exhibits\/(.+)/);
    if (exhibitDetailMatch) {
      crumbs.push({ label: t('nav.exhibits'), to: '/exhibits' });
      crumbs.push({
        label: exhibit ? `${exhibit.displayId} — ${exhibit.exhibitName}` : exhibitDetailMatch[1]!,
      });
    } else {
      crumbs.push({ label: t(NAV_MAP[segment]!) });
    }
  }

  return crumbs;
}
