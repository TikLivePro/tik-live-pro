export interface StreamTargetInfo {
  rtmpUrl: string;
  streamKey: string;
  platformStreamId: string | null;
  expiresAt: Date | null;
}
