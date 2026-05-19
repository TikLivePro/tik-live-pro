import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  StringCodec,
} from 'nats';
import type { BaseEvent } from '@tik-live-pro/shared-types';
import { randomUUID } from 'node:crypto';

const sc = StringCodec();

export interface NatsClientOptions {
  servers: string[];
  name: string;
  maxReconnectAttempts?: number;
}

export class NatsJetStreamClient {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;

  async connect(options: NatsClientOptions): Promise<void> {
    this.nc = await connect({
      servers: options.servers,
      name: options.name,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    });
    this.js = this.nc.jetstream();
    this.jsm = await this.nc.jetstreamManager();
  }

  async publish<T>(
    subject: string,
    payload: T,
    meta: { correlationId?: string; traceId?: string } = {},
  ): Promise<void> {
    if (!this.js) throw new Error('NATS not connected');

    const event: BaseEvent<T> = {
      eventId: randomUUID(),
      version: 1,
      subject,
      occurredAt: new Date().toISOString(),
      correlationId: meta.correlationId ?? randomUUID(),
      traceId: meta.traceId ?? randomUUID(),
      payload,
    };

    await this.js.publish(subject, sc.encode(JSON.stringify(event)));
  }

  getJetStream(): JetStreamClient {
    if (!this.js) throw new Error('NATS not connected');
    return this.js;
  }

  getJetStreamManager(): JetStreamManager {
    if (!this.jsm) throw new Error('NATS not connected');
    return this.jsm;
  }

  async drain(): Promise<void> {
    await this.nc?.drain();
  }

  async close(): Promise<void> {
    await this.nc?.close();
  }

  isClosed(): boolean {
    return this.nc?.isClosed() ?? true;
  }
}
