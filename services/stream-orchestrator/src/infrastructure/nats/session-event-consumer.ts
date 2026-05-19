import { StringCodec, consumerOpts } from 'nats';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionCreatedPayload, SessionStatusChangedPayload } from '@tik-live-pro/events';
import type { BaseEvent, SocialAccountId, LiveSessionId, UserId } from '@tik-live-pro/shared-types';
import type { RegisterSessionUseCase } from '../../application/use-cases/register-session.use-case.js';
import type { StartBroadcastUseCase } from '../../application/use-cases/start-broadcast.use-case.js';
import type { StopBroadcastUseCase } from '../../application/use-cases/stop-broadcast.use-case.js';
import type { Logger } from '@tik-live-pro/logger';

const sc = StringCodec();

export class SessionEventConsumer {
  constructor(
    private readonly nats: NatsJetStreamClient,
    private readonly registerSession: RegisterSessionUseCase,
    private readonly startBroadcast: StartBroadcastUseCase,
    private readonly stopBroadcast: StopBroadcastUseCase,
    private readonly logger: Logger,
  ) {}

  start(): void {
    void this.consumeSessionCreated();
    void this.consumeSessionStarting();
    void this.consumeSessionEnded();
  }

  private async consumeSessionCreated(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-created');
    opts.ackExplicit();
    opts.deliverNew();

    try {
      const sub = await js.subscribe(Subjects.SESSION_CREATED, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionCreatedPayload>;
          await this.registerSession.execute({
            sessionId: event.payload.sessionId as LiveSessionId,
            userId: event.payload.userId as UserId,
            title: event.payload.title,
            description: event.payload.description,
            destinationAccountIds: event.payload.destinationAccountIds as SocialAccountId[],
          });
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_CREATED');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_CREATED');
    }
  }

  private async consumeSessionStarting(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-starting');
    opts.ackExplicit();
    opts.deliverNew();

    try {
      const sub = await js.subscribe(Subjects.SESSION_STARTING, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          await this.startBroadcast.execute({
            sessionId: event.payload.sessionId as LiveSessionId,
            correlationId: event.correlationId,
          });
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_STARTING');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_STARTING');
    }
  }

  private async consumeSessionEnded(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-ended');
    opts.ackExplicit();
    opts.deliverNew();

    try {
      const sub = await js.subscribe(Subjects.SESSION_ENDED, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          await this.stopBroadcast.execute({
            sessionId: event.payload.sessionId as LiveSessionId,
            correlationId: event.correlationId,
          });
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_ENDED');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_ENDED');
    }
  }
}
