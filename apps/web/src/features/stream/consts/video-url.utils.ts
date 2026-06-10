export type UrlPlatform =
  | 'YouTube'
  | 'Twitch'
  | 'Vimeo'
  | 'Instagram'
  | 'Facebook'
  | 'TikTok'
  | 'Dailymotion';

const PLATFORM_PATTERNS: [UrlPlatform, RegExp][] = [
  ['YouTube',     /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i],
  ['Twitch',      /^https?:\/\/(www\.)?twitch\.tv\//i],
  ['Vimeo',       /^https?:\/\/(www\.)?vimeo\.com\//i],
  ['Instagram',   /^https?:\/\/(www\.)?instagram\.com\//i],
  ['Facebook',    /^https?:\/\/(www\.)?facebook\.com\//i],
  ['TikTok',      /^https?:\/\/(www\.)?tiktok\.com\//i],
  ['Dailymotion', /^https?:\/\/(www\.)?dailymotion\.com\//i],
];

// Private / loopback / link-local ranges that must never be fetched
const PRIVATE_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?(\/|$)/i,
  /^https?:\/\/127\./i,
  /^https?:\/\/0\./i,
  /^https?:\/\/10\./i,
  /^https?:\/\/192\.168\./i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i,
  /^https?:\/\/\[::1\]/i,
  /^https?:\/\/\[fc00:/i,
  /^https?:\/\/169\.254\./i,
];

export function detectVideoPlatform(url: string): UrlPlatform | null {
  for (const [platform, pattern] of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

export function isUnsafeVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    return PRIVATE_PATTERNS.some((p) => p.test(url));
  } catch {
    return false;
  }
}
