import { spawn } from 'node:child_process';
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
  url: string;
  title: string;
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

export function resolveWithYtDlp(platformUrl: string, logger: Logger): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
    // Prefer combined video+audio formats; fall back to best available.
    // Using separate video+audio would output two URLs which would require
    // two ffmpeg -i inputs — combined formats keep ffmpeg setup simple.
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '-f', 'best[vcodec!=none][acodec!=none][height<=1080]/best[vcodec!=none][acodec!=none]/best',
      '--get-title',
      '--get-url',
      '--',
      platformUrl,
    ];

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn('yt-dlp', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      reject(new YtDlpError('yt-dlp is not installed', 'NOT_INSTALLED'));
      return;
    }

    const lines: string[] = [];
    let stderr = '';

    proc.stdout!.on('data', (chunk: Buffer) => {
      lines.push(...chunk.toString().split('\n').filter((l) => l.trim().length > 0));
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new YtDlpError('yt-dlp timed out after 30 s', 'TIMEOUT'));
    }, TIMEOUT_MS);

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp is not installed', 'NOT_INSTALLED'));
      } else {
        reject(new YtDlpError(`yt-dlp process error: ${err.message}`, 'EXTRACT_FAILED'));
      }
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);

      if (exitCode !== 0) {
        logger.warn({ platformUrl, exitCode, stderr }, 'yt-dlp exited non-zero');
        if (/video unavailable|is not available|removed|private/i.test(stderr)) {
          reject(new YtDlpError('Video is unavailable or private', 'NOT_FOUND'));
        } else {
          reject(new YtDlpError(`yt-dlp failed (exit ${exitCode})`, 'EXTRACT_FAILED'));
        }
        return;
      }

      // --get-title outputs the title first, then --get-url outputs the URL.
      // For DASH streams the audio URL may appear on a second URL line — we want
      // the first URL line (video) in that edge case.
      if (lines.length < 2) {
        logger.warn({ platformUrl, lines }, 'yt-dlp produced unexpected output');
        reject(new YtDlpError('yt-dlp returned no usable URL', 'EXTRACT_FAILED'));
        return;
      }

      const title = lines[0]!;
      // Last line is the URL (or only URL when combined format)
      const url = lines[lines.length - 1]!;

      logger.info({ platformUrl, title }, 'yt-dlp resolved platform URL');
      resolve({ url, title });
    });
  });
}
