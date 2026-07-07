'use client';

import { useTranslations } from 'next-intl';

interface Props {
  isEnding: boolean;
  onGoHome: () => void;
  onEndClick: () => void;
}

/** Mobile-only sticky bottom bar: dashboard shortcut + prominent End-stream action. */
export function StickyEndStreamBar({ isEnding, onGoHome, onEndClick }: Props): React.ReactElement {
  const t = useTranslations('stream');

  return (
    <div
      className="glass-header fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-[var(--card-border-color)] px-4 pt-2.5 lg:hidden"
      style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <button
        type="button"
        onClick={onGoHome}
        className="flex shrink-0 flex-col items-center gap-0.5 px-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="text-[10px] font-medium">{t('controlRoom.dashboardNav')}</span>
      </button>
      <button
        type="button"
        onClick={onEndClick}
        disabled={isEnding}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="h-3 w-3 rounded-[2px] border-2 border-current" />
        {isEnding ? t('status.ending') : t('stopLive')}
      </button>
    </div>
  );
}
