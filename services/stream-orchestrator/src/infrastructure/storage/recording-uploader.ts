import { createReadStream } from 'node:fs';
import { unlink, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Logger } from '@tik-live-pro/logger';
import type { IRecordingRepository } from '../db/recording.repo.impl.js';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';

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

/**
 * Polls a directory for completed MediaMTX recordings (.mp4) and uploads them
 * to S3-compatible object storage (DigitalOcean Spaces or Cloudflare R2).
 *
 * MediaMTX writes <timestamp>.mp4.part while the segment is live, then renames
 * to <timestamp>.mp4 when the segment is closed. Polling for .mp4 files
 * (never .mp4.part) ensures we only upload complete segments.
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

    for (const entry of entries) {
      if (!entry.endsWith('.mp4')) continue;
      const fullPath = join(this.recordingsDir, entry);
      if (this.uploading.has(fullPath) || this.uploaded.has(fullPath)) continue;
      this.uploading.add(fullPath);
      void this.uploadFile(fullPath, entry).catch((err: unknown) => {
        this.logger.error({ err, fullPath }, 'Recording upload failed — will retry next scan');
        this.uploading.delete(fullPath);
      });
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

    const key = `recordings/${relativePath}`;
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
    if (this.recordingRepo && this.sessionRepo) {
      try {
        // Derive ingestKey from path: recordings/live/{ingestKey}/file.mp4
        const pathParts = relativePath.split('/');
        const ingestKey = pathParts[1] ?? relativePath;
        const session = await this.sessionRepo.findByIngestKey(ingestKey);
        if (session) {
          await this.recordingRepo.save({
            sessionId: session.sessionId,
            ingestKey,
            fileKey: key,
            publicUrl,
            fileName: basename(relativePath),
            sizeBytes: fileSizeBytes,
          });
        }
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
