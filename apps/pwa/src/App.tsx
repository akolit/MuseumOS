import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Shell } from '@/components/layout/shell';
import { LoginPage } from '@/pages/login';
import { InventoryPage } from '@/pages/inventory';
import { ExhibitDetailPage } from '@/pages/exhibit-detail';
import { AddPage } from '@/pages/add';
import { ProfilePage } from '@/pages/profile';
import { ChangelogPage } from '@/pages/changelog';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/inventory" replace />;
  return children;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-center" richColors closeButton />
          <Routes>
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route element={<RequireAuth><Shell /></RequireAuth>}>
              <Route index element={<Navigate to="/inventory" replace />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="exhibit/:id" element={<ExhibitDetailPage />} />
              <Route path="add" element={<AddPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="changelog" element={<ChangelogPage />} />
              <Route path="*" element={<Navigate to="/inventory" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
