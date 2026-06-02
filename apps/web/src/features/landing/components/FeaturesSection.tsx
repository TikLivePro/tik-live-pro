'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export function FeaturesSection(): React.JSX.Element {
  const t = useTranslations('landing.features');

  return (
    <section className="border-t border-border/50 bg-muted/20 py-14 sm:py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest text-brand">{t('sectionLabel')}</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('heading')}</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
    <div className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-brand/30">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
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
