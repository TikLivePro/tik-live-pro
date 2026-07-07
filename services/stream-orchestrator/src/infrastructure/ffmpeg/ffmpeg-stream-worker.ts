import ffmpeg from 'fluent-ffmpeg';
import type { FfmpegCommand } from 'fluent-ffmpeg';
import type { IStreamWorker, StreamDestinationConfig, StreamWorkerStats } from '../../application/ports/stream-worker.port.js';
import type { Logger } from '@tik-live-pro/logger';

export class FfmpegStreamWorker implements IStreamWorker {
  private command: FfmpegCommand | null = null;
  private _isRunning = false;
  private _stopping = false;
  private statsHandler: ((stats: StreamWorkerStats) => void) | null = null;
  private errorHandler: ((err: Error) => void) | null = null;

  constructor(private readonly logger: Logger) {}

  async start(ingestRtmpUrl: string, destinations: StreamDestinationConfig[]): Promise<void> {
    if (this._isRunning) throw new Error('Worker already running');
    if (destinations.length === 0) throw new Error('No destinations provided');
    this.logger.debug({ ingestRtmpUrl, destinationCount: destinations.length }, 'FfmpegWorker: starting');

    const cmd = ffmpeg(ingestRtmpUrl)
      .inputOptions([
        // Generate PTS when missing — WebRTC→RTMP conversion in MediaMTX can
        // produce frames without presentation timestamps, which ffmpeg then drops,
        // causing pixelisation and frame gaps at the platform end.
        '-fflags +genpts',
        // Shift all timestamps so none are negative. Negative DTS/PTS from the
        // WHIP→RTMP path cause ffmpeg to skip frames silently, producing a
        // pixelised first few seconds or micro-cuts after a reconnect.
        '-avoid_negative_ts make_zero',
        // Probe up to 2s of input before starting output (default is 5s / 5 MB).
        // Keeps startup fast while still catching audio packets that arrive late
        // on the WHIP→RTMP path — probing only 0.5s can miss the audio stream
        // entirely, producing a silent broadcast until the worker restarts.
        '-analyzeduration 2000000',
        '-probesize 1000000',
      ]);

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
      // A deliberate stop() kills ffmpeg with SIGTERM, which fluent-ffmpeg
      // surfaces as an error. Suppress it so the orchestrator's retry logic
      // doesn't restart a stream the user just stopped.
      if (this._stopping) {
        this.logger.debug({ err: err.message }, 'FfmpegWorker: ignoring error after deliberate stop');
        return;
      }
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
        .outputOptions([
          // Map video stream (required) and audio stream (optional – `?` prevents
          // ffmpeg from erroring if the source has no audio track, e.g. when the
          // streamer denied microphone permission in the browser).
          '-map 0:v:0',
          '-map 0:a:0?',
          // Copy video without re-encoding (saves CPU).
          '-c:v copy',
          // Re-encode audio to AAC 128 kbps — the universal format accepted by
          // TikTok, Facebook, YouTube, and every other RTMP platform.  Using
          // `-c copy` for audio caused silent streams when the browser sent Opus
          // (WebRTC default) because most RTMP platforms do not support Opus.
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-ac 2',
          '-f flv',
          // Increase the mux queue from the default 128 packets to 1024. When video
          // and audio timestamps momentarily diverge (common with WHIP sources), the
          // default limit overflows and ffmpeg drops packets, causing pixelisation.
          '-max_muxing_queue_size 1024',
          // Don't write duration/filesize in the FLV header — they are meaningless
          // for live streams and force a header seek that some RTMP ingest servers
          // (TikTok, Facebook) reject or mishandle, causing a connection reset.
          '-flvflags no_duration_filesize',
        ]);
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
    this._stopping = true;
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
