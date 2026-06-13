import { spawn } from 'node:child_process';
import { copyFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tik-live-pro/logger';

const ALLOWED_HOSTNAMES = new Set([
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  'twitch.tv', 'www.twitch.tv', 'clips.twitch.tv',
  'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
  'dailymotion.com', 'www.dailymotion.com',
]);

const TIMEOUT_MS = 30_000;

export function isPlatformUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

export interface YtDlpResult {
  /** Direct video URL (CDN). For DASH this is the video-only stream. */
  url: string;
  /**
   * Audio-only CDN URL, present only when separate video+audio streams are
   * selected (DASH).  When undefined the video URL already contains audio.
   */
  audioUrl?: string;
  title: string;
  /**
   * All heights available as video streams (DASH or combined), sorted
   * descending.  Includes heights above what a combined format provides so
   * the quality picker can offer 1080p / 4K where available.
   */
  availableHeights: number[];
}

export class YtDlpError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_INSTALLED' | 'TIMEOUT' | 'EXTRACT_FAILED',
  ) {
    super(message);
    this.name = 'YtDlpError';
  }
}

interface RawFormat {
  height?: number;
  vcodec?: string;
  acodec?: string;
}

/** All unique heights that have a video stream (DASH or combined), sorted desc. */
function extractVideoHeights(formats: RawFormat[]): number[] {
  const seen = new Set<number>();
  for (const f of formats) {
    if (f.height && f.height > 0 && f.vcodec && f.vcodec !== 'none') {
      seen.add(f.height);
    }
  }
  return [...seen].sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// PO Token support (bgutil-ytdlp-pot-provider sidecar)
//
// YouTube blocks datacenter IPs even with session cookies. PO (Proof-of-Origin)
// tokens are a newer mechanism that doesn't get rotated the way browser cookies
// do.  The bgutil sidecar generates them on demand; we cache each token for
// 5 hours (YouTube rotates them every ~6 h).
// ---------------------------------------------------------------------------
interface PotCache { poToken: string; visitorData: string; expiresAt: number }
let _potCache: PotCache | null = null;
const POT_TTL_MS = 5 * 60 * 60 * 1000;

async function fetchPoToken(serverUrl: string): Promise<{ poToken: string; visitorData: string }> {
  if (_potCache && Date.now() < _potCache.expiresAt) {
    return _potCache;
  }
  const res = await fetch(`${serverUrl}/get-pot`);
  if (!res.ok) throw new Error(`bgutil POT server returned HTTP ${res.status}`);
  const body = await res.json() as { po_token: string; visitor_data: string };
  _potCache = { poToken: body.po_token, visitorData: body.visitor_data, expiresAt: Date.now() + POT_TTL_MS };
  return _potCache;
}

/**
 * Resolves a platform URL to the best available video (and optional separate
 * audio) CDN URL using yt-dlp.
 *
 * Format selection strategy (in priority order):
 *  1. Best H.264 MP4 video  +  best AAC M4A audio  (DASH — needs merge)
 *  2. Best video of any codec  +  best audio of any codec  (DASH — needs merge)
 *  3. Best combined (audio+video in one stream)   (no merge needed)
 *
 * When `maxHeight` is supplied the video is capped at that height so the
 * quality-picker re-resolution produces the correct rendition.
 */
export async function resolveWithYtDlp(
  platformUrl: string,
  logger: Logger,
  maxHeight?: number,
): Promise<YtDlpResult> {
  // Prefer H.264+AAC DASH streams for maximum quality without transcoding.
  // Fall back to any DASH, then to a combined progressive format.
  const h = maxHeight ? `[height<=${maxHeight}]` : '';
  const formatSelector = maxHeight
    ? `bestvideo${h}[ext=mp4]+bestaudio[ext=m4a]/bestvideo${h}+bestaudio/best${h}[vcodec!=none][acodec!=none]/best${h}`
    : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[vcodec!=none][acodec!=none]/best';

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--dump-json',
    // 'node' is the correct runtime name in yt-dlp ≥2024; older builds used 'nodejs'.
    '--js-runtimes', 'node',
    '-f', formatSelector,
  ];

  let tmpCookiesPath: string | null = null;
  const bgutilUrl = process.env['BGUTIL_POT_SERVER_URL'];

  if (bgutilUrl) {
    // PO token path: bypasses datacenter bot detection without session cookies.
    try {
      const { poToken, visitorData } = await fetchPoToken(bgutilUrl);
      // Include ios as fallback so yt-dlp can fall back to higher-quality DASH
      // formats when the web client only returns a low-quality combined stream.
      args.push('--extractor-args', `youtube:player_client=web,ios;visitor_data=${visitorData};po_token=web+${poToken}`);
    } catch (err) {
      logger.warn({ err }, 'bgutil PO token fetch failed — falling back to ios client');
      args.push('--extractor-args', 'youtube:player_client=ios,web');
    }
  } else {
    // No bgutil: iOS client gives broader format availability.
    args.push('--extractor-args', 'youtube:player_client=ios,web');

    // Cookie-based auth fallback.  Source file may be mounted :ro so we copy to
    // a writable temp path — yt-dlp always tries to save the cookiejar back.
    const cookiesFile = process.env['YTDLP_COOKIES_FILE'];
    if (cookiesFile) {
      tmpCookiesPath = join(tmpdir(), `yt-cookies-${randomUUID()}.txt`);
      copyFileSync(cookiesFile, tmpCookiesPath);
      args.push('--cookies', tmpCookiesPath);
    }
  }

  args.push('--', platformUrl);

  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn('yt-dlp', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      if (tmpCookiesPath) { try { unlinkSync(tmpCookiesPath); } catch { /* ignore */ } }
      reject(new YtDlpError('yt-dlp is not installed', 'NOT_INSTALLED'));
      return;
    }

    const chunks: string[] = [];
    let stderr = '';

    proc.stdout!.on('data', (chunk: Buffer) => { chunks.push(chunk.toString()); });
    proc.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const cleanupTmpCookies = (): void => {
      if (tmpCookiesPath) { try { unlinkSync(tmpCookiesPath); } catch { /* ignore */ } }
    };

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      cleanupTmpCookies();
      reject(new YtDlpError('yt-dlp timed out after 30 s', 'TIMEOUT'));
    }, TIMEOUT_MS);

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      cleanupTmpCookies();
      if (err.code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp is not installed', 'NOT_INSTALLED'));
      } else {
        reject(new YtDlpError(`yt-dlp process error: ${err.message}`, 'EXTRACT_FAILED'));
      }
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      cleanupTmpCookies();

      if (exitCode !== 0) {
        logger.warn({ platformUrl, exitCode, stderr }, 'yt-dlp exited non-zero');
        if (/video unavailable|is not available|removed|private/i.test(stderr)) {
          reject(new YtDlpError('Video is unavailable or private', 'NOT_FOUND'));
        } else {
          reject(new YtDlpError(`yt-dlp failed (exit ${exitCode})`, 'EXTRACT_FAILED'));
        }
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(chunks.join('')) as Record<string, unknown>;
      } catch {
        logger.warn({ platformUrl }, 'yt-dlp produced non-JSON output');
        reject(new YtDlpError('yt-dlp returned no usable URL', 'EXTRACT_FAILED'));
        return;
      }

      const title = String(data['title'] ?? '');

      // For DASH (bestvideo+bestaudio) yt-dlp sets `requested_formats` to the
      // two selected format objects; the root `url` may be absent.
      // For a combined progressive format the root `url` is set and
      // `requested_formats` contains a single entry.
      let videoUrl = '';
      let audioUrl: string | undefined;

      const reqFormats = data['requested_formats'];
      if (Array.isArray(reqFormats) && reqFormats.length >= 2) {
        // DASH: find video and audio by codec presence
        const fmts = reqFormats as Array<Record<string, unknown>>;
        const videoFmt = fmts.find(
          (f) => typeof f['vcodec'] === 'string' && f['vcodec'] !== 'none',
        );
        const audioFmt = fmts.find(
          (f) =>
            typeof f['acodec'] === 'string' &&
            f['acodec'] !== 'none' &&
            (typeof f['vcodec'] !== 'string' || f['vcodec'] === 'none'),
        );
        videoUrl = typeof videoFmt?.['url'] === 'string' ? videoFmt['url'] : '';
        audioUrl = typeof audioFmt?.['url'] === 'string' ? audioFmt['url'] : undefined;
      } else {
        // Combined format — root `url` or single requested_format entry
        if (typeof data['url'] === 'string' && data['url']) {
          videoUrl = data['url'];
        } else if (Array.isArray(reqFormats) && reqFormats.length === 1) {
          const f = reqFormats[0] as Record<string, unknown>;
          videoUrl = typeof f['url'] === 'string' ? f['url'] : '';
        }
      }

      if (!videoUrl) {
        logger.warn({ platformUrl }, 'yt-dlp JSON missing url field');
        reject(new YtDlpError('yt-dlp returned no usable URL', 'EXTRACT_FAILED'));
        return;
      }

      const formats = Array.isArray(data['formats'])
        ? (data['formats'] as RawFormat[])
        : [];
      const availableHeights = extractVideoHeights(formats);

      logger.info(
        { platformUrl, title, availableHeights, hasSeparateAudio: !!audioUrl },
        'yt-dlp resolved platform URL',
      );
      const result: YtDlpResult = { url: videoUrl, title, availableHeights };
      if (audioUrl) result.audioUrl = audioUrl;
      resolve(result);
    });
  });
}
