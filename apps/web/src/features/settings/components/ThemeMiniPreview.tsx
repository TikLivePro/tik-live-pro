'use client';

import { cn } from '@/lib/utils';

/**
 * Hardcoded copies of the Pro-Stream surface tokens (globals.css) so each
 * preview shows its own theme regardless of the theme currently applied.
 */
const PREVIEW_SURFACES: Record<'light' | 'dark', { canvas: string; panel: string; line: string }> = {
  dark: { canvas: '#0B0B0F', panel: '#1C1C24', line: 'rgba(255,255,255,0.25)' },
  light: { canvas: '#F4F4F6', panel: '#FFFFFF', line: 'rgba(0,0,0,0.2)' },
};

interface ThemeMiniPreviewProps {
  variant: 'light' | 'dark';
  className?: string;
}

/** Tiny dashboard mock used inside the appearance theme cards. */
export function ThemeMiniPreview({ variant, className }: ThemeMiniPreviewProps): React.ReactElement {
  const surfaces = PREVIEW_SURFACES[variant];
  return (
    <span
      className={cn('flex h-full w-full flex-col gap-1.5 p-2.5', className)}
      style={{ backgroundColor: surfaces.canvas }}
    >
      <span className="flex items-center gap-1">
        <span className="bg-gradient-brand h-1.5 w-5 rounded-full" />
        <span className="h-1 w-8 rounded-full" style={{ backgroundColor: surfaces.line }} />
      </span>
      <span className="flex-1 rounded-md" style={{ backgroundColor: surfaces.panel }} />
      <span className="flex gap-1.5">
        <span className="h-3 flex-1 rounded-sm" style={{ backgroundColor: surfaces.panel }} />
        <span className="h-3 flex-1 rounded-sm" style={{ backgroundColor: surfaces.panel }} />
      </span>
    </span>
  );
}
