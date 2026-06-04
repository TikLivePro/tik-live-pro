import { eq, desc, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { recordings } from './schema.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

export interface RecordingRecord {
  id: string;
  sessionId: string;
  ingestKey: string;
  fileKey: string;
  publicUrl: string;
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface IRecordingRepository {
  save(record: Omit<RecordingRecord, 'id' | 'createdAt'>): Promise<RecordingRecord>;
  findBySessionId(sessionId: LiveSessionId): Promise<RecordingRecord[]>;
  findBySessionIds(ids: string[]): Promise<RecordingRecord[]>;
  findById(id: string): Promise<RecordingRecord | null>;
}

export class DrizzleRecordingRepository implements IRecordingRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(record: Omit<RecordingRecord, 'id' | 'createdAt'>): Promise<RecordingRecord> {
    const [row] = await this.db
      .insert(recordings)
      .values({
        sessionId: record.sessionId,
        ingestKey: record.ingestKey,
        fileKey: record.fileKey,
        publicUrl: record.publicUrl,
        fileName: record.fileName,
        sizeBytes: record.sizeBytes,
      })
      // On service restart, files that couldn't be deleted are re-uploaded.
      // The unique constraint on file_key prevents duplicate rows.
      .onConflictDoNothing({ target: recordings.fileKey })
      .returning();
    if (!row) {
      // Conflict — row already exists; fetch and return the existing one.
      const existing = await this.db
        .select()
        .from(recordings)
        .where(eq(recordings.fileKey, record.fileKey))
        .limit(1);
      if (!existing[0]) throw new Error('Insert conflict but row not found');
      return this.map(existing[0]);
    }
    return this.map(row);
  }

  async findBySessionId(sessionId: LiveSessionId): Promise<RecordingRecord[]> {
    const rows = await this.db
      .select()
      .from(recordings)
      .where(eq(recordings.sessionId, sessionId))
      .orderBy(desc(recordings.createdAt));
    return rows.map((r) => this.map(r));
  }

  async findBySessionIds(ids: string[]): Promise<RecordingRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(recordings)
      .where(inArray(recordings.sessionId, ids))
      .orderBy(desc(recordings.createdAt));
    return rows.map((r) => this.map(r));
  }

  async findById(id: string): Promise<RecordingRecord | null> {
    const [row] = await this.db
      .select()
      .from(recordings)
      .where(eq(recordings.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  private map(row: typeof recordings.$inferSelect): RecordingRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      ingestKey: row.ingestKey,
      fileKey: row.fileKey,
      publicUrl: row.publicUrl,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes ?? 0,
      createdAt: row.createdAt,
    };
  }
}
