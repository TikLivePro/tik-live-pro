'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { PLATFORM_COLORS } from '../consts/comments.consts';
import { useLinkPreview } from '../hooks/useLinkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';
import { LinkPreviewSquare } from './LinkPreviewSquare';
import type { Comment } from '@tik-live-pro/shared-types';

interface CommentItemProps {
  comment: Comment;
  onReply: (comment: Comment) => void;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

function ContentWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const isImageUrl = (url: string) =>
  url.startsWith('data:image') ||
  url.includes('giphy.com') ||
  /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);

/** Isolated component so only comments that contain a URL mount the preview hook */
function CommentLinkPreview({ text }: { text: string }) {
  const { items } = useLinkPreview(text);
  if (items.length === 0) return null;

  // Multiple links → compact square tiles in a row with hover tooltips
  if (items.length > 1) {
    return (
      <div className="mt-1.5 flex flex-row flex-wrap gap-1.5">
        {items.map((item) =>
          item.loading || !item.data ? null : (
            <LinkPreviewSquare key={item.url} preview={item.data} />
          ),
        )}
      </div>
    );
  }

  // Single link → full-width compact card
  const [single] = items;
  if (!single) return null;
  return (
    <div className="mt-1.5">
      <LinkPreviewCard
        preview={single.data ?? { url: single.url, title: null, description: null, image: null, siteName: null, domain: '' }}
        loading={single.loading}
        compact
      />
    </div>
  );
}

export function CommentItem({ comment, onReply }: CommentItemProps) {
  const t = useTranslations('comments');
  const isReply = !!comment.replyToCommentId;
  const mediaUrls = comment.mediaUrls ?? [];
  const hasUrl = comment.content ? URL_RE.test(comment.content) : false;
  // Reset lastIndex after test()
  URL_RE.lastIndex = 0;

  return (
    <div
      className={cn(
        'group flex gap-2 px-3 py-2 border-l-2 hover:bg-muted/30 transition-colors',
        isReply && 'ml-6 border-l border-border border-l-muted',
        !isReply && (PLATFORM_COLORS[comment.platform] ?? 'border-l-muted'),
      )}
    >
      {comment.authorAvatarUrl ? (
        <Image
          src={comment.authorAvatarUrl}
          alt={comment.authorName}
          width={28}
          height={28}
          className="rounded-full shrink-0 mt-0.5"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted shrink-0 mt-0.5 flex items-center justify-center text-xs font-medium">
          {getInitials(comment.authorName)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold truncate">{comment.authorName}</span>

        {comment.content && (
          <p className="text-sm break-words">
            <ContentWithLinks text={comment.content} />
          </p>
        )}

        {/* URL preview */}
        {hasUrl && comment.content && (
          <CommentLinkPreview text={comment.content} />
        )}

        {/* Media grid */}
        {mediaUrls.length > 0 && (
          <div className={cn('mt-1.5 flex flex-wrap gap-1', mediaUrls.length === 1 && 'block')}>
            {mediaUrls.map((url, i) =>
              isImageUrl(url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`attachment ${i + 1}`}
                  className={cn(
                    'rounded-lg border border-border object-cover',
                    mediaUrls.length === 1 ? 'max-h-48 max-w-full' : 'h-20 w-20',
                  )}
                  loading="lazy"
                />
              ) : (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary underline hover:text-primary/80"
                >
                  {t('viewAttachment')} {mediaUrls.length > 1 ? i + 1 : ''}
                </a>
              ),
            )}
          </div>
        )}
      </div>

      {!isReply && (
        <button
          onClick={() => onReply(comment)}
          className="opacity-0 group-hover:opacity-100 shrink-0 self-start mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-opacity px-1.5 py-0.5 rounded hover:bg-muted"
        >
          {t('reply')}
        </button>
      )}
    </div>
  );
}
