'use client';

import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { CommentFeed } from '@/features/comments/components/CommentFeed';
import { AccountList } from '@/features/accounts/components/AccountList';
import { LiveDashboard } from '@/features/stream/components/LiveDashboard';
import { UserMenu } from '@/features/auth/components/UserMenu';
import { useStreamStore } from '@/features/stream/store/stream.store';

export default function DashboardPage(): React.ReactElement {
  const isLive = useStreamStore((s) => s.currentSession?.status === 'live');

  if (isLive) {
    return <LiveDashboard />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
            </span>
            <span className="text-base font-bold tracking-tight sm:text-lg">TikLive Pro</span>
          </div>
          <UserMenu />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <StreamPanel />
            <AccountList />
          </div>
          <div className="lg:col-span-1">
            <CommentFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
