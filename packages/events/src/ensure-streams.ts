import type { JetStreamManager } from 'nats';
import { RetentionPolicy, StorageType, DiscardPolicy } from 'nats';

interface StreamDef {
  name: string;
  subjects: string[];
  retention: RetentionPolicy;
  maxMsgs: number;
  maxAge: number; // nanoseconds
  maxMsgSize: number;
}

const MS = 1_000_000; // ms → ns
const HOUR_NS = 3_600_000 * MS;

const STREAM_DEFS: StreamDef[] = [
  {
    name: 'AUTH',
    subjects: ['auth.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 1_000_000,
    maxAge: 168 * HOUR_NS,
    maxMsgSize: 65_536,
  },
  {
    name: 'USERS',
    subjects: ['user.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 500_000,
    maxAge: 720 * HOUR_NS,
    maxMsgSize: 131_072,
  },
  {
    name: 'SESSIONS',
    subjects: ['session.>', 'stream.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 10_000_000,
    maxAge: 2_160 * HOUR_NS,
    maxMsgSize: 131_072,
  },
  {
    name: 'BILLING',
    subjects: ['billing.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 500_000,
    maxAge: 8_760 * HOUR_NS,
    maxMsgSize: 65_536,
  },
  {
    name: 'INTEGRATIONS',
    subjects: ['integration.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 500_000,
    maxAge: 720 * HOUR_NS,
    maxMsgSize: 65_536,
  },
  {
    name: 'COMMENTS',
    subjects: ['comment.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 50_000_000,
    maxAge: 720 * HOUR_NS,
    maxMsgSize: 65_536,
  },
  {
    name: 'NOTIFICATIONS',
    subjects: ['notification.>'],
    retention: RetentionPolicy.Workqueue,
    maxMsgs: 1_000_000,
    maxAge: 24 * HOUR_NS,
    maxMsgSize: 65_536,
  },
  {
    name: 'ANALYTICS',
    subjects: ['analytics.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 100_000_000,
    maxAge: 2_160 * HOUR_NS,
    maxMsgSize: 32_768,
  },
  {
    name: 'DLQ',
    subjects: ['dlq.>'],
    retention: RetentionPolicy.Limits,
    maxMsgs: 1_000_000,
    maxAge: 336 * HOUR_NS,
    maxMsgSize: 131_072,
  },
];

/**
 * Idempotently ensures all JetStream streams exist.
 * Safe to call on every service startup — skips streams that already exist.
 * Uses replicas: 1 so it works on a single-node local NATS instance.
 * Production streams are managed via infra/nats/setup-streams.sh (replicas: 3).
 */
export async function ensureStreams(jsm: JetStreamManager): Promise<void> {
  for (const def of STREAM_DEFS) {
    try {
      await jsm.streams.info(def.name);
    } catch {
      await jsm.streams.add({
        name: def.name,
        subjects: def.subjects,
        retention: def.retention,
        storage: StorageType.File,
        max_msgs: def.maxMsgs,
        max_age: def.maxAge,
        max_msg_size: def.maxMsgSize,
        num_replicas: 1,
        discard: DiscardPolicy.Old,
        duplicate_window: 2 * 60 * 1_000 * MS,
      });
    }
  }
}
