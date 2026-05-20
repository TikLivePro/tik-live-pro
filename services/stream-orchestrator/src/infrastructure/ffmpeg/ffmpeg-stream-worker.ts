import ffmpeg from 'fluent-ffmpeg';
import type { FfmpegCommand } from 'fluent-ffmpeg';
import type { IStreamWorker, StreamDestinationConfig, StreamWorkerStats } from '../../application/ports/stream-worker.port.js';
import type { Logger } from '@tik-live-pro/logger';

export class FfmpegStreamWorker implements IStreamWorker {
  private command: FfmpegCommand | null = null;
  private _isRunning = false;
  private statsHandler: ((stats: StreamWorkerStats) => void) | null = null;
  private errorHandler: ((err: Error) => void) | null = null;

  constructor(private readonly logger: Logger) {}

  async start(ingestRtmpUrl: string, destinations: StreamDestinationConfig[]): Promise<void> {
    if (this._isRunning) throw new Error('Worker already running');
    if (destinations.length === 0) throw new Error('No destinations provided');
    this.logger.debug({ ingestRtmpUrl, destinationCount: destinations.length }, 'FfmpegWorker: starting');

    const cmd = ffmpeg(ingestRtmpUrl);

    cmd.on('progress', (progress: { currentFps: number; currentKbps: number; frames: number }) => {
      this.logger.debug({ fps: progress.currentFps, kbps: progress.currentKbps, frames: progress.frames }, 'FfmpegWorker: progress');
      if (this.statsHandler) {
        this.statsHandler({
          fps: progress.currentFps ?? 0,
          bitrate: progress.currentKbps ?? 0,
          frames: progress.frames ?? 0,
        });
      }
    });

    cmd.on('error', (err: Error) => {
      this.logger.error({ err }, 'FfmpegWorker: stream error');
      this._isRunning = false;
      if (this.errorHandler) this.errorHandler(err);
    });

    cmd.on('end', () => {
      this.logger.info('FfmpegWorker: stream ended');
      this._isRunning = false;
    });

    for (const dest of destinations) {
      cmd
        .output(dest.rtmpDestination)
        .outputOptions(['-c copy', '-f flv']);
    }

    this.command = cmd;

    return new Promise((resolve, reject) => {
      cmd.on('start', (cmdLine: string) => {
        this.logger.info({ cmdLine }, 'FfmpegWorker: ffmpeg process started');
        this._isRunning = true;
        resolve();
      });
      cmd.on('error', (err: Error) => reject(err));
      cmd.run();
    });
  }

  async stop(): Promise<void> {
    this.logger.debug('FfmpegWorker: stopping');
    if (!this.command) return;
    this.command.kill('SIGTERM');
    this._isRunning = false;
    this.command = null;
    this.logger.info('FfmpegWorker: stopped');
  }

  onStats(handler: (stats: StreamWorkerStats) => void): void {
    this.statsHandler = handler;
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandler = handler;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }
}
