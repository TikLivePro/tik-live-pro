'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { COMMENTS_WS_URL, apiFetch } from '@/lib/api';
import type { Comment, LiveSessionId } from '@tik-live-pro/shared-types';

type WsMessage =
  | { type: 'comment'; data: Comment }
  | { type: 'ping' }
  | { type: 'session_ended' };

export function useComments(sessionId: LiveSessionId | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const { accessToken } = useAuthStore();
  const { comments, addComment, replyingTo, setReplyingTo } = useStreamStore();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const wsBase = COMMENTS_WS_URL.replace(/^http/, 'ws');
    const url = `${wsBase}/comments/ws?sessionId=${sessionId}&token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        if (msg.type === 'comment') {
          addComment(msg.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      console.warn('Comments WebSocket error');
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId, accessToken, addComment]);

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
