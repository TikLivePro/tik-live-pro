import { useTranslations } from 'next-intl';
import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { CommentFeed } from '@/features/comments/components/CommentFeed';
import { AccountList } from '@/features/accounts/components/AccountList';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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
