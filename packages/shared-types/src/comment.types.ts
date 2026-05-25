import type { LiveSessionId } from './stream.types.js';
import type { SocialPlatform } from './social.types.js';

export type CommentId = string & { readonly _brand: 'CommentId' };

export interface Comment {
  id: CommentId;
  sessionId: LiveSessionId;
  platform: SocialPlatform;
  platformCommentId: string;
  authorName: string;
  authorPlatformUserId: string;
  authorAvatarUrl: string | null;
  content: string;
  mediaUrls?: string[] | null;
  replyToCommentId?: CommentId;
  receivedAt: Date;
}
