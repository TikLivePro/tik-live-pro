/** Exact wall-clock send time (HH:MM:SS) for replay timeline rows. */
export function formatExactTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Full date + time, used as the tooltip on replay timestamps. */
export function formatExactDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString();
}
