'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';

interface TestimonialCardProps {
  className?: string;
}

export function TestimonialCard({ className }: TestimonialCardProps): React.JSX.Element {
  const t = useTranslations('auth.testimonial');

  return (
    <figure className={cn('glass-overlay max-w-sm rounded-card p-5 shadow-2xl', className)}>
      <blockquote className="text-sm leading-relaxed text-foreground/90">
        &ldquo;{t('quote')}&rdquo;
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span className="bg-gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
          {getInitials(t('name'))}
        </span>
        <span>
          <span className="block text-sm font-semibold text-foreground">{t('name')}</span>
          <span className="block text-xs text-muted-foreground">{t('role')}</span>
        </span>
      </figcaption>
    </figure>
  );
}
