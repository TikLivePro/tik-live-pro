'use client';

import Link from 'next/link';
import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { CommentFeed } from '@/features/comments/components/CommentFeed';
import { AccountList } from '@/features/accounts/components/AccountList';
import { LiveDashboard } from '@/features/stream/components/LiveDashboard';
import { SettingsGearIcon } from '@/features/auth/components/AuthIcons';
import { useStreamStore } from '@/features/stream/store/stream.store';

export default function DashboardPage(): React.ReactElement {
  const isLive = useStreamStore((s) => s.currentSession?.status === 'live');

  if (isLive) {
    return <LiveDashboard />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">TikLive Pro</span>
          <Link
            href="/settings"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Settings"
          >
            <SettingsGearIcon />
          </Link>
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
