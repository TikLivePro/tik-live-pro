'use client';

interface AttachmentPreviewProps {
  url: string;
  name?: string | undefined;
  onRemove: () => void;
}

const isVisualMedia = (url: string) =>
  url.startsWith('data:image') ||
  url.includes('giphy.com') ||
  /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);

export function AttachmentPreview({ url, name, onRemove }: AttachmentPreviewProps) {
  return (
    <div className="inline-flex items-start gap-2 max-w-full">
      {isVisualMedia(url) ? (
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name ?? 'attachment'}
            className="max-h-28 max-w-[200px] rounded-lg object-cover border border-border"
          />
          <button
            onClick={onRemove}
            aria-label="Remove attachment"
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold hover:bg-foreground/80 transition-colors shadow"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2 pr-7 max-w-[220px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="text-xs truncate text-foreground">{name ?? 'File'}</span>
          <button
            onClick={onRemove}
            aria-label="Remove attachment"
            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-foreground/20 text-foreground flex items-center justify-center text-[9px] font-bold hover:bg-foreground/40 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
