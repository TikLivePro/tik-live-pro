declare module 'node-media-server' {
  interface RtmpConfig {
    port: number;
    chunk_size?: number;
    gop_cache?: boolean;
    ping?: number;
    ping_timeout?: number;
  }

  interface NmsConfig {
    rtmp: RtmpConfig;
    logType?: number;
  }

  type NmsCallback = (id: string, streamPath: string, args: Record<string, string>) => void;

  class NodeMediaServer {
    constructor(config: NmsConfig);
    on(
      event:
        | 'preConnect'
        | 'postConnect'
        | 'doneConnect'
        | 'prePublish'
        | 'postPublish'
        | 'donePublish'
        | 'prePlay'
        | 'postPlay'
        | 'donePlay',
      callback: NmsCallback,
    ): void;
    run(): void;
    stop(): void;
  }

  export = NodeMediaServer;
}
