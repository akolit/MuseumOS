import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/app-layout';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { ExhibitsPage } from '@/pages/exhibits';
import { ExhibitDetailPage } from '@/pages/exhibit-detail';
import { CategoriesPage } from '@/pages/categories';
import { DonorsPage } from '@/pages/donors';
import { DonorDetailPage } from '@/pages/donor-detail';
import { LocationsPage } from '@/pages/locations';
import { TagsPage } from '@/pages/tags';
import { UsersPage } from '@/pages/users';
import { SettingsPage } from '@/pages/settings';
import { AuditPage } from '@/pages/audit';
import { FloorPlanMockupPage } from '@/pages/floor-plan-mockup';
import { FloorPlanPage } from '@/pages/floor-plan';
import { NotFoundPage } from '@/pages/not-found';
import { LabelsPage } from '@/pages/labels';
import { ChangelogPage } from '@/pages/changelog';
import { FinancialsPage } from '@/pages/financials';
import { FinancialsPrintPage } from '@/pages/financials-print';
import { MarketingPage } from '@/pages/marketing';
import { TimelinePage } from '@/pages/timeline';
import { TimelineManagePage } from '@/pages/timeline-manage';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="bottom-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<DashboardPage />} />
              <Route path="exhibits" element={<ExhibitsPage />} />
              <Route path="exhibits/:id" element={<ExhibitDetailPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="donors" element={<DonorsPage />} />
              <Route path="donors/:id" element={<DonorDetailPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="changelog" element={<ChangelogPage />} />
              <Route path="financials" element={<FinancialsPage />} />
              <Route path="marketing" element={<MarketingPage />} />
              <Route path="floor-plan" element={<FloorPlanPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="timeline/manage" element={<TimelineManagePage />} />
              <Route path="mockups/floor-plan" element={<FloorPlanMockupPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            {/* Labels page renders OUTSIDE AppLayout so the sidebar/header
                don't appear when printing. */}
            <Route path="/labels" element={<RequireAuth><LabelsPage /></RequireAuth>} />
            {/* Financials print view also bypasses AppLayout so it prints
                cleanly without the sidebar/header. */}
            <Route path="/financials/print" element={<RequireAuth><FinancialsPrintPage /></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
