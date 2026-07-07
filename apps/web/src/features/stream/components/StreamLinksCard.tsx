'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { API_BASE, apiFetch } from '@/lib/api';

interface Props {
  sessionId: string;
  platformHlsUrl: string | null;
  platformWhepUrl: string | null;
}

interface LinkRow {
  key: string;
  label: string;
  value: string;
  masked?: boolean;
}

/** Copyable stream links (watch page, HLS, WebRTC) + the masked ingest stream key. */
export function StreamLinksCard({
  sessionId,
  platformHlsUrl,
  platformWhepUrl,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [ingestKey, setIngestKey] = useState<string | null>(null);

  // The orchestrator allocates the ingest slot asynchronously on session start.
  useEffect(() => {
    let cancelled = false;
    async function fetchIngest(): Promise<void> {
      try {
        const res = await apiFetch(`${API_BASE}/stream-orchestrator/sessions/${sessionId}/ingest`);
        if (!res.ok) return;
        const data = (await res.json()) as { ingestKey?: string };
        if (!cancelled && data.ingestKey) setIngestKey(data.ingestKey);
      } catch {
        // slot not allocated yet — the row simply stays hidden
      }
    }
    void fetchIngest();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const watchUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/watch/${sessionId}` : '';

  const rows: LinkRow[] = [
    { key: 'watch', label: t('controlRoom.watchLink'), value: watchUrl },
    ...(platformHlsUrl
      ? [{ key: 'hls', label: t('controlRoom.hlsLink'), value: platformHlsUrl }]
      : []),
    ...(platformWhepUrl
      ? [{ key: 'whep', label: t('controlRoom.webrtcLink'), value: platformWhepUrl }]
      : []),
    ...(ingestKey
      ? [{ key: 'ingest', label: t('obs.streamKey'), value: ingestKey, masked: true }]
      : []),
  ];

  async function copy(row: LinkRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(row.value);
      setCopiedKey(row.key);
      setTimeout(() => setCopiedKey((k) => (k === row.key ? null : k)), 2000);
    } catch {
      // clipboard denied — no-op
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('controlRoom.links')}
      </span>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center gap-2 rounded-xl border border-[var(--input-border-color)] bg-surface-1 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {row.label}
            </p>
            <p className="truncate font-mono text-xs text-foreground">
              {row.masked && !keyVisible ? '••••••••••••••••' : row.value}
            </p>
          </div>
          {row.masked && (
            <button
              type="button"
              onClick={() => setKeyVisible((v) => !v)}
              aria-label={keyVisible ? t('obs.hideKey') : t('obs.showKey')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {keyVisible ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy(row)}
            aria-label={t('obs.copy')}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              copiedKey === row.key && 'text-emerald-500',
            )}
          >
            {copiedKey === row.key ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
