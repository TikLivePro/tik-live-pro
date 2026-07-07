import type { FfmpegCommand } from 'fluent-ffmpeg';

// sessionId → active video-push ffmpeg process (one per session at a time).
// Lives in infrastructure so both the HTTP routes (which start pushes) and the
// stop-broadcast path (which must kill them on session end) share the registry.
// Without that, a looping `-stream_loop -1` libx264 push outlives its session,
// keeps the MediaMTX path alive, and permanently burns ~1 CPU core.
const processes = new Map<string, FfmpegCommand>();

export function registerVideoPush(sessionId: string, proc: FfmpegCommand): void {
  processes.set(sessionId, proc);
}

export function getVideoPush(sessionId: string): FfmpegCommand | undefined {
  return processes.get(sessionId);
}

// Removes the registry entry only if it still points at `proc`, so a late
// error/end event from a replaced process cannot unregister its successor.
export function unregisterVideoPush(sessionId: string, proc: FfmpegCommand): void {
  if (processes.get(sessionId) === proc) {
    processes.delete(sessionId);
  }
}

export function stopVideoPush(sessionId: string): boolean {
  const proc = processes.get(sessionId);
  if (!proc) return false;
  processes.delete(sessionId);
  proc.kill('SIGKILL');
  return true;
}

// Kills every active push (graceful shutdown). Returns the session ids stopped.
export function stopAllVideoPushes(): string[] {
  const stopped = [...processes.keys()];
  for (const proc of processes.values()) {
    proc.kill('SIGKILL');
  }
  processes.clear();
  return stopped;
}

export function activeVideoPushCount(): number {
  return processes.size;
}
