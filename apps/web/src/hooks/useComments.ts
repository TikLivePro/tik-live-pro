'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useStreamStore } from '@/store/stream.store';
import { useAuthStore } from '@/store/auth.store';
import type { Comment, LiveSessionId } from '@tik-live-pro/shared-types';

const COMMENTS_WS_URL = process.env['NEXT_PUBLIC_COMMENTS_WS_URL'] ?? 'http://localhost:3006';

export function useComments(sessionId: LiveSessionId | null) {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken } = useAuthStore();
  const { comments, addComment } = useStreamStore();

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const socket = io(COMMENTS_WS_URL, {
      auth: { token: accessToken },
      query: { sessionId },
      transports: ['websocket'],
    });

    socket.on('comment', (comment: Comment) => {
      addComment(comment);
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('Comments WS error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, accessToken, addComment]);

  return { comments };
}
