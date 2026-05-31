'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SessionHistory } from './SessionHistory';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HistorySidebar({ open, onClose }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const tCommon = useTranslations('common');

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Sidebar panel */}
      <aside
        aria-label={t('history.sectionLabel')}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-background shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('history.sectionLabel')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('close')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          <SessionHistory hideHeader open={open} />
        </div>
      </aside>
    </>
  );
}
