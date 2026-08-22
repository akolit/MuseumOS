import { Outlet } from 'react-router-dom';
import { TabBar } from './tab-bar';

export function Shell() {
  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <main className="flex-1 overflow-y-auto overscroll-contain pb-2">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
