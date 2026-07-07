'use client';

import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { PLATFORM_COLORS } from '../consts/comments.consts';
import { formatExactTime, formatExactDateTime } from '../consts/replay.utils';
import type { Comment } from '@tik-live-pro/shared-types';

/** One comment of the session replay timeline, with its exact send time. */
export function ReplayCommentRow({ comment }: { comment: Comment }): React.ReactElement {
  return (
    <li
      className={cn(
        'rounded-xl border-l-2 bg-white/5 px-3 py-2',
        PLATFORM_COLORS[comment.platform] ?? 'border-l-white/20',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {comment.authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.authorAvatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-5 w-5 shrink-0 self-center rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full bg-white/10 text-[8px] font-bold text-white/70">
              {getInitials(comment.authorName)}
            </span>
          )}
          <span className="truncate text-xs font-semibold text-white/90">{comment.authorName}</span>
        </div>
        <time
          dateTime={new Date(comment.receivedAt).toISOString()}
          title={formatExactDateTime(comment.receivedAt)}
          className="shrink-0 font-mono text-[10px] tabular-nums text-white/40"
        >
          {formatExactTime(comment.receivedAt)}
        </time>
      </div>
      {comment.content && (
        <p className="mt-1 break-words text-sm leading-snug text-white/75">{comment.content}</p>
      )}
      {comment.mediaUrls && comment.mediaUrls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {comment.mediaUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-16 max-w-[120px] rounded-lg object-cover" />
          ))}
        </div>
      )}
    </li>
  );
}
