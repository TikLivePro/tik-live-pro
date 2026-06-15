import NodeMediaServer from 'node-media-server';
import type { Logger } from '@tik-live-pro/logger';

type StreamArrivedCallback = (ingestKey: string) => void;
type StreamDoneCallback = (ingestKey: string) => void;

export class RtmpIngestServer {
  private readonly nms: NodeMediaServer;

  constructor(
    private readonly port: number,
    private readonly logger: Logger,
  ) {
    this.nms = new NodeMediaServer({
      rtmp: {
        port,
        chunk_size: 60000,
        gop_cache: true,
        // Detect silently-dead OBS connections faster: ping every 15s, disconnect
        // after 30s without a pong. Default (ping:30 / timeout:60) leaves a dead
        // publisher "live" for up to 90s, keeping the session in a stuck state.
        ping: 15,
        ping_timeout: 30,
      },
      logType: 0, // suppress NMS internal logging; we use our own logger
    });
  }

  onStreamArrived(callback: StreamArrivedCallback): void {
    this.nms.on('postPublish', (_id, streamPath) => {
      const key = this.extractKey(streamPath);
      if (!key) return;
      this.logger.info({ streamPath, ingestKey: key }, 'RTMP stream arrived');
      callback(key);
    });
  }

  onStreamDone(callback: StreamDoneCallback): void {
    this.nms.on('donePublish', (_id, streamPath) => {
      const key = this.extractKey(streamPath);
      if (!key) return;
      this.logger.info({ streamPath, ingestKey: key }, 'RTMP stream ended');
      callback(key);
    });
  }

  start(): void {
    this.nms.run();
    this.logger.info({ port: this.port }, 'RTMP ingest server started');
  }

  stop(): void {
    this.nms.stop();
  }

  // Parses '/live/some-ingest-key' → 'some-ingest-key'
  private extractKey(streamPath: string): string | null {
    const parts = streamPath.split('/');
    const key = parts[parts.length - 1];
    return key && key.length > 0 ? key : null;
  }
}
