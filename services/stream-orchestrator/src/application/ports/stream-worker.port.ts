export interface StreamDestinationConfig {
  rtmpDestination: string;
}

export interface StreamWorkerStats {
  fps: number;
  bitrate: number;
  frames: number;
}

export interface IStreamWorker {
  start(ingestRtmpUrl: string, destinations: StreamDestinationConfig[]): Promise<void>;
  stop(): Promise<void>;
  onStats(handler: (stats: StreamWorkerStats) => void): void;
  onError(handler: (err: Error) => void): void;
  readonly isRunning: boolean;
}

export type StreamWorkerFactory = () => IStreamWorker;
