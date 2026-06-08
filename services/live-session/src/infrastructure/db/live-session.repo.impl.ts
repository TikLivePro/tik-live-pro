import { eq, and, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { liveSessions } from './schema.js';
import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import { LiveSession } from '../../domain/entities/live-session.entity.js';
import type {
  LiveSessionId,
  LiveSessionStatus,
  UserId,
  SocialAccountId,
  SocialPlatform,
  DestinationStatus,
  PlatformStreamDestination,
} from '@tik-live-pro/shared-types';

type DbRow = typeof liveSessions.$inferSelect;

const INACTIVE_STATUSES: LiveSessionStatus[] = ['ending', 'ended', 'error'];

export class DrizzleLiveSessionRepository implements ILiveSessionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: LiveSessionId): Promise<LiveSession | null> {
    const [row] = await this.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, id))
      .limit(1);
    return row ? this.mapToDomain(row) : null;
  }

  async findActiveByUserId(userId: UserId): Promise<LiveSession | null> {
    const [row] = await this.db
      .select()
      .from(liveSessions)
      .where(
        and(
          eq(liveSessions.userId, userId),
          notInArray(liveSessions.status, INACTIVE_STATUSES),
        ),
      )
      .limit(1);
    return row ? this.mapToDomain(row) : null;
  }

  async findByUserId(userId: UserId): Promise<LiveSession[]> {
    const rows = await this.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.userId, userId));
    return rows.map((r) => this.mapToDomain(r));
  }

  async save(session: LiveSession): Promise<void> {
    await this.db.insert(liveSessions).values({
      id: session.id,
      userId: session.userId,
      title: session.title,
      description: session.description,
      status: session.status,
      destinations: session.destinations.map((d) => ({
        socialAccountId: d.socialAccountId,
        platform: d.platform,
        streamKey: d.streamKey,
        rtmpUrl: d.rtmpUrl,
        status: d.status,
      })),
      shouldRecord: session.shouldRecord,
      viewersVisible: session.viewersVisible,
      allowViewerVideoControl: session.allowViewerVideoControl,
      platformHlsUrl: session.platformHlsUrl,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      updatedAt: new Date(),
    });
  }

  async update(session: LiveSession): Promise<void> {
    await this.db
      .update(liveSessions)
      .set({
        status: session.status,
        destinations: session.destinations.map((d) => ({
          socialAccountId: d.socialAccountId,
          platform: d.platform,
          streamKey: d.streamKey,
          rtmpUrl: d.rtmpUrl,
          status: d.status,
        })),
        viewersVisible: session.viewersVisible,
        allowViewerVideoControl: session.allowViewerVideoControl,
        platformHlsUrl: session.platformHlsUrl,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        updatedAt: new Date(),
      })
      .where(eq(liveSessions.id, session.id));
  }

  private mapToDomain(row: DbRow): LiveSession {
    const storedDests = (row.destinations as Array<{
      socialAccountId: string;
      platform: string;
      streamKey: string;
      rtmpUrl: string;
      status: string;
    }>) ?? [];

    const destinations: PlatformStreamDestination[] = storedDests.map((d) => ({
      socialAccountId: d.socialAccountId as SocialAccountId,
      platform: d.platform as SocialPlatform,
      streamKey: d.streamKey,
      rtmpUrl: d.rtmpUrl,
      status: d.status as DestinationStatus,
    }));

    return LiveSession.reconstitute({
      id: row.id as LiveSessionId,
      userId: row.userId as UserId,
      title: row.title,
      description: row.description,
      status: row.status as LiveSessionStatus,
      destinations,
      shouldRecord: row.shouldRecord,
      viewersVisible: row.viewersVisible,
      allowViewerVideoControl: row.allowViewerVideoControl,
      platformHlsUrl: row.platformHlsUrl ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
    });
  }
}
