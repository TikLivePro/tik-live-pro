'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRecordingsList } from '../hooks/useRecordingsList';
import { useCompletedRecordings } from '../hooks/useCompletedRecordings';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { API_BASE, apiFetch } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ActiveRecordingRow({ ingestKey, title, segments, sessionId, status, onRefresh }: {
  ingestKey: string;
  title: string | null;
  segments: { startedAt: string }[];
  sessionId: string | null;
  status: 'recording' | 'paused';
  onRefresh: () => void;
}) {
  const t = useTranslations('stream');
  const oldest = segments[0];
  const elapsed = useElapsedTime(oldest ? new Date(oldest.startedAt) : null);
  const displayName = title ?? ingestKey.slice(0, 8);
  const [isStopping, setIsStopping] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleStop = useCallback(async (): Promise<void> => {
    if (!sessionId || isStopping) return;
    setIsStopping(true);
    try {
      const res = await apiFetch(
        `${API_BASE}/stream-orchestrator/sessions/${sessionId}/recording/stop`,
        { method: 'POST' },
      );
      if (!res.ok) {
        toast.error(t('recording.stopFailed'));
        return;
      }
      toast.success(t('recording.stopped'));
      onRefresh();
    } catch {
      toast.error(t('recording.stopFailed'));
    } finally {
      setIsStopping(false);
    }
  }, [sessionId, isStopping, t, onRefresh]);

  const handlePause = useCallback(async (): Promise<void> => {
    if (!sessionId || isToggling) return;
    setIsToggling(true);
    try {
      const res = await apiFetch(
        `${API_BASE}/stream-orchestrator/sessions/${sessionId}/recording/pause`,
        { method: 'POST' },
      );
      if (!res.ok) {
        toast.error(t('recording.pauseFailed'));
        return;
      }
      toast.success(t('recording.paused'));
      onRefresh();
    } catch {
      toast.error(t('recording.pauseFailed'));
    } finally {
      setIsToggling(false);
    }
  }, [sessionId, isToggling, t, onRefresh]);

  const handleResume = useCallback(async (): Promise<void> => {
    if (!sessionId || isToggling) return;
    setIsToggling(true);
    try {
      const res = await apiFetch(
        `${API_BASE}/stream-orchestrator/sessions/${sessionId}/recording/resume`,
        { method: 'POST' },
      );
      if (!res.ok) {
        toast.error(t('recording.resumeFailed'));
        return;
      }
      toast.success(t('recording.resumed'));
      onRefresh();
    } catch {
      toast.error(t('recording.resumeFailed'));
    } finally {
      setIsToggling(false);
    }
  }, [sessionId, isToggling, t, onRefresh]);

  const isRecording = status === 'recording';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3">
      <span className={cn(
        'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
        isRecording ? 'bg-red-600/20' : 'bg-yellow-600/20',
      )}>
        <span className={cn(
          'h-2 w-2 rounded-full',
          isRecording ? 'animate-pulse bg-red-500' : 'bg-yellow-500',
        )} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{displayName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{elapsed}</p>
        <p className={cn('mt-1 text-[11px] font-medium', isRecording ? 'text-red-400' : 'text-yellow-400')}>
          {isRecording ? t('recordings.activeLabel') : t('recordings.pausedLabel')}
          {segments.length > 1 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {t('recordings.segmentCount', { n: segments.length })}
            </span>
          )}
        </p>
      </div>
      {sessionId && (
        <div className="ml-1 flex flex-shrink-0 gap-1">
          {isRecording ? (
            <button
              type="button"
              onClick={() => void handlePause()}
              disabled={isToggling}
              aria-label={t('recordings.pauseRecording')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-400 disabled:pointer-events-none disabled:opacity-40"
            >
              {isToggling ? <SpinnerIcon /> : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleResume()}
              disabled={isToggling}
              aria-label={t('recordings.resumeRecording')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-green-500/50 hover:bg-green-500/10 hover:text-green-400 disabled:pointer-events-none disabled:opacity-40"
            >
              {isToggling ? <SpinnerIcon /> : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={isStopping}
            aria-label={t('recordings.stopRecording')}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
          >
            {isStopping ? <SpinnerIcon /> : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function CompletedRecordingRow({ recording }: { recording: {
  id: string;
  fileName: string;
  publicUrl: string;
  sizeBytes: number;
  createdAt: string;
}}) {
  const t = useTranslations('stream');
  const date = new Date(recording.createdAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const sizeMb = (recording.sizeBytes / 1024 / 1024).toFixed(1);
  const downloadUrl = `${API_BASE}/stream-orchestrator/recordings/${recording.id}/download`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3">
      <div className="flex items-start gap-2">
        <svg
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{recording.fileName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {date}
            {recording.sizeBytes > 0 && (
              <span className="ml-2">{t('recordings.fileSize', { size: sizeMb })}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <a
          href={recording.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          {t('recordings.view')}
        </a>
        <a
          href={downloadUrl}
          download={recording.fileName}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('recordings.download')}
        </a>
      </div>
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </p>
  );
}

export function RecordingsSidebar({ open, onClose }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const tCommon = useTranslations('common');
  const { items: active, isLoading: activeLoading, refresh } = useRecordingsList(open);
  const { items: completed, isLoading: completedLoading } = useCompletedRecordings(open);

  const isLoading = activeLoading || completedLoading;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Panel */}
      <aside
        aria-label={t('recordings.sectionLabel')}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-background shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {t('recordings.sectionLabel')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('close')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {isLoading && active.length === 0 && completed.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{tCommon('loading')}</p>
          ) : (
            <>
              {/* Active / paused recordings */}
              <section className="space-y-2">
                <SectionHeading label={t('recordings.activeHeading')} />
                {active.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">{t('recordings.empty')}</p>
                ) : (
                  active.map((item) => (
                    <ActiveRecordingRow
                      key={item.ingestKey}
                      ingestKey={item.ingestKey}
                      title={item.title}
                      segments={item.segments}
                      sessionId={item.sessionId}
                      status={item.status}
                      onRefresh={refresh}
                    />
                  ))
                )}
              </section>

              {/* Completed recordings */}
              <section className="space-y-2">
                <SectionHeading label={t('recordings.completedHeading')} />
                {completed.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    {t('recordings.completedEmpty')}
                  </p>
                ) : (
                  completed.map((rec) => (
                    <CompletedRecordingRow key={rec.id} recording={rec} />
                  ))
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
