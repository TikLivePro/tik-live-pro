import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { CommentReceivedPayload } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';
import type { SocialPlatform, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

const POLL_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;

interface PollTarget {
  sessionId: LiveSessionId;
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  accessToken: string;
  cursor: string | null;
  intervalMs: number;
}

interface PollState {
  cursor: string | null;
  consecutiveFailures: number;
  abortController: AbortController;
  stopped: boolean;
}

export class CommentPoller {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly states = new Map<string, PollState>();

  constructor(
    private readonly adapterRegistry: AdapterRegistry,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  start(target: PollTarget): void {
    const key = `${target.sessionId}:${target.socialAccountId}`;
    if (this.timers.has(key)) return;

    const state: PollState = {
      cursor: target.cursor,
      consecutiveFailures: 0,
      abortController: new AbortController(),
      stopped: false,
    };
    this.states.set(key, state);

    this.logger.info({ sessionId: target.sessionId, platform: target.platform }, 'Comment polling started');
    this.scheduleNext(key, target, state, target.intervalMs);
  }

  stop(sessionId: LiveSessionId, socialAccountId: SocialAccountId): void {
    const key = `${sessionId}:${socialAccountId}`;
    this.clearKey(key);
  }

  stopAll(sessionId: LiveSessionId): void {
    for (const key of Array.from(this.timers.keys())) {
      if (key.startsWith(`${sessionId}:`)) {
        this.clearKey(key);
      }
    }
  }

  private clearKey(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const state = this.states.get(key);
    if (state) {
      state.stopped = true;
      state.abortController.abort();
      this.states.delete(key);
    }
  }

  private scheduleNext(key: string, target: PollTarget, state: PollState, delayMs: number): void {
    if (state.stopped) return;
    const timer = setTimeout(() => {
      void this.runPoll(key, target, state);
    }, delayMs);
    this.timers.set(key, timer);
  }

  private async runPoll(key: string, target: PollTarget, state: PollState): Promise<void> {
    if (state.stopped) return;
    this.timers.delete(key);

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), POLL_TIMEOUT_MS);

    try {
      const adapter = this.adapterRegistry.get(target.platform);
      const page = await adapter.pollComments(
        target.accessToken,
        target.sessionId,
        target.socialAccountId,
        state.cursor,
      );

      clearTimeout(timeoutId);

      for (const comment of page.comments) {
        const payload: CommentReceivedPayload = comment;
        await this.nats.publish(Subjects.COMMENT_RECEIVED, payload);
      }

      state.cursor = page.nextCursor;
      state.consecutiveFailures = 0;
      this.scheduleNext(key, target, state, target.intervalMs);
    } catch (err) {
      clearTimeout(timeoutId);
      state.consecutiveFailures++;

      const backoffMs = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, state.consecutiveFailures - 1),
        MAX_BACKOFF_MS,
      );

      this.logger.error(
        { err, sessionId: target.sessionId, platform: target.platform, consecutiveFailures: state.consecutiveFailures, nextRetryMs: backoffMs },
        'Comment poll failed — backing off',
      );

      this.scheduleNext(key, target, state, backoffMs);
    }
  }
}
