'use client';

import { cn } from '@/lib/utils';

interface NotificationToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

/** One notification preference row with a gradient-when-on switch. */
export function NotificationToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: NotificationToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          'relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200',
          enabled ? 'bg-gradient-brand shadow-brand-glow' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
