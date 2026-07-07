import type { Comment } from '@tik-live-pro/shared-types';

/** A persisted emoji reaction as returned by GET /comments/reactions. */
export interface SessionReaction {
  id: string;
  sessionId: string;
  emoji: string;
  /** ISO 8601 — exact moment the reaction was sent. */
  createdAt: string;
}

/** One entry of the chronological replay timeline. */
export type ReplayItem =
  | { type: 'comment'; at: number; comment: Comment }
  | {
      type: 'reaction';
      at: number;
      id: string;
      emoji: string;
      /** Identical emojis sent within the same second are grouped. */
      count: number;
      /** ISO timestamp of the (first) reaction in the group. */
      sentAt: string;
    };

export interface SessionReplay {
  items: ReplayItem[];
  commentCount: number;
  reactionCount: number;
  loading: boolean;
  error: boolean;
}
