'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { Comment } from '@tik-live-pro/shared-types';
import type { ReplayItem, SessionReaction, SessionReplay } from '../interfaces/replay.interfaces';

// Both endpoints are publicly readable — replay pages work for anonymous viewers.
const COMMENT_PAGE_SIZE = 100;
const REACTION_PAGE_SIZE = 500;
// Fetch caps: 10 pages each → up to 1,000 comments and 5,000 reactions per replay.
const MAX_PAGES = 10;

async function fetchAllComments(sessionId: string, signal: AbortSignal): Promise<Comment[]> {
  const all: Comment[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${API_BASE}/comments?sessionId=${sessionId}&page=${page}&pageSize=${COMMENT_PAGE_SIZE}`,
      { signal },
    );
    if (!res.ok) throw new Error(`comments ${res.status}`);
    const { data } = (await res.json()) as { data: { items: Comment[]; hasNextPage: boolean } };
    all.push(...data.items);
    if (!data.hasNextPage) break;
  }
  return all;
}

async function fetchAllReactions(sessionId: string, signal: AbortSignal): Promise<SessionReaction[]> {
  const all: SessionReaction[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${API_BASE}/comments/reactions?sessionId=${sessionId}&page=${page}&pageSize=${REACTION_PAGE_SIZE}`,
      { signal },
    );
    if (!res.ok) throw new Error(`reactions ${res.status}`);
    const { data } = (await res.json()) as { data: { items: SessionReaction[]; hasNextPage: boolean } };
    all.push(...data.items);
    if (!data.hasNextPage) break;
  }
  return all;
}

/** Groups identical emojis sent within the same second into one timeline row. */
function groupReactions(reactions: SessionReaction[]): ReplayItem[] {
  const groups: Extract<ReplayItem, { type: 'reaction' }>[] = [];
  for (const r of reactions) {
    const at = new Date(r.createdAt).getTime();
    const last = groups[groups.length - 1];
    if (last && last.emoji === r.emoji && Math.floor(at / 1000) === Math.floor(last.at / 1000)) {
      last.count += 1;
    } else {
      groups.push({ type: 'reaction', at, id: r.id, emoji: r.emoji, count: 1, sentAt: r.createdAt });
    }
  }
  return groups;
}

/**
 * Loads the full comment + reaction history of an ended session and merges it
 * into one chronological timeline (oldest first) with exact send times.
 */
export function useSessionReplay(sessionId: string | null, enabled: boolean): SessionReplay {
  const [items, setItems] = useState<ReplayItem[]>([]);
  const [counts, setCounts] = useState({ commentCount: 0, reactionCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    void (async () => {
      try {
        const [comments, reactions] = await Promise.all([
          fetchAllComments(sessionId, controller.signal),
          fetchAllReactions(sessionId, controller.signal),
        ]);

        const commentItems: ReplayItem[] = comments.map((comment) => ({
          type: 'comment',
          at: new Date(comment.receivedAt).getTime(),
          comment,
        }));
        // GET /comments/reactions is already oldest-first (grouping relies on it)
        const reactionItems = groupReactions(reactions);

        const merged = [...commentItems, ...reactionItems].sort((a, b) => a.at - b.at);
        setItems(merged);
        setCounts({ commentCount: comments.length, reactionCount: reactions.length });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [sessionId, enabled]);

  return { items, loading, error, ...counts };
}
