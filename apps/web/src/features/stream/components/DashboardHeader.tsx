'use client';

import { useTranslations } from 'next-intl';
import { UserMenu } from '@/features/auth/components/UserMenu';
import { ThemeToggleButton } from '@/features/auth/components/ThemeToggleButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

import { useSidebar } from '@/components/SidebarContext';

interface Props {
  onOpenHistory: () => void;
  onOpenRecordings: () => void;
}

export function DashboardHeader({ onOpenHistory, onOpenRecordings }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { toggleCollapse, toggleOpen } = useSidebar();

  return (
    <header className="glass-header sticky top-0 z-40 border-b border-border/70">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth >= 1024) {
                toggleCollapse();
              } else {
                toggleOpen();
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground mr-1"
            aria-label="Toggle sidebar"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <img src="/logo.png" alt="TikLivePro" className="h-7 w-7 object-contain lg:hidden" />
          <span className="text-gradient-brand text-base font-bold tracking-tight sm:text-lg lg:hidden">
            TikLivePro
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* History toggle */}
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label={t('history.sectionLabel')}
            title={t('history.sectionLabel')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          {/* Recordings toggle */}
          <button
            type="button"
            onClick={onOpenRecordings}
            aria-label={t('recordings.sectionLabel')}
            title={t('recordings.sectionLabel')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <ThemeToggleButton />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
