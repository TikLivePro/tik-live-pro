import { StringCodec, consumerOpts, createInbox } from 'nats';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionCreatedPayload, SessionStatusChangedPayload } from '@tik-live-pro/events';
import type { BaseEvent, SocialAccountId, LiveSessionId, UserId } from '@tik-live-pro/shared-types';
import type { RegisterSessionUseCase } from '../../application/use-cases/register-session.use-case.js';
import type { StartBroadcastUseCase } from '../../application/use-cases/start-broadcast.use-case.js';
import type { StopBroadcastUseCase } from '../../application/use-cases/stop-broadcast.use-case.js';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import { RecordingStatus } from '../../domain/entities/stream-session.entity.js';
import type { Logger } from '@tik-live-pro/logger';
import { DomainError, NotFoundError } from '@tik-live-pro/domain';

const sc = StringCodec();

export class SessionEventConsumer {
  constructor(
    private readonly nats: NatsJetStreamClient,
    private readonly registerSession: RegisterSessionUseCase,
    private readonly startBroadcast: StartBroadcastUseCase,
    private readonly stopBroadcast: StopBroadcastUseCase,
    private readonly logger: Logger,
    private readonly sessionRepo: IStreamSessionRepository,
    private readonly mediaMtxApiUrl: string,
    private readonly mediaMtxApiAuthHeader: string | undefined,
  ) {}

  start(): void {
    void this.consumeSessionCreated();
    void this.consumeSessionStarting();
    void this.consumeSessionEnded();
    void this.consumeSessionPaused();
    void this.consumeSessionResumed();
  }

  private async consumeSessionCreated(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-created');
    opts.ackExplicit();
    opts.deliverNew();
    opts.deliverTo(createInbox());

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
    opts.deliverTo(createInbox());

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
          // NotFoundError means SESSION_CREATED hasn't been processed yet (race condition).
          // NAK so NATS redelivers and retries once the session is registered.
          // Other DomainErrors (e.g. INVALID_STATUS from beginStartup) mean this event was
          // already handled — ACK to prevent an infinite retry loop.
          if (err instanceof DomainError && !(err instanceof NotFoundError)) {
            msg.ack();
          } else {
            msg.nak();
          }
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
    opts.deliverTo(createInbox());

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
          if (err instanceof DomainError && !(err instanceof NotFoundError)) {
            msg.ack();
          } else {
            msg.nak();
          }
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_ENDED');
    }
  }

  private async consumeSessionPaused(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-paused');
    opts.ackExplicit();
    opts.deliverNew();
    opts.deliverTo(createInbox());

    try {
      const sub = await js.subscribe(Subjects.SESSION_PAUSED, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          const session = await this.sessionRepo.findBySessionId(event.payload.sessionId as LiveSessionId);
          if (session?.recordingStatus === RecordingStatus.RECORDING && session.ingestKey) {
            await this.patchMediaMtxRecording(session.ingestKey, false);
            session.pauseRecording();
            await this.sessionRepo.update(session);
            this.logger.info({ sessionId: event.payload.sessionId }, 'Recording paused with session');
          }
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_PAUSED');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_PAUSED');
    }
  }

  private async consumeSessionResumed(): Promise<void> {
    const js = this.nats.getJetStream();
    const opts = consumerOpts();
    opts.durable('stream-orchestrator-session-resumed');
    opts.ackExplicit();
    opts.deliverNew();
    opts.deliverTo(createInbox());

    try {
      const sub = await js.subscribe(Subjects.SESSION_RESUMED, opts);
      for await (const msg of sub) {
        try {
          const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionStatusChangedPayload>;
          const session = await this.sessionRepo.findBySessionId(event.payload.sessionId as LiveSessionId);
          if (session?.recordingStatus === RecordingStatus.PAUSED && session.ingestKey) {
            await this.patchMediaMtxRecording(session.ingestKey, true);
            session.startRecording();
            await this.sessionRepo.update(session);
            this.logger.info({ sessionId: event.payload.sessionId }, 'Recording resumed with session');
          }
          msg.ack();
        } catch (err) {
          this.logger.error({ err }, 'Failed to handle SESSION_RESUMED');
          msg.nak();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to subscribe to SESSION_RESUMED');
    }
  }

  private async patchMediaMtxRecording(ingestKey: string, record: boolean): Promise<void> {
    const pathName = encodeURIComponent(`live/${ingestKey}`);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.mediaMtxApiAuthHeader) headers['Authorization'] = this.mediaMtxApiAuthHeader;
    let res = await fetch(`${this.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ record }),
    });
    if (res.status === 404 && record) {
      res = await fetch(`${this.mediaMtxApiUrl}/v3/config/paths/add/${pathName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ record }),
      });
    }
    if (!res.ok) {
      this.logger.warn({ ingestKey, record, status: res.status }, 'Failed to update MediaMTX recording state');
    }
  }
}
