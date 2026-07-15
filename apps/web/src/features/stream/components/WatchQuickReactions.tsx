'use client';

import { useTranslations } from 'next-intl';
import { QUICK_COMMENT_REACTIONS } from '../consts/stream.consts';

interface Props {
  onReact: (emoji: string) => void;
}

/**
 * Quick-reaction bar above the watch-page chat composer.
 * Each tap emits a single reaction through the existing socket path —
 * server-side per-socket + per-session rate limits stay authoritative.
 */
export function WatchQuickReactions({ onReact }: Props): React.ReactElement {
  const t = useTranslations('watch');

  return (
    <div
      role="group"
      aria-label={t('quickReactions')}
      className="flex items-center justify-between gap-1 px-3 py-2"
    >
      {QUICK_COMMENT_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className="flex h-9 flex-1 items-center justify-center rounded-full text-lg transition-transform hover:bg-muted/60 active:scale-125"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
