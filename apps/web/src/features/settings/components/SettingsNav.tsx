'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SETTINGS_SECTION_IDS, type SettingsSectionId } from '../consts/settings.consts';

interface SettingsNavProps {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

const ICON_PROPS = {
  className: 'h-[18px] w-[18px] shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const SECTION_ICONS: Record<SettingsSectionId, React.ReactNode> = {
  profile: (
    <svg {...ICON_PROPS}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  subscription: (
    <svg {...ICON_PROPS}>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  notifications: (
    <svg {...ICON_PROPS}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  appearance: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  security: (
    <svg {...ICON_PROPS}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

/**
 * Settings section nav — vertical left rail with a gradient active-marker on
 * desktop, horizontally scrollable pills on mobile.
 */
export function SettingsNav({ active, onSelect }: SettingsNavProps): React.ReactElement {
  const t = useTranslations('settings.nav');

  return (
    <>
      {/* Mobile: horizontal scrollable pills */}
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
      >
        {SETTINGS_SECTION_IDS.map((id) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(id)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-gradient-brand shadow-brand-glow text-white'
                  : 'bg-surface-2 border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t(id)}
            </button>
          );
        })}
      </div>

      {/* Desktop: vertical rail with gradient active-marker */}
      <nav
        role="tablist"
        aria-orientation="vertical"
        className="sticky top-20 hidden flex-col gap-1 self-start lg:flex"
      >
        {SETTINGS_SECTION_IDS.map((id) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(id)}
              className={cn(
                'relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-muted/70 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="bg-gradient-brand absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                />
              )}
              <span className={cn(isActive && 'text-brand')}>{SECTION_ICONS[id]}</span>
              {t(id)}
            </button>
          );
        })}
      </nav>
    </>
  );
}
