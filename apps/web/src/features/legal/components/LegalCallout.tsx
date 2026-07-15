import { cn } from '@/lib/utils';
import { InfoIcon } from './LegalIcons';

interface LegalCalloutProps {
  /** `banner` is the larger "plain language summary" box; `note` is a compact inline row. */
  variant?: 'banner' | 'note';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/** Highlighted callout box used for plain-language summaries and inline notes. */
export function LegalCallout({ variant = 'banner', title, children, className }: LegalCalloutProps): React.JSX.Element {
  if (variant === 'note') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground',
          className,
        )}
      >
        <InfoIcon className="h-4 w-4 shrink-0" />
        <span>{children}</span>
      </div>
    );
  }

  return (
    <div className={cn('card-surface p-4', className)}>
      {title && (
        <div className="mb-2 flex items-center gap-2 text-primary">
          <InfoIcon className="h-4 w-4 shrink-0" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      )}
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}
