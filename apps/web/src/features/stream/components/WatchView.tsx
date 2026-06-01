'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useElapsedTime } from '../hooks/useElapsedTime';

export interface PublicSession {
  id: string;
  title: string;
  status: 'created' | 'starting' | 'live' | 'paused' | 'ending' | 'ended' | 'error';
  platforms: ('tiktok' | 'facebook')[];
  platformHlsUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

interface Props {
  initialSession: PublicSession;
  apiBase: string;
}

function TikTokIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  );
}

function FacebookIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LogoMark(): React.ReactElement {
  return <img src="/logo.png" alt="TikLive Pro" className="h-5 w-5 object-contain" />;
}

const POLL_INTERVAL = 5000;

export function WatchView({ initialSession, apiBase }: Props): React.ReactElement {
  const t = useTranslations('watch');
  const tStream = useTranslations('stream');
  const [session, setSession] = useState<PublicSession>(initialSession);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLive = session.status === 'live';
  const isPaused = session.status === 'paused';
  const isEnded = session.status === 'ended' || session.status === 'error' || session.status === 'ending';
  const isStarting = session.status === 'starting' || session.status === 'created';

  const elapsed = useElapsedTime(isLive && session.startedAt ? new Date(session.startedAt) : null);

  // Poll for status updates while not in a terminal state
  useEffect(() => {
    if (isEnded) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/sessions/${session.id}/public`);
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: PublicSession };
        setSession(data);
      } catch {
        // ignore transient failures
      }
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session.id, isEnded, apiBase]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#090b0f]">
      {/* Ambient glow */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-1000',
          isLive
            ? 'opacity-100'
            : 'opacity-0',
        )}
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, hsl(4 82% 55% / 0.18) 0%, transparent 70%)',
        }}
      />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-white/80 transition-colors hover:text-white"
        >
          <LogoMark />
          <span className="text-sm font-bold tracking-tight">TikLivePro</span>
        </Link>

        {/* Status badge */}
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-600/90 px-3 py-1 text-xs font-bold tracking-wide text-white backdrop-blur-xl">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        )}
        {isPaused && (
          <span className="flex items-center gap-1.5 rounded-full border border-yellow-300/30 bg-yellow-600/80 px-3 py-1 text-xs font-bold tracking-wide text-white backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {tStream('status.paused')}
          </span>
        )}
        {isStarting && (
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/70 backdrop-blur-xl">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
            {tStream('status.starting')}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="z-10 flex flex-col items-center gap-6 px-6 text-center sm:px-12">
        {/* Stream visual indicator */}
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-2xl border transition-all duration-500',
            isLive
              ? 'border-red-400/40 bg-red-600/20 text-red-300 shadow-[0_0_40px_hsl(4_82%_55%/0.25)]'
              : isPaused
                ? 'border-yellow-400/30 bg-yellow-600/15 text-yellow-300'
                : isEnded
                  ? 'border-white/10 bg-white/5 text-white/30'
                  : 'border-white/10 bg-white/5 text-white/40',
          )}
        >
          {isLive && (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          )}
          {isPaused && (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
          {isStarting && (
            <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          )}
          {isEnded && (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="max-w-md text-2xl font-bold text-white sm:text-3xl">{session.title}</h1>

          {isLive && (
            <p className="font-mono text-lg font-semibold tabular-nums text-white/60">{elapsed}</p>
          )}
          {isStarting && (
            <p className="text-sm text-white/50">{t('startingDesc')}</p>
          )}
          {isEnded && (
            <p className="text-sm text-white/50">{t('endedDesc')}</p>
          )}
        </div>

        {/* Platform badges */}
        {session.platforms.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
              {t('liveOn')}
            </p>
            <div className="flex items-center gap-3">
              {session.platforms.includes('tiktok') && (
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70">
                  <TikTokIcon />
                  TikTok
                </span>
              )}
              {session.platforms.includes('facebook') && (
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70">
                  <FacebookIcon />
                  Facebook
                </span>
              )}
            </div>
          </div>
        )}

        {/* HLS player embed */}
        {isLive && session.platformHlsUrl && (
          <div className="mt-2 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
            <video
              src={session.platformHlsUrl}
              autoPlay
              controls
              playsInline
              className="aspect-video w-full"
              aria-label={session.title}
            />
          </div>
        )}

        {/* CTA */}
        <Link
          href="/auth/login"
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogoMark />
          {t('goToApp')}
        </Link>
      </main>

      {/* Footer */}
      <footer className="absolute inset-x-0 bottom-0 pb-5 text-center">
        <p className="text-[11px] text-white/20">{t('poweredBy')}</p>
      </footer>
    </div>
  );
}

export function WatchNotFound(): React.ReactElement {
  const t = useTranslations('watch');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#090b0f] px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/20">
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-white">{t('notFound')}</h1>
        <p className="max-w-xs text-sm text-white/40">{t('notFoundDesc')}</p>
      </div>
      <Link
        href="/auth/login"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogoMark />
        {t('goToApp')}
      </Link>
      <p className="text-[11px] text-white/20">{t('poweredBy')}</p>
    </div>
  );
}
