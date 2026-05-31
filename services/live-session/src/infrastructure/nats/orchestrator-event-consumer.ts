import { StringCodec, consumerOpts, createInbox } from 'nats';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionStatusChangedPayload } from '@tik-live-pro/events';
import type { BaseEvent, LiveSessionId } from '@tik-live-pro/shared-types';
import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import type { Logger } from '@tik-live-pro/logger';

const sc = StringCodec();

export class OrchestratorEventConsumer {
  constructor(
    private readonly nats: NatsJetStreamClient,
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly logger: Logger,
  ) {}

  start(): void {
    void this.consumeSessionLive();
    void this.consumeSessionBroadcastStopped();
  }

  private async consumeSessionLive(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('live-session-session-live');
    opts.ackExplicit();
    opts.deliverNew();
    opts.deliverTo(createInbox());

    try {
      const sub = await js.subscribe(Subjects.SESSION_LIVE, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          const sessionId = event.payload.sessionId as LiveSessionId;

          const session = await this.sessionRepo.findById(sessionId);
          if (!session) {
            this.logger.warn({ sessionId }, 'SESSION_LIVE: session not found, ignoring');
            msg.ack();
            continue;
          }

          session.setPlatformHlsUrl(event.payload.hlsUrl ?? null);
          session.markLive();
          await this.sessionRepo.update(session);
          this.logger.info({ sessionId, hlsUrl: event.payload.hlsUrl }, 'SESSION_LIVE: session marked live');
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_LIVE');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_LIVE');
    }
  }

  private async consumeSessionBroadcastStopped(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('live-session-broadcast-stopped');
    opts.ackExplicit();
    opts.deliverNew();
    opts.deliverTo(createInbox());

    try {
      const sub = await js.subscribe(Subjects.SESSION_BROADCAST_STOPPED, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          const sessionId = event.payload.sessionId as LiveSessionId;

          const session = await this.sessionRepo.findById(sessionId);
          if (!session) {
            this.logger.warn({ sessionId }, 'SESSION_BROADCAST_STOPPED: session not found, ignoring');
            msg.ack();
            continue;
          }

          session.markEnded();
          await this.sessionRepo.update(session);
          this.logger.info({ sessionId }, 'SESSION_BROADCAST_STOPPED: session marked ended');
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_BROADCAST_STOPPED');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_BROADCAST_STOPPED');
    }
  }
}
