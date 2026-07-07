'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** "Replay" link to the watch page of a past session. */
export function ReplayLink({ sessionId }: { sessionId: string }): React.ReactElement {
  const t = useTranslations('stream');
  return (
    <Link
      href={`/watch/${sessionId}`}
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
      {t('recentSessions.replay')}
    </Link>
  );
}
