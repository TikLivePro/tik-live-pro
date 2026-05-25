'use client';

import { useTranslations } from 'next-intl';
import type { LinkPreviewData } from '../hooks/useLinkPreview';

interface LinkPreviewCardProps {
  preview: LinkPreviewData;
  loading?: boolean;
  onDismiss?: () => void;
  /** Compact variant for use inside the comment feed */
  compact?: boolean | undefined;
}

function SkeletonCard({ compact, onDismiss }: { compact?: boolean | undefined; onDismiss?: (() => void) | undefined }) {
  return (
    <div className={`relative flex gap-3 rounded-xl border border-border bg-muted/40 animate-pulse ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
      </div>
      <div className={`shrink-0 rounded-lg bg-muted ${compact ? 'h-16 w-16' : 'h-20 w-20'}`} />
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground flex items-center justify-center text-[10px] transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function LinkPreviewCard({ preview, loading, onDismiss, compact }: LinkPreviewCardProps) {
  const t = useTranslations('comments');

  if (loading) return <SkeletonCard compact={compact} onDismiss={onDismiss} />;

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.domain)}&sz=32`;
  const imgSize = compact ? 'h-16 w-16' : 'h-20 w-20';
  const padding = compact ? 'p-2' : 'p-3';

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`group flex gap-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer ${padding} relative`}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary opacity-60" />

      {/* Text content */}
      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faviconUrl} alt="" width={12} height={12} className="shrink-0 opacity-70" aria-hidden />
          <span className="text-[11px] text-muted-foreground truncate">
            {preview.siteName ?? preview.domain}
          </span>
        </div>
        {preview.title && (
          <p className={`font-semibold text-foreground leading-snug truncate ${compact ? 'text-xs' : 'text-sm'}`}>
            {preview.title}
          </p>
        )}
        {!compact && preview.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {preview.description}
          </p>
        )}
      </div>

      {/* Thumbnail */}
      {preview.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt={preview.title ?? ''}
          className={`shrink-0 rounded-lg object-cover border border-border ${imgSize}`}
          loading="lazy"
        />
      )}

      {/* Dismiss button (only in input context) */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center text-[10px] transition-colors opacity-0 group-hover:opacity-100"
          aria-label={t('dismissPreview')}
        >
          ✕
        </button>
      )}
    </a>
  );
}
