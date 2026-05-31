'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useNotifications } from '../hooks/useNotifications';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TYPE_ICON: Record<string, string> = {
  session_started: '🔴',
  session_ended: '⏹',
  stream_error: '⚠️',
  billing_event: '💳',
  account_connected: '✅',
};

export function NotificationBell(): React.ReactElement {
  const t = useTranslations('notifications');
  const { data, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t('bell.label')}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted transition-colors"
      >
        <svg
          className="h-4.5 w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-background shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">{t('bell.label')}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-brand hover:underline"
              >
                {t('bell.markAllRead')}
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-border">
            {!data?.items.length ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('bell.empty')}
              </li>
            ) : (
              data.items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 text-sm transition-colors',
                    !n.isRead && 'bg-brand/5',
                  )}
                >
                  <span className="mt-0.5 flex-shrink-0 text-base leading-none">
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => { if (!n.isRead) void markRead(n.id); }}
                  >
                    <p className={cn('font-medium', !n.isRead && 'text-foreground', n.isRead && 'text-muted-foreground')}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                  </button>
                  <button
                    type="button"
                    aria-label={t('bell.delete')}
                    onClick={() => void remove(n.id)}
                    className="flex-shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
