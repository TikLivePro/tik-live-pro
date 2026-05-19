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
        ping: 30,
        ping_timeout: 60,
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
