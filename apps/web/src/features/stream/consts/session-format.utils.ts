export function formatSessionDuration(
  startedAt: Date | string | null | undefined,
  endedAt: Date | string | null | undefined,
): string {
  if (!startedAt || !endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatSessionDate(iso: Date | string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
