'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { type MutableRefObject } from 'react';
import { io as socketIo, type Socket } from 'socket.io-client';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE, COMMENTS_WS_URL, apiFetch } from '@/lib/api';
import type { Comment, LiveSessionId } from '@tik-live-pro/shared-types';

interface UseCommentsResult {
  comments: Comment[];
  replyingTo: Comment | null;
  setReplyingTo: (comment: Comment | null) => void;
  sendComment: (content: string, mediaUrls?: string[]) => Promise<void>;
  replyToComment: (commentId: string, content: string, mediaUrls?: string[]) => Promise<void>;
  emitReaction: (emoji: string) => void;
  isSending: boolean;
  sendError: string | null;
  socketRef: MutableRefObject<Socket | null>;
}

export function useComments(sessionId: LiveSessionId | null): UseCommentsResult {
  const socketRef = useRef<Socket | null>(null);
  const { displayName } = useAuthStore();
  const { comments, addComment, addReaction, replyingTo, setReplyingTo } = useStreamStore();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // auth is a callback so every (re)connect handshake carries a *fresh*
    // access token from the store — a static object would replay the token
    // captured at mount, which expires after 15 min and would make the server
    // reject streamer re-registration after a reconnect.
    const socket = socketIo(COMMENTS_WS_URL, {
      auth: (cb) => {
        const token = useAuthStore.getState().accessToken;
        cb(token ? { token } : {});
      },
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
  }, [sessionId, addComment, addReaction]);

  const emitReaction = useCallback((emoji: string) => {
    socketRef.current?.emit('emit_reaction', { emoji });
  }, []);

  const sendComment = useCallback(
    async (content: string, mediaUrls?: string[]): Promise<void> => {
      if (!sessionId || (!content.trim() && !mediaUrls?.length)) return;
      setIsSending(true);
      setSendError(null);
      try {
        const res = await apiFetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            content: content.trim(),
            ...(displayName ? { authorName: displayName } : {}),
            ...(mediaUrls?.length ? { mediaUrls } : {}),
          }),
        });
        if (res.ok) {
          try {
            // POST /comments returns an array (one entry per platform posted to)
            const body = (await res.json()) as { data: Comment | Comment[] };
            const created = Array.isArray(body?.data) ? body.data : [body?.data];
            for (const comment of created) {
              if (comment?.id) addComment(comment);
            }
          } catch { /* ignore parse errors — socket will deliver the comment */ }
        } else {
          setSendError('sendError');
        }
      } catch {
        setSendError('sendError');
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, displayName, addComment],
  );

  const replyToComment = useCallback(
    async (commentId: string, content: string, mediaUrls?: string[]): Promise<void> => {
      if (!sessionId || (!content.trim() && !mediaUrls?.length)) return;
      setIsSending(true);
      setSendError(null);
      try {
        const res = await apiFetch(`${API_BASE}/comments/${commentId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            content: content.trim(),
            ...(displayName ? { authorName: displayName } : {}),
            ...(mediaUrls?.length ? { mediaUrls } : {}),
          }),
        });
        if (res.ok) {
          try {
            const body = (await res.json()) as { data: Comment };
            const created = body?.data;
            if (created?.id) addComment(created);
          } catch { /* ignore parse errors — socket will deliver the comment */ }
          setReplyingTo(null);
        } else {
          setSendError('sendError');
        }
      } catch {
        setSendError('sendError');
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, displayName, setReplyingTo, addComment],
  );

  return { comments, replyingTo, setReplyingTo, sendComment, replyToComment, emitReaction, isSending, sendError, socketRef };
}
