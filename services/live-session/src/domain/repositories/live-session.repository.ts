import type { LiveSession } from '../entities/live-session.entity.js';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';

export interface ILiveSessionRepository {
  findById(id: LiveSessionId): Promise<LiveSession | null>;
  findActiveByUserId(userId: UserId): Promise<LiveSession | null>;
  findByUserId(userId: UserId): Promise<LiveSession[]>;
  save(session: LiveSession): Promise<void>;
  update(session: LiveSession): Promise<void>;
}
