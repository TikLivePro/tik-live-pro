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
export function resolveWithYtDlp(
  platformUrl: string,
  logger: Logger,
  maxHeight?: number,
): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
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
      // Use the Node.js runtime already in the container instead of looking for deno.
      '--js-runtimes', 'nodejs',
      // iOS player client gives broader format availability even when cookies are present.
      // The "youtube:" prefix scopes this arg to YouTube only; other platforms ignore it.
      '--extractor-args', 'youtube:player_client=ios,web',
      '-f', formatSelector,
    ];

    // Datacenter IPs (e.g. DigitalOcean) are blocked by YouTube's bot detection.
    // Mounting a Netscape-format cookies file from a logged-in browser session
    // authenticates the request and bypasses the restriction.
    // Set YTDLP_COOKIES_FILE=/app/youtube-cookies.txt in the container env
    // and bind-mount the file to enable this.
    //
    // The source file may be mounted read-only. yt-dlp always tries to save
    // the cookiejar back to the path it was given, which would fail on a
    // read-only mount. We copy to a writable temp path instead.
    const cookiesFile = process.env['YTDLP_COOKIES_FILE'];
    let tmpCookiesPath: string | null = null;
    if (cookiesFile) {
      tmpCookiesPath = join(tmpdir(), `yt-cookies-${randomUUID()}.txt`);
      copyFileSync(cookiesFile, tmpCookiesPath);
      args.push('--cookies', tmpCookiesPath);
    }

    args.push('--', platformUrl);

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

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      if (tmpCookiesPath) { try { unlinkSync(tmpCookiesPath); } catch { /* ignore */ } }
      reject(new YtDlpError('yt-dlp timed out after 30 s', 'TIMEOUT'));
    }, TIMEOUT_MS);

    const cleanupTmpCookies = (): void => {
      if (tmpCookiesPath) { try { unlinkSync(tmpCookiesPath); } catch { /* ignore */ } }
    };

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
