import { Destination } from '../../src/domain/entities/destination.entity.js';
import { SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';
import type { SocialAccountId } from '@tik-live-pro/shared-types';
import type { StreamTargetInfo } from '../../src/domain/value-objects/stream-target-info.js';

const accountId = 'acc-123' as SocialAccountId;

const sampleTarget: StreamTargetInfo = {
  rtmpUrl: 'rtmp://live.tiktok.com/stream',
  streamKey: 'sk-abc',
  platformStreamId: 'ps-123',
  expiresAt: null,
};

describe('Destination', () => {
  it('creates in PENDING status', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    expect(dest.status).toBe(DestinationStatus.PENDING);
    expect(dest.streamTarget).toBeNull();
    expect(dest.rtmpDestination).toBeNull();
  });

  it('transitions to CONNECTING after assigning stream target', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    dest.assignStreamTarget(sampleTarget);
    expect(dest.status).toBe(DestinationStatus.CONNECTING);
    expect(dest.rtmpDestination).toBe('rtmp://live.tiktok.com/stream/sk-abc');
  });

  it('transitions to LIVE from CONNECTING', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    dest.assignStreamTarget(sampleTarget);
    dest.markLive();
    expect(dest.status).toBe(DestinationStatus.LIVE);
    expect(dest.errorMessage).toBeNull();
  });

  it('throws when marking LIVE from wrong status', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    expect(() => dest.markLive()).toThrow('Cannot mark LIVE');
  });

  it('transitions to ERROR from any status', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    dest.markError('Connection refused');
    expect(dest.status).toBe(DestinationStatus.ERROR);
    expect(dest.errorMessage).toBe('Connection refused');
  });

  it('transitions to ENDED', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    dest.assignStreamTarget(sampleTarget);
    dest.markLive();
    dest.markEnded();
    expect(dest.status).toBe(DestinationStatus.ENDED);
  });

  it('exposes platformStreamId from stream target', () => {
    const dest = Destination.create(accountId, SocialPlatform.FACEBOOK);
    dest.assignStreamTarget(sampleTarget);
    expect(dest.platformStreamId).toBe('ps-123');
  });

  it('clears errorMessage on markLive', () => {
    const dest = Destination.create(accountId, SocialPlatform.TIKTOK);
    dest.markError('temp error');
    dest.assignStreamTarget(sampleTarget); // resets to CONNECTING
    dest.markLive();
    expect(dest.errorMessage).toBeNull();
  });
});
