'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { TikTokIcon, FacebookIcon } from '@/features/auth';

const EQ_BAR_DELAYS = ['0s', '0.15s', '0.3s', '0.1s', '0.25s'];

const PREVIEW_COMMENTS: {
  name: string;
  avatarClass: string;
  textKey: 'c1' | 'c2' | 'c3';
  platform: 'tiktok' | 'facebook';
}[] = [
  { name: 'Mia', avatarClass: 'bg-pink-500', textKey: 'c1', platform: 'tiktok' },
  { name: 'Ken', avatarClass: 'bg-sky-500', textKey: 'c2', platform: 'facebook' },
  { name: 'Zoe', avatarClass: 'bg-amber-500', textKey: 'c3', platform: 'tiktok' },
];

interface HeroPreviewProps {
  className?: string;
}

export function HeroPreview({ className }: HeroPreviewProps = {}): React.JSX.Element {
  const t = useTranslations('landing.hero.preview');

  return (
    <div className={cn('animate-fade-up mx-auto mt-14 w-full max-w-3xl [animation-delay:0.35s]', className)}>
      {/* Gradient halo behind the window */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -top-10 bottom-0 rounded-[2rem] bg-gradient-to-r from-brand/25 via-orange-500/15 to-pink-500/25 blur-2xl"
        />

        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-brand/10',
            // Subtle 3D tilt that flattens on hover (per Stitch mockup)
            'transition-transform duration-500 [transform:perspective(1400px)_rotateX(4deg)]',
            'hover:[transform:perspective(1400px)_rotateX(0deg)]',
            'motion-reduce:[transform:none]',
          )}
        >
          {/* Window title bar */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            <span className="mx-auto hidden rounded-md bg-background/70 px-3 py-0.5 text-[11px] text-muted-foreground sm:block">
              tiklivepro.me/dashboard
            </span>
            <span className="w-12" aria-hidden />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px]">
            {/* Fake video pane */}
            <div className="animate-gradient-pan relative aspect-video bg-gradient-to-br from-slate-900 via-[#2a1220] to-slate-900">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,hsl(var(--brand)/0.35),transparent_55%)]"
              />

              {/* Top overlays */}
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="animate-live-glow inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  {t('live')}
                </span>
                <span className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-white/90 backdrop-blur-sm">
                  {t('duration')}
                </span>
              </div>
              <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                <EyeIcon className="h-3 w-3" />
                {t('viewers')}
              </span>

              {/* Bottom overlays */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <PlatformChip icon={<TikTokIcon className="h-3 w-3" />} label="TikTok" />
                <PlatformChip icon={<FacebookIcon className="h-3 w-3" />} label="Facebook" />
              </div>
              <div className="absolute bottom-3 right-3 flex h-6 items-end gap-[3px]" aria-hidden>
                {EQ_BAR_DELAYS.map((delay, i) => (
                  <span
                    key={i}
                    className="animate-eq-bar w-[3px] rounded-full bg-white/70"
                    style={{ height: '100%', animationDelay: delay }}
                  />
                ))}
              </div>
            </div>

            {/* Fake unified comment feed */}
            <div className="hidden flex-col justify-end gap-2.5 border-l border-border/60 bg-muted/20 p-3.5 md:flex">
              {PREVIEW_COMMENTS.map(({ name, avatarClass, textKey, platform }, i) => (
                <div
                  key={name}
                  className="animate-slide-comment flex items-start gap-2"
                  style={{ animationDelay: `${0.6 + i * 0.4}s` }}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                      avatarClass,
                    )}
                  >
                    {name[0]}
                  </span>
                  <div className="rounded-xl rounded-tl-sm bg-background px-2.5 py-1.5 shadow-sm">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      {name}
                      <span className="chip-platform px-1.5 py-px text-[9px] text-muted-foreground">
                        {platform === 'tiktok' ? (
                          <TikTokIcon className="h-2.5 w-2.5" />
                        ) : (
                          <FacebookIcon className="h-2.5 w-2.5" />
                        )}
                        {platform === 'tiktok' ? 'TikTok' : 'FB'}
                      </span>
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{t(textKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlatformChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
      {icon}
      {label}
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
    </span>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
