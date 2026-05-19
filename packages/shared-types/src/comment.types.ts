import type { LiveSessionId } from './stream.types.js';
import type { SocialPlatform } from './social.types.js';

export type CommentId = string & { readonly _brand: 'CommentId' };

export interface Comment {
  id: CommentId;
  sessionId: LiveSessionId;
  platform: SocialPlatform;
  platformCommentId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  receivedAt: Date;
}
