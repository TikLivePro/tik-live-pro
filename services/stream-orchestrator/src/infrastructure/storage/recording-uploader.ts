import { createReadStream } from 'node:fs';
import { unlink, readdir, rename, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Logger } from '@tik-live-pro/logger';
import type { IRecordingRepository } from '../db/recording.repo.impl.js';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import { RecordingStatus } from '../../domain/entities/stream-session.entity.js';

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnUrl: string | undefined;
  // MinIO requires path-style URLs (http://host:port/bucket/key).
  // R2 and DO Spaces use virtual-hosted-style (http://bucket.host/key).
  forcePathStyle?: boolean;
}

// A .mp4.part file whose mtime hasn't changed for this long is considered orphaned:
// either the publisher disconnected without a clean WHIP teardown (network drop, crash)
// or the PATCH record:false path-config call didn't finalize it (MediaMTX only applies
// path-config changes on the NEXT publisher connection, not the current one).
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Polls a directory for completed MediaMTX recordings (.mp4) and uploads them
 * to S3-compatible object storage (DigitalOcean Spaces or Cloudflare R2).
 *
 * MediaMTX writes <timestamp>.mp4.part while the segment is live, then renames
 * to <timestamp>.mp4 when the segment is closed (publisher disconnect or segment
 * duration reached). If the publisher never disconnects cleanly, the .mp4.part
 * file is orphaned. tryRescueOrphan() detects these files (mtime stale for
 * ORPHAN_THRESHOLD_MS) and renames them so the next scan picks them up.
 */
