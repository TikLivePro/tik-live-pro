export { AVATAR_COLORS } from '@/lib/avatar.consts';

/** DOM id of the Stream Setup card — scroll target for the "Go Live" CTAs. */
export const GO_LIVE_FORM_ID = 'stream-setup';

export interface VideoQualityPreset {
  readonly id: string;
  readonly label: string;
  readonly subLabel: string;
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
}

export const VIDEO_QUALITY_PRESETS: readonly VideoQualityPreset[] = [
  { id: '480p',  label: '480p',  subLabel: 'SD · ~1 Mbps',     width: 854,  height: 480,  bitrate: 1_000_000 },
  { id: '720p',  label: '720p',  subLabel: 'HD · ~2.5 Mbps',   width: 1280, height: 720,  bitrate: 2_500_000 },
  { id: '1080p', label: '1080p', subLabel: 'Full HD · ~5 Mbps', width: 1920, height: 1080, bitrate: 5_000_000 },
];

export const DEFAULT_VIDEO_QUALITY_ID = '1080p';

/** Emoji fired by the streamer's quick-reaction button in the control room. */
export const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '💯', '🎉'] as const;

/** Quick reactions offered on hover of a live comment row. */
export const QUICK_COMMENT_REACTIONS = ['❤️', '🔥', '😂', '👏', '😮', '💯'] as const;

/** Matches comments whose content is only emoji (rendered as gradient reaction rows). */
export const EMOJI_ONLY_COMMENT_RE =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s){1,16}$/u;

/** Live stats strip — sparkline sampling window. */
export const STATS_SAMPLE_INTERVAL_MS = 5_000;
export const STATS_SPARKLINE_POINTS = 12;

export function getVideoQualityPreset(id: string): VideoQualityPreset {
  return VIDEO_QUALITY_PRESETS.find((p) => p.id === id) ?? VIDEO_QUALITY_PRESETS[2]!;
}
