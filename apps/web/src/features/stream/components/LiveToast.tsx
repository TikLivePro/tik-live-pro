'use client';

import { toast } from 'sonner';

interface LiveToastContentProps {
  title: string;
  subtitle: string;
  onDismiss: () => void;
}

function LiveToastContent({ title, subtitle, onDismiss }: LiveToastContentProps): React.ReactElement {
  return (
    <div className="bg-gradient-brand shadow-brand-glow flex w-[356px] items-center gap-3 rounded-lg p-3.5 text-white">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
        <span className="pulse-live-dot inline-block h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="text-sm">
        <span className="font-bold">{title}</span>
        <span className="ml-2 opacity-90">{subtitle}</span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="dismiss"
        className="ml-auto shrink-0 text-white/70 transition-colors hover:text-white"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** Special gradient, pulsing toast for the "you're live!" moment — distinct from the standard success/error/info toasts. */
export function showLiveToast(title: string, subtitle: string): void {
  toast.custom((id) => (
    <LiveToastContent title={title} subtitle={subtitle} onDismiss={() => toast.dismiss(id)} />
  ));
}
