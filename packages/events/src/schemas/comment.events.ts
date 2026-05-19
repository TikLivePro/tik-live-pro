import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { Comment } from '@tik-live-pro/shared-types';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

export type CommentReceivedPayload = Comment;
export type CommentReceivedEvent = BaseEvent<CommentReceivedPayload>;

export interface CommentBatchReceivedPayload {
  sessionId: LiveSessionId;
  comments: Comment[];
}

export type CommentBatchReceivedEvent = BaseEvent<CommentBatchReceivedPayload>;
