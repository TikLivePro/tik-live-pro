import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { Comment } from '@tik-live-pro/shared-types';
import type { LiveSessionId, SocialPlatform, SocialAccountId } from '@tik-live-pro/shared-types';

export type CommentReceivedPayload = Comment;
export type CommentReceivedEvent = BaseEvent<CommentReceivedPayload>;

export interface CommentBatchReceivedPayload {
  sessionId: LiveSessionId;
  comments: Comment[];
}

export type CommentBatchReceivedEvent = BaseEvent<CommentBatchReceivedPayload>;

export interface CommentPostedPayload {
  sessionId: LiveSessionId;
  platform: SocialPlatform;
  socialAccountId: SocialAccountId;
  content: string;
  platformCommentId: string;
}

export type CommentPostedEvent = BaseEvent<CommentPostedPayload>;

export interface CommentRepliedPayload {
  sessionId: LiveSessionId;
  platform: SocialPlatform;
  socialAccountId: SocialAccountId;
  content: string;
  platformCommentId: string;
  replyToCommentId: string;
  replyToPlatformCommentId: string;
}

export type CommentRepliedEvent = BaseEvent<CommentRepliedPayload>;
