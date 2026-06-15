import { create } from 'zustand';
import type { LiveSession, LiveSessionStatus } from '@tik-live-pro/shared-types';
import type { Comment } from '@tik-live-pro/shared-types';
import { DEFAULT_VIDEO_QUALITY_ID } from '../consts/stream.consts';
import type { PlatformVideoContext, PlaylistItem } from '../interfaces/video-share.interfaces';

const MAX_COMMENTS = 200;
const MAX_REACTIONS = 20;
const QUALITY_STORAGE_KEY = 'tiklivepro:videoQualityId';
const PLATFORM_CTX_KEY = 'tiklivepro:video:platformCtx';

export type PreSourceType = 'local-file' | 'online-url';

export interface PreSource {
  type: PreSourceType;
  file?: File;
  url?: string;
}

export interface LiveReaction {
  id: string;
  emoji: string;
  left: number;
}

interface StreamState {
  currentSession: LiveSession | null;
  comments: Comment[];
  liveReactions: LiveReaction[];
  replyingTo: Comment | null;
  commentReactions: Record<string, Record<string, number>>;
  myCommentReactions: Record<string, string>;
  isStarting: boolean;
  isEnding: boolean;
  isPausing: boolean;
  isMinimized: boolean;
  activeStream: MediaStream | null;
  videoQualityId: string;
  setSession: (session: LiveSession | null) => void;
  updateSessionStatus: (status: LiveSessionStatus) => void;
  addComment: (comment: Comment) => void;
  addComments: (comments: Comment[]) => void;
  removeComment: (id: string) => void;
  clearComments: () => void;
  addReaction: (reaction: LiveReaction) => void;
  removeReaction: (id: string) => void;
  addCommentReaction: (commentId: string, emoji: string) => void;
  setReplyingTo: (comment: Comment | null) => void;
  setStarting: (value: boolean) => void;
  setEnding: (value: boolean) => void;
  setPausing: (value: boolean) => void;
  setMinimized: (value: boolean) => void;
  setActiveStream: (stream: MediaStream | null) => void;
  setVideoQualityId: (id: string) => void;
  hydrateVideoQuality: () => void;
  preSource: PreSource | null;
  setPreSource: (src: PreSource | null) => void;
  /** Playlist pre-configured in GoLiveForm — consumed by FullscreenLiveView on mount. */
  prePlaylist: PlaylistItem[];
  setPrePlaylist: (items: PlaylistItem[]) => void;
  /** Context for platform-resolved URLs (YouTube, Twitch…). Survives the GoLiveForm → dashboard transition. */
  platformVideoContext: PlatformVideoContext | null;
  setPlatformVideoContext: (ctx: PlatformVideoContext | null) => void;
  /** Restores platformVideoContext from localStorage after a page reload. */
  hydratePlatformVideoContext: () => void;
}

export const useStreamStore = create<StreamState>()((set, get) => ({
  currentSession: null,
  comments: [],
  liveReactions: [],
  replyingTo: null,
  commentReactions: {},
  myCommentReactions: {},
  isStarting: false,
  isEnding: false,
  isPausing: false,
  isMinimized: false,
  activeStream: null,
  videoQualityId: DEFAULT_VIDEO_QUALITY_ID,
  preSource: null,
  prePlaylist: [],
  platformVideoContext: null,

  setSession: (session) => {
    if (session === null) {
      // Stop camera tracks and clear mini player when session ends
      const stream = get().activeStream;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      set({ currentSession: null, activeStream: null, isMinimized: false });
    } else {
      set({ currentSession: session });
    }
  },

  updateSessionStatus: (status) =>
    set((state) => ({
      currentSession: state.currentSession ? { ...state.currentSession, status } : null,
    })),

  addComment: (comment) =>
    set((state) => {
      const existingIndex = state.comments.findIndex((c) => c.id === comment.id);
      if (existingIndex >= 0) {
        const comments = [...state.comments];
        comments[existingIndex] = comment;
        return { comments };
      }
      const comments = [comment, ...state.comments].slice(0, MAX_COMMENTS);
      return { comments };
    }),

  addComments: (incoming) =>
    set((state) => {
      const comments = [...incoming, ...state.comments].slice(0, MAX_COMMENTS);
      return { comments };
    }),

  removeComment: (id) =>
    set((state) => ({ comments: state.comments.filter((c) => c.id !== id) })),

  clearComments: () => set({ comments: [], commentReactions: {}, myCommentReactions: {} }),

  addCommentReaction: (commentId, emoji) =>
    set((state) => {
      const prev = state.myCommentReactions[commentId];
      const reactionMap = { ...(state.commentReactions[commentId] ?? {}) };
      const myReactions = { ...state.myCommentReactions };

      if (prev === emoji) {
        reactionMap[emoji] = Math.max(0, (reactionMap[emoji] ?? 1) - 1);
        if (reactionMap[emoji] === 0) delete reactionMap[emoji];
        delete myReactions[commentId];
      } else {
        if (prev) {
          reactionMap[prev] = Math.max(0, (reactionMap[prev] ?? 1) - 1);
          if (reactionMap[prev] === 0) delete reactionMap[prev];
        }
        reactionMap[emoji] = (reactionMap[emoji] ?? 0) + 1;
        myReactions[commentId] = emoji;
      }

      return {
        commentReactions: { ...state.commentReactions, [commentId]: reactionMap },
        myCommentReactions: myReactions,
      };
    }),

  addReaction: (reaction) =>
    set((state) => ({
      liveReactions: [...state.liveReactions, reaction].slice(-MAX_REACTIONS),
    })),

  removeReaction: (id) =>
    set((state) => ({
      liveReactions: state.liveReactions.filter((r) => r.id !== id),
    })),

  setReplyingTo: (comment) => set({ replyingTo: comment }),
  setStarting: (value) => set({ isStarting: value }),
  setEnding: (value) => set({ isEnding: value }),
  setPausing: (value) => set({ isPausing: value }),
  setMinimized: (value) => set({ isMinimized: value }),
  setActiveStream: (stream) => set({ activeStream: stream }),
  setVideoQualityId: (id) => {
    if (typeof window !== 'undefined') localStorage.setItem(QUALITY_STORAGE_KEY, id);
    set({ videoQualityId: id });
  },
  hydrateVideoQuality: () => {
    const stored = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (stored) set({ videoQualityId: stored });
  },
  setPreSource: (src) => set({ preSource: src }),
  setPrePlaylist: (items) => set({ prePlaylist: items }),
  setPlatformVideoContext: (ctx) => {
    try {
      if (ctx) localStorage.setItem(PLATFORM_CTX_KEY, JSON.stringify(ctx));
      else localStorage.removeItem(PLATFORM_CTX_KEY);
    } catch { /* ignore */ }
    set({ platformVideoContext: ctx });
  },
  hydratePlatformVideoContext: () => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(PLATFORM_CTX_KEY) : null;
      if (raw) set({ platformVideoContext: JSON.parse(raw) as PlatformVideoContext });
    } catch { /* ignore */ }
  },
}));
