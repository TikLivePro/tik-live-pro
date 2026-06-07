import type { LiveSessionId, UserId, SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';
import { DestinationStatus } from '@tik-live-pro/shared-types';
import { DomainError } from '@tik-live-pro/domain';
import { Destination } from './destination.entity.js';
import type { StreamTargetInfo } from '../value-objects/stream-target-info.js';

export const StreamSessionStatus = {
  IDLE: 'idle',
  STARTING: 'starting',
  WAITING_FOR_STREAM: 'waiting_for_stream',
  LIVE: 'live',
  ENDING: 'ending',
  ENDED: 'ended',
  ERROR: 'error',
} as const;
export type StreamSessionStatus = (typeof StreamSessionStatus)[keyof typeof StreamSessionStatus];

export const RecordingStatus = {
  NONE: 'none',
  RECORDING: 'recording',
  PAUSED: 'paused',
  // User has explicitly stopped recording; files are ready for upload to storage.
  // The uploader only uploads files for sessions in this state.
  STOPPED: 'stopped',
} as const;
export type RecordingStatus = (typeof RecordingStatus)[keyof typeof RecordingStatus];

export class StreamSession {
  private constructor(
    private readonly _sessionId: LiveSessionId,
    private readonly _userId: UserId,
    private readonly _title: string,
    private readonly _description: string | null,
    private _status: StreamSessionStatus,
    private readonly _destinations: Destination[],
    private readonly _pendingAccountIds: SocialAccountId[],
    private _ingestKey: string | null,
    private readonly _createdAt: Date,
    private _startedAt: Date | null,
    private _endedAt: Date | null,
    private _recordingStatus: RecordingStatus,
  ) {}

  static create(
    sessionId: LiveSessionId,
    userId: UserId,
    title: string,
    description: string | null,
    pendingAccountIds: SocialAccountId[],
  ): StreamSession {
    return new StreamSession(
      sessionId,
      userId,
      title,
      description,
      StreamSessionStatus.IDLE,
      [],
      pendingAccountIds,
      null,
      new Date(),
      null,
      null,
      RecordingStatus.NONE,
    );
  }

  static reconstitute(props: {
    sessionId: LiveSessionId;
    userId: UserId;
    title: string;
    description: string | null;
    status: StreamSessionStatus;
    destinations: Destination[];
    pendingAccountIds: SocialAccountId[];
    ingestKey: string | null;
    createdAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    recordingStatus?: RecordingStatus;
  }): StreamSession {
    return new StreamSession(
      props.sessionId,
      props.userId,
      props.title,
      props.description,
      props.status,
      props.destinations,
      props.pendingAccountIds,
      props.ingestKey,
      props.createdAt,
      props.startedAt,
      props.endedAt,
      props.recordingStatus ?? RecordingStatus.NONE,
    );
  }

  beginStartup(): void {
    if (this._status !== StreamSessionStatus.IDLE) {
      throw new DomainError(`Cannot start from status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = StreamSessionStatus.STARTING;
  }

  readyForStream(ingestKey: string): void {
    if (this._status !== StreamSessionStatus.STARTING) {
      throw new DomainError(`Cannot become ready from '${this._status}'`, 'INVALID_STATUS');
    }
    this._ingestKey = ingestKey;
    this._status = StreamSessionStatus.WAITING_FOR_STREAM;
  }

  markLive(): void {
    if (this._status !== StreamSessionStatus.WAITING_FOR_STREAM) {
      throw new DomainError(`Cannot go LIVE from '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = StreamSessionStatus.LIVE;
    this._startedAt = new Date();
  }

  beginEnding(): void {
    if (
      this._status !== StreamSessionStatus.LIVE &&
      this._status !== StreamSessionStatus.WAITING_FOR_STREAM
    ) {
      throw new DomainError(`Cannot end from '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = StreamSessionStatus.ENDING;
  }

  markEnded(): void {
    this._status = StreamSessionStatus.ENDED;
    this._endedAt = new Date();
  }

  markError(): void {
    this._status = StreamSessionStatus.ERROR;
  }

  addDestination(socialAccountId: SocialAccountId, platform: SocialPlatform): Destination {
    const dest = Destination.create(socialAccountId, platform);
    this._destinations.push(dest);
    return dest;
  }

  assignDestinationTarget(socialAccountId: SocialAccountId, target: StreamTargetInfo): void {
    this.requireDestination(socialAccountId).assignStreamTarget(target);
  }

  markDestinationLive(socialAccountId: SocialAccountId): void {
    this.requireDestination(socialAccountId).markLive();
  }

  markDestinationError(socialAccountId: SocialAccountId, message: string): void {
    this.requireDestination(socialAccountId).markError(message);
  }

  markAllDestinationsEnded(): void {
    for (const dest of this._destinations) {
      if (dest.status !== DestinationStatus.ENDED && dest.status !== DestinationStatus.ERROR) {
        dest.markEnded();
      }
    }
  }

  getDestination(socialAccountId: SocialAccountId): Destination | undefined {
    return this._destinations.find((d) => d.socialAccountId === socialAccountId);
  }

  hasAnyLiveDestination(): boolean {
    return this._destinations.some((d) => d.status === DestinationStatus.LIVE);
  }

  allDestinationsSettled(): boolean {
    return (
      this._destinations.length > 0 &&
      this._destinations.every(
        (d) => d.status === DestinationStatus.LIVE || d.status === DestinationStatus.ERROR,
      )
    );
  }

  startRecording(): void {
    this._recordingStatus = RecordingStatus.RECORDING;
  }

  pauseRecording(): void {
    this._recordingStatus = RecordingStatus.PAUSED;
  }

  stopRecording(): void {
    this._recordingStatus = RecordingStatus.NONE;
  }

  // Marks the recording as ready for upload. Only transitions from RECORDING or PAUSED.
  // Sessions that were never started (NONE) are not affected — their files are not uploaded.
  finalizeRecording(): void {
    if (
      this._recordingStatus === RecordingStatus.RECORDING ||
      this._recordingStatus === RecordingStatus.PAUSED
    ) {
      this._recordingStatus = RecordingStatus.STOPPED;
    }
  }

  get sessionId(): LiveSessionId { return this._sessionId; }
  get userId(): UserId { return this._userId; }
  get title(): string { return this._title; }
  get description(): string | null { return this._description; }
  get status(): StreamSessionStatus { return this._status; }
  get destinations(): readonly Destination[] { return this._destinations; }
  get pendingAccountIds(): readonly SocialAccountId[] { return this._pendingAccountIds; }
  get ingestKey(): string | null { return this._ingestKey; }
  get createdAt(): Date { return this._createdAt; }
  get startedAt(): Date | null { return this._startedAt; }
  get endedAt(): Date | null { return this._endedAt; }
  get recordingStatus(): RecordingStatus { return this._recordingStatus; }

  private requireDestination(socialAccountId: SocialAccountId): Destination {
    const dest = this.getDestination(socialAccountId);
    if (!dest) {
      throw new DomainError(`Destination not found: ${socialAccountId}`, 'DESTINATION_NOT_FOUND');
    }
    return dest;
  }
}
