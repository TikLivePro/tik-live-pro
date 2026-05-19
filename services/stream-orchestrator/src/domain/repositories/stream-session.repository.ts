import type { StreamSession } from '../entities/stream-session.entity.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

export interface IStreamSessionRepository {
  findBySessionId(sessionId: LiveSessionId): Promise<StreamSession | null>;
  findByIngestKey(ingestKey: string): Promise<StreamSession | null>;
  save(session: StreamSession): Promise<void>;
  update(session: StreamSession): Promise<void>;
}
