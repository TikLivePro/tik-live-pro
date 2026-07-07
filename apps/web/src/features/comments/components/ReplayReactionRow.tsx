'use client';

import { formatExactTime, formatExactDateTime } from '../consts/replay.utils';

interface Props {
  emoji: string;
  /** Identical emojis sent within the same second are grouped. */
  count: number;
  sentAt: string;
}

/** One (grouped) emoji reaction of the session replay timeline. */
export function ReplayReactionRow({ emoji, count, sentAt }: Props): React.ReactElement {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl px-3 py-1">
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden="true">{emoji}</span>
        {count > 1 && <span className="text-[10px] font-bold text-white/50">×{count}</span>}
      </span>
      <time
        dateTime={new Date(sentAt).toISOString()}
        title={formatExactDateTime(sentAt)}
        className="shrink-0 font-mono text-[10px] tabular-nums text-white/40"
      >
        {formatExactTime(sentAt)}
      </time>
    </li>
  );
}
