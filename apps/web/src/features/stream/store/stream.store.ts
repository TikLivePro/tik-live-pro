import { create } from 'zustand';
import type { LiveSession, LiveSessionStatus } from '@tik-live-pro/shared-types';
import type { Comment } from '@tik-live-pro/shared-types';

const MAX_COMMENTS = 200;
const MAX_REACTIONS = 20;

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
  isStarting: boolean;
  isEnding: boolean;
  isPausing: boolean;
  isMinimized: boolean;
  activeStream: MediaStream | null;
  setSession: (session: LiveSession | null) => void;
  updateSessionStatus: (status: LiveSessionStatus) => void;
  addComment: (comment: Comment) => void;
  addComments: (comments: Comment[]) => void;
  removeComment: (id: string) => void;
  clearComments: () => void;
  addReaction: (reaction: LiveReaction) => void;
  removeReaction: (id: string) => void;
  setReplyingTo: (comment: Comment | null) => void;
  setStarting: (value: boolean) => void;
  setEnding: (value: boolean) => void;
  setPausing: (value: boolean) => void;
  setMinimized: (value: boolean) => void;
  setActiveStream: (stream: MediaStream | null) => void;
}

export const useStreamStore = create<StreamState>()((set, get) => ({
  currentSession: null,
  comments: [],
  liveReactions: [],
  replyingTo: null,
  isStarting: false,
  isEnding: false,
  isPausing: false,
  isMinimized: false,
  activeStream: null,

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

  clearComments: () => set({ comments: [] }),

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
}));
