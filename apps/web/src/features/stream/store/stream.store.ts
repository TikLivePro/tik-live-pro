import { create } from 'zustand';
import type { LiveSession, LiveSessionStatus } from '@tik-live-pro/shared-types';
import type { Comment } from '@tik-live-pro/shared-types';

const MAX_COMMENTS = 200;

interface StreamState {
  currentSession: LiveSession | null;
  comments: Comment[];
  replyingTo: Comment | null;
  isStarting: boolean;
  isEnding: boolean;
  setSession: (session: LiveSession | null) => void;
  updateSessionStatus: (status: LiveSessionStatus) => void;
  addComment: (comment: Comment) => void;
  addComments: (comments: Comment[]) => void;
  clearComments: () => void;
  setReplyingTo: (comment: Comment | null) => void;
  setStarting: (value: boolean) => void;
  setEnding: (value: boolean) => void;
}

export const useStreamStore = create<StreamState>()((set) => ({
  currentSession: null,
  comments: [],
  replyingTo: null,
  isStarting: false,
  isEnding: false,

  setSession: (session) => set({ currentSession: session }),

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

  clearComments: () => set({ comments: [] }),
  setReplyingTo: (comment) => set({ replyingTo: comment }),
  setStarting: (value) => set({ isStarting: value }),
  setEnding: (value) => set({ isEnding: value }),
}));
