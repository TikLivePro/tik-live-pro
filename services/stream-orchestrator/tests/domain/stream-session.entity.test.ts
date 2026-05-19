import { StreamSession, StreamSessionStatus } from '../../src/domain/entities/stream-session.entity.js';
import { SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import type { StreamTargetInfo } from '../../src/domain/value-objects/stream-target-info.js';

const sessionId = 'sess-001' as LiveSessionId;
const userId = 'user-001' as UserId;
const accountId1 = 'acc-001' as SocialAccountId;
const accountId2 = 'acc-002' as SocialAccountId;

const target: StreamTargetInfo = {
  rtmpUrl: 'rtmp://live.tiktok.com',
  streamKey: 'key-1',
  platformStreamId: null,
  expiresAt: null,
};

function makeSession(): StreamSession {
  return StreamSession.create(sessionId, userId, 'My Stream', 'Description', [accountId1, accountId2]);
}

describe('StreamSession', () => {
  it('creates in IDLE status with pending account IDs', () => {
    const session = makeSession();
    expect(session.status).toBe(StreamSessionStatus.IDLE);
    expect(session.pendingAccountIds).toContain(accountId1);
    expect(session.pendingAccountIds).toContain(accountId2);
    expect(session.destinations).toHaveLength(0);
    expect(session.ingestKey).toBeNull();
  });

  it('transitions IDLE → STARTING → WAITING_FOR_STREAM', () => {
    const session = makeSession();
    session.beginStartup();
    expect(session.status).toBe(StreamSessionStatus.STARTING);

    session.readyForStream('ingest-key-xyz');
    expect(session.status).toBe(StreamSessionStatus.WAITING_FOR_STREAM);
    expect(session.ingestKey).toBe('ingest-key-xyz');
  });

  it('transitions WAITING_FOR_STREAM → LIVE', () => {
    const session = makeSession();
    session.beginStartup();
    session.readyForStream('key');
    session.addDestination(accountId1, SocialPlatform.TIKTOK);
    session.assignDestinationTarget(accountId1, target);
    session.markDestinationLive(accountId1);
    session.markLive();
    expect(session.status).toBe(StreamSessionStatus.LIVE);
    expect(session.startedAt).not.toBeNull();
  });

  it('transitions LIVE → ENDING → ENDED', () => {
    const session = makeSession();
    session.beginStartup();
    session.readyForStream('key');
    session.addDestination(accountId1, SocialPlatform.TIKTOK);
    session.assignDestinationTarget(accountId1, target);
    session.markDestinationLive(accountId1);
    session.markLive();
    session.beginEnding();
    expect(session.status).toBe(StreamSessionStatus.ENDING);
    session.markEnded();
    expect(session.status).toBe(StreamSessionStatus.ENDED);
    expect(session.endedAt).not.toBeNull();
  });

  it('throws on invalid status transitions', () => {
    const session = makeSession();
    expect(() => session.readyForStream('key')).toThrow('Cannot become ready');
    expect(() => session.markLive()).toThrow('Cannot go LIVE');
  });

  it('adds destinations and detects live destinations', () => {
    const session = makeSession();
    session.beginStartup();
    session.addDestination(accountId1, SocialPlatform.TIKTOK);
    session.addDestination(accountId2, SocialPlatform.FACEBOOK);
    expect(session.destinations).toHaveLength(2);

    session.assignDestinationTarget(accountId1, target);
    session.markDestinationLive(accountId1);
    expect(session.hasAnyLiveDestination()).toBe(true);
  });

  it('markAllDestinationsEnded skips already ended/errored destinations', () => {
    const session = makeSession();
    session.beginStartup();
    session.addDestination(accountId1, SocialPlatform.TIKTOK);
    session.addDestination(accountId2, SocialPlatform.FACEBOOK);
    session.markDestinationError(accountId2, 'some error');
    session.markAllDestinationsEnded();

    const dest1 = session.getDestination(accountId1);
    const dest2 = session.getDestination(accountId2);
    expect(dest1?.status).toBe(DestinationStatus.ENDED);
    expect(dest2?.status).toBe(DestinationStatus.ERROR); // unchanged
  });

  it('allDestinationsSettled returns true when all are LIVE or ERROR', () => {
    const session = makeSession();
    session.beginStartup();
    session.addDestination(accountId1, SocialPlatform.TIKTOK);
    session.addDestination(accountId2, SocialPlatform.FACEBOOK);
    session.assignDestinationTarget(accountId1, target);
    session.markDestinationLive(accountId1);
    session.markDestinationError(accountId2, 'failed');
    expect(session.allDestinationsSettled()).toBe(true);
  });
});
