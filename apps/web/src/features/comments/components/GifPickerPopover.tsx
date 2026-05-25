'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? '';

interface GifItem {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
}

interface GifPickerPopoverProps {
  onSelect: (gifUrl: string) => void;
  disabled?: boolean | undefined;
}

export function GifPickerPopover({ onSelect, disabled }: GifPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gfRef = useRef<GiphyFetch | null>(null);

  useEffect(() => {
    if (GIPHY_KEY) gfRef.current = new GiphyFetch(GIPHY_KEY);
  }, []);

  const fetchGifs = useCallback(async (q: string) => {
    if (!gfRef.current) return;
    setLoading(true);
    try {
      const result = q
        ? await gfRef.current.search(q, { limit: 12, rating: 'g' })
        : await gfRef.current.trending({ limit: 12, rating: 'g' });

      setGifs(
        result.data.map((g) => ({
          id: String(g.id),
          url: g.images.original.url,
          previewUrl: g.images.fixed_height_small.url,
          title: g.title,
        })),
      );
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !GIPHY_KEY) return;
    void fetchGifs('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void fetchGifs(q), 400);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded-md hover:bg-muted transition-colors text-xs font-bold tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insert GIF"
        aria-label="Insert GIF"
      >
        GIF
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 bg-card text-card-foreground [backdrop-filter:none] border border-border/60 rounded-xl shadow-2xl w-72 overflow-hidden flex flex-col">
          {!GIPHY_KEY ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              <p className="font-medium mb-1">GIF search not configured</p>
              <p>
                Set{' '}
                <code className="bg-muted px-1 rounded">NEXT_PUBLIC_GIPHY_API_KEY</code>
              </p>
            </div>
          ) : (
            <>
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search GIFs…"
                  className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 p-2 max-h-52 overflow-y-auto">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-20 rounded bg-muted animate-pulse" />
                    ))
                  : gifs.length === 0
                    ? (
                      <p className="col-span-3 text-center text-xs text-muted-foreground py-6">
                        No GIFs found
                      </p>
                    )
                    : gifs.map((gif) => (
                        <button
                          key={gif.id}
                          onClick={() => {
                            onSelect(gif.url);
                            setOpen(false);
                            setQuery('');
                          }}
                          className="rounded overflow-hidden hover:opacity-75 transition-opacity focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={gif.previewUrl}
                            alt={gif.title}
                            className="w-full h-20 object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
              </div>

              <p className="text-center text-[10px] text-muted-foreground py-1 border-t border-border">
                Powered by GIPHY
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
