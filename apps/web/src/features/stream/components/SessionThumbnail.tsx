'use client';

/** Gradient placeholder thumbnail for a past session (no capture stored yet). */
export function SessionThumbnail(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-16 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand/15 to-brand-end/15 text-muted-foreground/60"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
    </span>
  );
}
