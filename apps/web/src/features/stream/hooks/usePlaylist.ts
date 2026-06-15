'use client';

import { useState, useCallback, useRef } from 'react';
import type { PlaylistItem } from '../interfaces/video-share.interfaces';

interface UsePlaylistOptions {
  onLoadItem: (item: PlaylistItem) => void;
}

export interface UsePlaylistResult {
  items: PlaylistItem[];
  currentIndex: number;
  addItem: (item: Omit<PlaylistItem, 'id'>) => void;
  removeItem: (id: string) => void;
  playAt: (index: number) => void;
  playNext: () => void;
  playPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  clearPlaylist: () => void;
}

export function usePlaylist({ onLoadItem }: UsePlaylistOptions): UsePlaylistResult {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const itemsRef = useRef<PlaylistItem[]>([]);
  const currentIndexRef = useRef(-1);

  const syncItems = useCallback((next: PlaylistItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const syncIndex = useCallback((next: number) => {
    currentIndexRef.current = next;
    setCurrentIndex(next);
  }, []);

  const playAt = useCallback(
    (index: number) => {
      const item = itemsRef.current[index];
      if (!item) return;
      syncIndex(index);
      onLoadItem(item);
    },
    [onLoadItem, syncIndex],
  );

  const addItem = useCallback(
    (itemData: Omit<PlaylistItem, 'id'>) => {
      const item: PlaylistItem = { ...itemData, id: crypto.randomUUID() };
      const next = [...itemsRef.current, item];
      syncItems(next);
    },
    [syncItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      const prev = itemsRef.current;
      const removedIndex = prev.findIndex((i) => i.id === id);
      const next = prev.filter((i) => i.id !== id);
      syncItems(next);
      const ci = currentIndexRef.current;
      if (removedIndex < ci) syncIndex(ci - 1);
      else if (removedIndex === ci) syncIndex(Math.min(ci, next.length - 1));
    },
    [syncItems, syncIndex],
  );

  const playNext = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < itemsRef.current.length) playAt(next);
  }, [playAt]);

  const playPrev = useCallback(() => {
    const prev = currentIndexRef.current - 1;
    if (prev >= 0) playAt(prev);
  }, [playAt]);

  const clearPlaylist = useCallback(() => {
    syncItems([]);
    syncIndex(-1);
  }, [syncItems, syncIndex]);

  const len = items.length;
  return {
    items,
    currentIndex,
    addItem,
    removeItem,
    playAt,
    playNext,
    playPrev,
    hasNext: len > 0 && currentIndex < len - 1,
    hasPrev: currentIndex > 0,
    clearPlaylist,
  };
}
