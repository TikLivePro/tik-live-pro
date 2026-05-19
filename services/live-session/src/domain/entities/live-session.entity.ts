import { randomUUID } from 'node:crypto';
import type { LiveSessionId, LiveSessionStatus, UserId } from '@tik-live-pro/shared-types';
import type { PlatformStreamDestination, SocialAccountId } from '@tik-live-pro/shared-types';
import { LiveSessionStatus as LSS } from '@tik-live-pro/shared-types';
import { DomainError } from '@tik-live-pro/domain';

export class LiveSession {
  private constructor(
    private readonly _id: LiveSessionId,
    private readonly _userId: UserId,
    private _title: string,
    private _description: string | null,
    private _status: LiveSessionStatus,
    private _destinations: PlatformStreamDestination[],
    private _startedAt: Date | null,
    private _endedAt: Date | null,
    private readonly _createdAt: Date,
  ) {}

  static create(userId: UserId, title: string, description: string | null): LiveSession {
    return new LiveSession(
      randomUUID() as LiveSessionId,
      userId,
      title,
      description,
      LSS.CREATED,
      [],
      null,
      null,
      new Date(),
    );
  }

  static reconstitute(props: {
    id: LiveSessionId;
    userId: UserId;
    title: string;
    description: string | null;
    status: LiveSessionStatus;
    destinations: PlatformStreamDestination[];
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
  }): LiveSession {
    return new LiveSession(
      props.id,
      props.userId,
      props.title,
      props.description,
      props.status,
      props.destinations,
      props.startedAt,
      props.endedAt,
      props.createdAt,
    );
  }

  start(): void {
    if (this._status !== LSS.CREATED) {
      throw new DomainError(`Cannot start session in status '${this._status}'`, 'INVALID_STATUS');
    }
    if (this._destinations.length === 0) {
      throw new DomainError('Cannot start session without destinations', 'NO_DESTINATIONS');
    }
    this._status = LSS.STARTING;
    this._startedAt = new Date();
  }

  markLive(): void {
    if (this._status !== LSS.STARTING) {
      throw new DomainError(`Cannot mark live from status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = LSS.LIVE;
  }

  end(): void {
    if (this._status !== LSS.LIVE && this._status !== LSS.STARTING) {
      throw new DomainError(`Cannot end session in status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = LSS.ENDING;
    this._endedAt = new Date();
  }

  markEnded(): void {
    this._status = LSS.ENDED;
  }

  markError(): void {
    this._status = LSS.ERROR;
  }

  addDestination(destination: PlatformStreamDestination): void {
    const exists = this._destinations.some((d) => d.socialAccountId === destination.socialAccountId);
    if (exists) {
      throw new DomainError('Destination already added', 'DUPLICATE_DESTINATION');
    }
    this._destinations.push(destination);
  }

  removeDestination(accountId: SocialAccountId): void {
    this._destinations = this._destinations.filter((d) => d.socialAccountId !== accountId);
  }

  get id(): LiveSessionId { return this._id; }
  get userId(): UserId { return this._userId; }
  get title(): string { return this._title; }
  get description(): string | null { return this._description; }
  get status(): LiveSessionStatus { return this._status; }
  get destinations(): PlatformStreamDestination[] { return [...this._destinations]; }
  get startedAt(): Date | null { return this._startedAt; }
  get endedAt(): Date | null { return this._endedAt; }
  get createdAt(): Date { return this._createdAt; }
}
