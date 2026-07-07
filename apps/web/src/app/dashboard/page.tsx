'use client';

import { useState } from 'react';
import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { ThisMonthStats } from '@/features/stream/components/ThisMonthStats';
import { RecentSessionsTable } from '@/features/stream/components/RecentSessionsTable';
import { AccountList } from '@/features/accounts/components/AccountList';
import { HistorySidebar } from '@/features/stream/components/HistorySidebar';
import { RecordingsSidebar } from '@/features/stream/components/RecordingsSidebar';
import { DashboardHeader } from '@/features/stream/components/DashboardHeader';
import { DashboardGreeting } from '@/features/stream/components/DashboardGreeting';
import { ActiveSessionBanner } from '@/features/stream/components/ActiveSessionBanner';
import { StickyGoLiveBar } from '@/features/stream/components/StickyGoLiveBar';
import { useActiveSession } from '@/features/stream';

import { CreatorLayout } from '@/components/CreatorLayout';

export default function DashboardPage(): React.ReactElement {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  useActiveSession();

  return (
    <CreatorLayout>
      <div className="relative min-h-screen bg-background flex-1 w-full">
      {/* Ambient background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-orb-drift absolute -top-32 right-[-10%] h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[hsl(15_90%_55%)]/8 blur-3xl" />
      </div>

      <DashboardHeader
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenRecordings={() => setRecordingsOpen(true)}
      />
      <ActiveSessionBanner />

      <main className="container relative mx-auto space-y-6 px-4 py-6 pb-24 lg:pb-6">
        <DashboardGreeting />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="animate-fade-up lg:col-span-8">
            <StreamPanel />
          </div>
          <div className="animate-fade-up space-y-6 lg:col-span-4 [animation-delay:120ms]">
            <ThisMonthStats />
            <AccountList />
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:180ms]">
          <RecentSessionsTable onViewAll={() => setHistoryOpen(true)} />
        </div>
      </main>

      <StickyGoLiveBar />
      <HistorySidebar open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <RecordingsSidebar
        open={recordingsOpen}
        onClose={() => setRecordingsOpen(false)}
      />
      </div>
    </CreatorLayout>
  );
}
