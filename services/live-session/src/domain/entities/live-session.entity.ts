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
    private _shouldRecord: boolean,
    private _viewersVisible: boolean,
    private _allowViewerVideoControl: boolean,
    private _platformHlsUrl: string | null,
    private _startedAt: Date | null,
    private _endedAt: Date | null,
    private readonly _createdAt: Date,
  ) {}

  static create(userId: UserId, title: string, description: string | null, shouldRecord: boolean): LiveSession {
    return new LiveSession(
      randomUUID() as LiveSessionId,
      userId,
      title,
      description,
      LSS.CREATED,
      [],
      shouldRecord,
      false,
      false,
      null,
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
    shouldRecord: boolean;
    viewersVisible: boolean;
    allowViewerVideoControl: boolean;
    platformHlsUrl: string | null;
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
      props.shouldRecord,
      props.viewersVisible,
      props.allowViewerVideoControl,
      props.platformHlsUrl,
      props.startedAt,
      props.endedAt,
      props.createdAt,
    );
  }

  start(): void {
    if (this._status !== LSS.CREATED) {
      throw new DomainError(`Cannot start session in status '${this._status}'`, 'INVALID_STATUS');
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

  setViewersVisible(visible: boolean): void {
    this._viewersVisible = visible;
  }

  setAllowViewerVideoControl(allow: boolean): void {
    this._allowViewerVideoControl = allow;
  }

  setPlatformHlsUrl(url: string | null): void {
    this._platformHlsUrl = url;
  }

  /**
   * Returns true if the state changed (caller should persist + publish event).
   * Returns false if the session was already ending/ended (idempotent no-op).
   * Throws DomainError for statuses where ending makes no sense (error).
   */
  end(): boolean {
    if (this._status === LSS.ENDING || this._status === LSS.ENDED) {
      return false;
    }
    if (this._status === LSS.ERROR) {
      throw new DomainError(`Cannot end session in status '${this._status}'`, 'INVALID_STATUS');
    }
    // CREATED | STARTING | LIVE → ENDING
    this._status = LSS.ENDING;
    this._endedAt = new Date();
    return true;
  }

  pause(): void {
    if (this._status !== LSS.LIVE) {
      throw new DomainError(`Cannot pause session in status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = LSS.PAUSED;
  }

  resume(): void {
    if (this._status !== LSS.PAUSED) {
      throw new DomainError(`Cannot resume session in status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = LSS.LIVE;
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
  get shouldRecord(): boolean { return this._shouldRecord; }
  get viewersVisible(): boolean { return this._viewersVisible; }
  get allowViewerVideoControl(): boolean { return this._allowViewerVideoControl; }
  get platformHlsUrl(): string | null { return this._platformHlsUrl; }
  get startedAt(): Date | null { return this._startedAt; }
  get endedAt(): Date | null { return this._endedAt; }
  get createdAt(): Date { return this._createdAt; }
}
