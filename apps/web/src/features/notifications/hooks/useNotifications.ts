'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';

export interface AppNotification {
  id: string;
  type: 'session_started' | 'session_ended' | 'stream_error' | 'billing_event' | 'account_connected';
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsPage {
  items: AppNotification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export function useNotifications() {
  const [data, setData] = useState<NotificationsPage | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/notifications?pageSize=20`);
      if (res.ok) {
        const json = (await res.json()) as { data: NotificationsPage };
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
    const id = setInterval(() => void fetch(), 30_000);
    return () => clearInterval(id);
  }, [fetch]);

  const markRead = useCallback(async (notificationId: string) => {
    await apiFetch(`${API_BASE}/notifications/${notificationId}/read`, { method: 'PATCH' });
    setData((prev) =>
      prev
        ? {
            ...prev,
            unreadCount: Math.max(0, prev.unreadCount - 1),
            items: prev.items.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
          }
        : prev,
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await apiFetch(`${API_BASE}/notifications/read-all`, { method: 'POST' });
    setData((prev) =>
      prev
        ? { ...prev, unreadCount: 0, items: prev.items.map((n) => ({ ...n, isRead: true })) }
        : prev,
    );
  }, []);

  const remove = useCallback(async (notificationId: string) => {
    await apiFetch(`${API_BASE}/notifications/${notificationId}`, { method: 'DELETE' });
    setData((prev) =>
      prev
        ? {
            ...prev,
            total: prev.total - 1,
            unreadCount: prev.items.find((n) => n.id === notificationId)?.isRead
              ? prev.unreadCount
              : Math.max(0, prev.unreadCount - 1),
            items: prev.items.filter((n) => n.id !== notificationId),
          }
        : prev,
    );
  }, []);

  return { data, loading, refresh: fetch, markRead, markAllRead, remove };
}
