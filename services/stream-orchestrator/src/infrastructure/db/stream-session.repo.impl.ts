import { eq, inArray } from 'drizzle-orm';
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

    return Promise.all(
      rows.map(async (row) => {
        const destRows = await this.db
          .select()
          .from(streamDestinations)
          .where(eq(streamDestinations.sessionId, row.sessionId));
        return this.mapToDomain(row, destRows);
      }),
    );
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
        set: {
          status: streamDestinations.status,
          errorMessage: streamDestinations.errorMessage,
          rtmpUrl: streamDestinations.rtmpUrl,
          streamKey: streamDestinations.streamKey,
          platformStreamId: streamDestinations.platformStreamId,
          streamKeyExpiresAt: streamDestinations.streamKeyExpiresAt,
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
