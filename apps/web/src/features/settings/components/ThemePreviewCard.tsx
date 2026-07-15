'use client';

import { cn } from '@/lib/utils';
import { ThemeMiniPreview } from './ThemeMiniPreview';
import type { ThemePreference } from '@/features/auth/hooks/useTheme';

interface ThemePreviewCardProps {
  mode: ThemePreference;
  label: string;
  active: boolean;
  onSelect: () => void;
}

/** Selectable theme preview card — the active one gets the gradient border. */
export function ThemePreviewCard({ mode, label, active, onSelect }: ThemePreviewCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'rounded-card p-px text-left transition-shadow',
        active && 'bg-gradient-brand shadow-brand-glow',
      )}
    >
      <span
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-card)-1px)] bg-card',
          !active && 'border border-border',
        )}
      >
        <span className="relative block h-20 overflow-hidden">
          {mode === 'system' ? (
            <>
              <ThemeMiniPreview variant="light" />
              <span
                className="absolute inset-0 block overflow-hidden"
                style={{ clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 30% 100%)' }}
              >
                <ThemeMiniPreview variant="dark" />
              </span>
            </>
          ) : (
            <ThemeMiniPreview variant={mode} />
          )}
        </span>
        <span className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">{label}</span>
          {active && (
            <span className="bg-gradient-brand flex h-4 w-4 items-center justify-center rounded-full">
              <svg
                className="h-2.5 w-2.5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
