import { eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { streamSessions, streamDestinations } from './schema.js';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import { StreamSession, type StreamSessionStatus, type RecordingStatus } from '../../domain/entities/stream-session.entity.js';
import { Destination, type DestinationId } from '../../domain/entities/destination.entity.js';
import type { LiveSessionId, UserId, SocialAccountId, SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';

type DbSchema = typeof streamSessions.$inferSelect;
type DestDbSchema = typeof streamDestinations.$inferSelect;

export class DrizzleStreamSessionRepository implements IStreamSessionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findBySessionId(sessionId: LiveSessionId): Promise<StreamSession | null> {
    const [row] = await this.db
      .select()
      .from(streamSessions)
      .where(eq(streamSessions.sessionId, sessionId))
      .limit(1);

    if (!row) return null;

    const destRows = await this.db
      .select()
      .from(streamDestinations)
      .where(eq(streamDestinations.sessionId, sessionId));

    return this.mapToDomain(row, destRows);
  }

  async findByIngestKey(ingestKey: string): Promise<StreamSession | null> {
    const [row] = await this.db
      .select()
      .from(streamSessions)
      .where(eq(streamSessions.ingestKey, ingestKey))
      .limit(1);

    if (!row) return null;

    const destRows = await this.db
      .select()
      .from(streamDestinations)
      .where(eq(streamDestinations.sessionId, row.sessionId));

    return this.mapToDomain(row, destRows);
  }

  async findByStatuses(statuses: StreamSessionStatus[]): Promise<StreamSession[]> {
    const rows = await this.db
      .select()
      .from(streamSessions)
      .where(inArray(streamSessions.status, statuses));

    if (rows.length === 0) return [];

    // Single batched fetch instead of one destination query per session.
    const allDestRows = await this.db
      .select()
      .from(streamDestinations)
      .where(inArray(streamDestinations.sessionId, rows.map((r) => r.sessionId)));

    const destsBySession = new Map<string, DestDbSchema[]>();
    for (const dest of allDestRows) {
      const list = destsBySession.get(dest.sessionId);
      if (list) {
        list.push(dest);
      } else {
        destsBySession.set(dest.sessionId, [dest]);
      }
    }

    return rows.map((row) => this.mapToDomain(row, destsBySession.get(row.sessionId) ?? []));
  }

  async save(session: StreamSession): Promise<void> {
    await this.db.insert(streamSessions).values({
      sessionId: session.sessionId,
      userId: session.userId,
      title: session.title,
      description: session.description,
      status: session.status,
      pendingAccountIds: Array.from(session.pendingAccountIds),
      ingestKey: session.ingestKey,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      recordingStatus: session.recordingStatus,
    });
  }

  async update(session: StreamSession): Promise<void> {
    await this.db
      .update(streamSessions)
      .set({
        status: session.status,
        ingestKey: session.ingestKey,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        recordingStatus: session.recordingStatus,
      })
      .where(eq(streamSessions.sessionId, session.sessionId));

    const destinations = session.destinations;
    if (destinations.length === 0) return;

    await this.db
      .insert(streamDestinations)
      .values(
        destinations.map((d) => ({
          id: d.id,
          sessionId: session.sessionId,
          socialAccountId: d.socialAccountId,
          platform: d.platform,
          rtmpUrl: d.streamTarget?.rtmpUrl ?? null,
          streamKey: d.streamTarget?.streamKey ?? null,
          platformStreamId: d.streamTarget?.platformStreamId ?? null,
          streamKeyExpiresAt: d.streamTarget?.expiresAt ?? null,
          status: d.status,
          errorMessage: d.errorMessage,
        })),
      )
      .onConflictDoUpdate({
        target: streamDestinations.id,
        // Must reference `excluded.*` (the incoming row). Referencing the table's
        // own columns here renders as SET "status" = "stream_destinations"."status",
        // which Postgres resolves to the EXISTING row — a silent no-op that froze
        // destination statuses at their first-insert values.
        set: {
          status: sql`excluded."status"`,
          errorMessage: sql`excluded."error_message"`,
          rtmpUrl: sql`excluded."rtmp_url"`,
          streamKey: sql`excluded."stream_key"`,
          platformStreamId: sql`excluded."platform_stream_id"`,
          streamKeyExpiresAt: sql`excluded."stream_key_expires_at"`,
        },
      });
  }

  private mapToDomain(row: DbSchema, destRows: DestDbSchema[]): StreamSession {
    const destinations = destRows.map((d) =>
      Destination.reconstitute({
        id: d.id as DestinationId,
        socialAccountId: d.socialAccountId as SocialAccountId,
        platform: d.platform as SocialPlatform,
        streamTarget:
          d.rtmpUrl && d.streamKey
            ? {
                rtmpUrl: d.rtmpUrl,
                streamKey: d.streamKey,
                platformStreamId: d.platformStreamId,
                expiresAt: d.streamKeyExpiresAt,
              }
            : null,
        status: d.status as DestinationStatus,
        errorMessage: d.errorMessage,
      }),
    );

    const accountIds = (row.pendingAccountIds as string[]).map((id) => id as SocialAccountId);

    return StreamSession.reconstitute({
      sessionId: row.sessionId as LiveSessionId,
      userId: row.userId as UserId,
      title: row.title,
      description: row.description,
      status: row.status as StreamSessionStatus,
      destinations,
      pendingAccountIds: accountIds,
      ingestKey: row.ingestKey,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      recordingStatus: row.recordingStatus as RecordingStatus,
    });
  }
}
