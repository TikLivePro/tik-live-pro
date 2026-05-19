import { create } from 'zustand';
import type { LiveSession, Comment, LiveSessionStatus } from '@tik-live-pro/shared-types';

const MAX_COMMENTS = 200;

interface StreamState {
  currentSession: LiveSession | null;
  comments: Comment[];
  isStarting: boolean;
  isEnding: boolean;
  setSession: (session: LiveSession | null) => void;
  updateSessionStatus: (status: LiveSessionStatus) => void;
  addComment: (comment: Comment) => void;
  clearComments: () => void;
  setStarting: (v: boolean) => void;
  setEnding: (v: boolean) => void;
}

export const useStreamStore = create<StreamState>()((set) => ({
  currentSession: null,
  comments: [],
  isStarting: false,
  isEnding: false,
  setSession: (session) => set({ currentSession: session }),
  updateSessionStatus: (status) =>
    set((s) => ({ currentSession: s.currentSession ? { ...s.currentSession, status } : null })),
  addComment: (comment) =>
    set((s) => ({ comments: [comment, ...s.comments].slice(0, MAX_COMMENTS) })),
  clearComments: () => set({ comments: [] }),
  setStarting: (isStarting) => set({ isStarting }),
  setEnding: (isEnding) => set({ isEnding }),
}));
