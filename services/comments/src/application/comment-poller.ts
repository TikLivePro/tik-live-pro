import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { CommentReceivedPayload } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';
import type { SocialPlatform, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

interface PollTarget {
  sessionId: LiveSessionId;
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  accessToken: string;
  cursor: string | null;
  intervalMs: number;
}

export class CommentPoller {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly adapterRegistry: AdapterRegistry,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  start(target: PollTarget): void {
    const key = `${target.sessionId}:${target.socialAccountId}`;
    if (this.timers.has(key)) return;

    let cursor = target.cursor;

    const timer = setInterval(() => {
      void this.poll(target, cursor).then((nextCursor) => {
        cursor = nextCursor;
      });
    }, target.intervalMs);

    this.timers.set(key, timer);
    this.logger.info({ sessionId: target.sessionId, platform: target.platform }, 'Comment polling started');
  }

  stop(sessionId: LiveSessionId, socialAccountId: SocialAccountId): void {
    const key = `${sessionId}:${socialAccountId}`;
    const timer = this.timers.get(key);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(key);
    }
  }

  stopAll(sessionId: LiveSessionId): void {
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(sessionId)) {
        clearInterval(timer);
        this.timers.delete(key);
      }
    }
  }

  private async poll(target: PollTarget, cursor: string | null): Promise<string | null> {
    try {
      const adapter = this.adapterRegistry.get(target.platform);
      const page = await adapter.pollComments(
        target.accessToken,
        target.sessionId,
        target.socialAccountId,
        cursor,
      );

      for (const comment of page.comments) {
        const payload: CommentReceivedPayload = comment;
        await this.nats.publish(Subjects.COMMENT_RECEIVED, payload);
      }

      return page.nextCursor;
    } catch (err) {
      this.logger.error(
        { err, sessionId: target.sessionId, platform: target.platform },
        'Comment poll failed',
      );
      return cursor;
    }
  }
}
