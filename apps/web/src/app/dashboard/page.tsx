'use client';

import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { CommentFeed } from '@/features/comments/components/CommentFeed';
import { AccountList } from '@/features/accounts/components/AccountList';
import { LiveDashboard } from '@/features/stream/components/LiveDashboard';
import { useStreamStore } from '@/store/stream.store';

export default function DashboardPage(): React.ReactElement {
  const isLive = useStreamStore((s) => s.currentSession?.status === 'live');

  if (isLive) {
    return <LiveDashboard />;
  }

  return (
    <div className="min-h-screen bg-background">
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
