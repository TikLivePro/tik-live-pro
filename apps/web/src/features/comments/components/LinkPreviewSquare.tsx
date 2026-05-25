'use client';

import type { LinkPreviewData } from '../interfaces/link-preview.interfaces';

interface LinkPreviewSquareProps {
  preview: LinkPreviewData;
  onDismiss?: () => void;
}

export function LinkPreviewSquare({ preview, onDismiss }: LinkPreviewSquareProps) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.domain)}&sz=32`;
  const label = preview.siteName ?? preview.domain;
  const tooltipTitle = preview.title ?? label;

  return (
    <div className="relative group/sq">
      {/* Square tile */}
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={tooltipTitle}
        className="block w-14 h-14 rounded-xl border border-border bg-muted/40 hover:bg-muted/70 hover:border-primary/40 overflow-hidden transition-colors shrink-0"
      >
        {preview.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.image}
            alt=""
            aria-hidden
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={faviconUrl} alt="" aria-hidden width={20} height={20} className="opacity-60" />
          </div>
        )}
      </a>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-bold hover:bg-foreground/80 transition-colors shadow opacity-0 group-hover/sq:opacity-100"
          aria-label="Dismiss preview"
        >
          ✕
        </button>
      )}

      {/* Tooltip */}
      <div
        className={[
          'pointer-events-none absolute z-50 bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2',
          'w-52 rounded-xl border border-border/60 bg-card text-card-foreground shadow-2xl p-3',
          '[backdrop-filter:none]',
          'opacity-0 scale-95 group-hover/sq:opacity-100 group-hover/sq:scale-100',
          'transition-all duration-150',
        ].join(' ')}
        role="tooltip"
      >
        {/* Arrow */}
        <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 rounded-[2px] bg-card border-b border-r border-border/60" />

        <div className="flex items-center gap-1.5 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faviconUrl} alt="" aria-hidden width={12} height={12} className="shrink-0 opacity-70" />
          <span className="text-[10px] text-muted-foreground truncate">{label}</span>
        </div>

        {preview.title && (
          <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 mb-0.5">
            {preview.title}
          </p>
        )}

        {preview.description && (
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
            {preview.description}
          </p>
        )}
      </div>
    </div>
  );
}
