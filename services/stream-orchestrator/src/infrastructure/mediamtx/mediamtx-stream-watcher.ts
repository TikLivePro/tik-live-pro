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

  constructor(
    private readonly apiUrl: string,
    private readonly onStreamArrived: (ingestKey: string) => void,
    private readonly onStreamEnded: (ingestKey: string) => void,
    private readonly logger: Logger,
  ) {}

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
    try {
      const res = await fetch(`${this.apiUrl}/v3/paths/list`);
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
          this.knownPaths.add(name);
          this.onStreamArrived(ingestKey);
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
    }
  }
}
