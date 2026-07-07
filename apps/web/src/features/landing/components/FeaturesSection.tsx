'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LANDING_SECTION_IDS } from '../consts/landing.consts';

export function FeaturesSection(): React.JSX.Element {
  const t = useTranslations('landing.features');

  return (
    <section
      id={LANDING_SECTION_IDS.features}
      className="scroll-mt-16 border-t border-border/50 bg-muted/20 py-14 sm:py-16"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest text-brand">{t('sectionLabel')}</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('heading')}</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<BroadcastIcon />}
            title={t('multiPlatform.title')}
            description={t('multiPlatform.description')}
          />
          <FeatureCard
            icon={<ChatIcon />}
            title={t('comments.title')}
            description={t('comments.description')}
          />
          <FeatureCard
            icon={<ChartIcon />}
            title={t('analytics.title')}
            description={t('analytics.description')}
          />
          <FeatureCard
            icon={<ZapIcon />}
            title={t('latency.title')}
            description={t('latency.description')}
          />
          <FeatureCard
            icon={<MonitorIcon />}
            title={t('obsIngest.title')}
            description={t('obsIngest.description')}
          />
          <FeatureCard
            icon={<ShieldIcon />}
            title={t('security.title')}
            description={t('security.description')}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border bg-card p-6',
        'transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-brand/10',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div
        className={cn(
          'relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl',
          'bg-gradient-to-br from-brand/15 to-orange-500/10 text-brand ring-1 ring-brand/20',
          'transition-transform duration-300 group-hover:scale-110',
        )}
      >
        {icon}
      </div>
      <h3 className="relative mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="relative text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function BroadcastIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
