import type { Logger } from '@tik-live-pro/logger';

interface MediaMtxPath {
  name: string;
  source: unknown | null;
}

interface MediaMtxPathsResponse {
  items: MediaMtxPath[];
}

export class MediaMtxStreamWatcher {
  private readonly knownPaths = new Set<string>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly authHeader: string;
  // Prevents overlapping polls piling up hung requests when MediaMTX stalls.
  private pollInFlight = false;

  constructor(
    private readonly apiUrl: string,
    private readonly onStreamArrived: (ingestKey: string) => Promise<void>,
    private readonly onStreamEnded: (ingestKey: string) => void,
    private readonly logger: Logger,
    apiUser: string,
    apiPass: string,
  ) {
    this.authHeader = `Basic ${Buffer.from(`${apiUser}:${apiPass}`).toString('base64')}`;
  }

  start(): void {
    this.intervalHandle = setInterval(() => void this.poll(), 1000);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const res = await fetch(`${this.apiUrl}/v3/paths/list`, {
        headers: { Authorization: this.authHeader },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as MediaMtxPathsResponse;

      const active = new Set<string>();
      for (const path of data.items ?? []) {
        if (path.source !== null && path.name.startsWith('live/')) {
          active.add(path.name);
        }
      }

      for (const name of active) {
        if (!this.knownPaths.has(name)) {
          const ingestKey = name.slice('live/'.length);
          this.logger.info({ ingestKey }, 'MediaMTX stream arrived');
          // Add before calling handler to prevent concurrent duplicate calls.
          // Removed on error so the next poll retries.
          this.knownPaths.add(name);
          // Fire-and-forget: a worker start can queue behind the 5-slot start
          // semaphore for seconds; awaiting it here would delay end-detection
          // for every other stream in the same tick.
          void this.onStreamArrived(ingestKey).catch((err: unknown) => {
            this.logger.warn({ ingestKey, err }, 'Stream arrival handler failed, will retry next poll');
            this.knownPaths.delete(name);
          });
        }
      }

      for (const name of this.knownPaths) {
        if (!active.has(name)) {
          const ingestKey = name.slice('live/'.length);
          this.logger.info({ ingestKey }, 'MediaMTX stream ended');
          this.knownPaths.delete(name);
          this.onStreamEnded(ingestKey);
        }
      }
    } catch {
      // transient errors (mediamtx not yet ready) — ignore
    } finally {
      this.pollInFlight = false;
    }
  }
}