export class RecordingUploader {
  private readonly s3: S3Client;
  private readonly uploading = new Set<string>();
  // Tracks files that have been successfully uploaded (even if local unlink failed).
  // Prevents re-uploading files that can't be deleted (e.g. root-owned on Docker bind-mount).
  private readonly uploaded = new Set<string>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly recordingsDir: string,
    private readonly config: StorageConfig,
    private readonly logger: Logger,
    private readonly recordingRepo?: IRecordingRepository,
    private readonly sessionRepo?: IStreamSessionRepository,
  ) {
    this.s3 = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }

  start(): void {
    void this.scan();
    this.intervalHandle = setInterval(() => void this.scan(), 15_000);
    this.logger.info({ dir: this.recordingsDir }, 'RecordingUploader started');
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async scan(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.recordingsDir, { recursive: true });
    } catch {
      return;
    }

    const now = Date.now();
    for (const entry of entries) {
      const fullPath = join(this.recordingsDir, entry);

      if (entry.endsWith('.mp4.part')) {
        void this.tryRescueOrphan(fullPath, now);
        continue;
      }

      if (!entry.endsWith('.mp4')) continue;
      if (this.uploading.has(fullPath) || this.uploaded.has(fullPath)) continue;

      // Gate upload on explicit user intent.
      // MediaMTX records to disk from the first frame (path config has record:yes),
      // but we only upload when the user has explicitly stopped recording by
      // clicking "Stop Recording" or ending the live session. Files for sessions
      // that were never recorded (NONE) are deleted to reclaim disk space.
      if (this.sessionRepo) {
        // Path structure: live/{ingestKey}/{timestamp}.mp4
        const pathParts = entry.split('/');
        const ingestKey = pathParts[1];
        if (ingestKey) {
          let shouldUpload = false;
          try {
            const session = await this.sessionRepo.findByIngestKey(ingestKey);
            if (!session) {
              // No session found for this file — clean up
              await unlink(fullPath).catch(() => {});
              continue;
            }
            if (session.recordingStatus === RecordingStatus.NONE) {
              // User never started recording — delete the file (produced by MediaMTX
              // path config, not by user intent)
              await unlink(fullPath).catch((err: unknown) => {
                this.logger.warn({ err, fullPath }, 'Could not delete unused recording file');
              });
              continue;
            }
            if (session.recordingStatus !== RecordingStatus.STOPPED) {
              // Recording is still active or paused — not ready for upload yet
              continue;
            }
            shouldUpload = true;
          } catch (err) {
            this.logger.warn({ err, ingestKey }, 'Could not look up session for recording — skipping until next scan');
            continue;
          }
          if (!shouldUpload) continue;
        }
      }

      this.uploading.add(fullPath);
      void this.uploadFile(fullPath, entry).catch((err: unknown) => {
        this.logger.error({ err, fullPath }, 'Recording upload failed — will retry next scan');
        this.uploading.delete(fullPath);
      });
    }
  }

  // Renames a stale .mp4.part to .mp4 so the next scan uploads it.
  // Active segments are always being written, so their mtime will be recent;
  // only genuinely abandoned files pass the ORPHAN_THRESHOLD_MS guard.
  private async tryRescueOrphan(fullPath: string, now: number): Promise<void> {
    try {
      const { mtimeMs } = await stat(fullPath);
      if (now - mtimeMs < ORPHAN_THRESHOLD_MS) return;
    } catch {
      return;
    }
    const completePath = fullPath.slice(0, -'.part'.length);
    try {
      await rename(fullPath, completePath);
      this.logger.warn(
        { fullPath, completePath },
        'Rescued orphaned .mp4.part — publisher never sent a clean disconnect. Will upload on next scan.',
      );
    } catch (err) {
      this.logger.warn({ err, fullPath }, 'Could not rescue orphaned .mp4.part');
    }
  }

  private async uploadFile(localPath: string, relativePath: string): Promise<void> {
    let fileSizeBytes = 0;
    try {
      const s = await stat(localPath);
      fileSizeBytes = s.size;
    } catch {
      this.uploading.delete(localPath);
      return;
    }

    // Derive ingestKey from MediaMTX path: live/{ingestKey}/{timestamp}.mp4
    const pathParts = relativePath.split('/');
    const ingestKey = pathParts[1] ?? relativePath;
    const fileName = basename(relativePath);

    // Look up session title to embed in the S3 key for human-readable paths.
    // Falls back to the ingestKey if the session cannot be found.
    let titleSlug = ingestKey;
    let sessionId: string | undefined;
    if (this.sessionRepo) {
      try {
        const session = await this.sessionRepo.findByIngestKey(ingestKey);
        if (session) {
          titleSlug = slugify(session.title);
          sessionId = session.sessionId;
        }
      } catch (err) {
        this.logger.warn({ err, ingestKey }, 'Could not resolve session title for recording path — using ingestKey');
      }
    }

    const key = `recordings/${titleSlug}/${ingestKey}/${fileName}`;
    this.logger.info({ localPath, key, bucket: this.config.bucket }, 'Uploading recording');

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentType: 'video/mp4',
      },
      partSize: 8 * 1024 * 1024,
      queueSize: 2,
    });

    await upload.done();

    const publicUrl = this.config.cdnUrl
      ? `${this.config.cdnUrl}/${this.config.bucket}/${key}`
      : `${this.config.endpoint}/${this.config.bucket}/${key}`;

    // Persist the DB record before attempting unlink so the upload is never lost
    // even if the local file cannot be deleted (e.g. root-owned Docker bind-mount).
    if (this.recordingRepo && sessionId) {
      try {
        await this.recordingRepo.save({
          sessionId,
          ingestKey,
          fileKey: key,
          publicUrl,
          fileName,
          sizeBytes: fileSizeBytes,
        });
      } catch (err) {
        this.logger.warn({ err }, 'Failed to persist recording record — file still uploaded');
      }
    }

    // Mark as uploaded before unlink so re-scans skip this file even if deletion fails.
    this.uploaded.add(localPath);
    this.uploading.delete(localPath);

    this.logger.info({ key, publicUrl }, 'Recording uploaded — deleting local copy');
    try {
      await unlink(localPath);
    } catch (err: unknown) {
      // On Docker bind-mounts, segment files may be root-owned and undeletable by the
      // host process. The upload succeeded and the DB row is saved; log a warning and
      // move on. The uploaded Set prevents re-processing on subsequent scans.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        this.logger.warn({ localPath, code }, 'Cannot delete recording — file is owned by root (Docker bind-mount). Re-start MediaMTX to apply umask fix.');
      } else {
        this.logger.warn({ err, localPath }, 'Failed to delete local recording copy');
      }
    }
  }
}
