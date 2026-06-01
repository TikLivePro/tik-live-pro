'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io as socketIo, type Socket } from 'socket.io-client';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { COMMENTS_WS_URL, apiFetch } from '@/lib/api';
import type { Comment, LiveSessionId } from '@tik-live-pro/shared-types';

export function useComments(sessionId: LiveSessionId | null) {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken } = useAuthStore();
  const { comments, addComment, addReaction, replyingTo, setReplyingTo } = useStreamStore();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const socket = socketIo(COMMENTS_WS_URL, {
      auth: { token: accessToken },
      query: { sessionId },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('comment', (comment: Comment) => {
      addComment(comment);
    });

    socket.on('reaction', (data: { emoji: string }) => {
      addReaction({
        id: crypto.randomUUID(),
        emoji: data.emoji,
        left: Math.floor(Math.random() * 36),
      });
    });

    socket.on('connect_error', () => {
      console.warn('Comments socket connection error');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, accessToken, addComment, addReaction]);

  const sendComment = useCallback(
    async (content: string, mediaUrls?: string[]): Promise<void> => {
      if (!sessionId || (!content.trim() && !mediaUrls?.length)) return;
      setIsSending(true);
      setSendError(null);
      try {
        await apiFetch('/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            content: content.trim(),
            ...(mediaUrls?.length ? { mediaUrls } : {}),
          }),
        });
      } catch {
        setSendError('sendError');
      } finally {
        setIsSending(false);
      }
    },
    [sessionId],
  );

  const replyToComment = useCallback(
    async (commentId: string, content: string, mediaUrls?: string[]): Promise<void> => {
      if (!content.trim() && !mediaUrls?.length) return;
      setIsSending(true);
      setSendError(null);
      try {
        await apiFetch(`/comments/${commentId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: content.trim(),
            ...(mediaUrls?.length ? { mediaUrls } : {}),
          }),
        });
        setReplyingTo(null);
      } catch {
        setSendError('sendError');
      } finally {
        setIsSending(false);
      }
    },
    [setReplyingTo],
  );

  return { comments, replyingTo, setReplyingTo, sendComment, replyToComment, isSending, sendError };
}
