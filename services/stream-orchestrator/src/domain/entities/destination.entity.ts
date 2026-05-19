import { randomUUID } from 'node:crypto';
import type { SocialAccountId, SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';
import { DestinationStatus as DS } from '@tik-live-pro/shared-types';
import { DomainError } from '@tik-live-pro/domain';
import type { StreamTargetInfo } from '../value-objects/stream-target-info.js';

export type DestinationId = string & { readonly _brand: 'DestinationId' };

export class Destination {
  private constructor(
    private readonly _id: DestinationId,
    private readonly _socialAccountId: SocialAccountId,
    private readonly _platform: SocialPlatform,
    private _streamTarget: StreamTargetInfo | null,
    private _status: DestinationStatus,
    private _errorMessage: string | null,
  ) {}

  static create(socialAccountId: SocialAccountId, platform: SocialPlatform): Destination {
    return new Destination(
      randomUUID() as DestinationId,
      socialAccountId,
      platform,
      null,
      DS.PENDING,
      null,
    );
  }

  static reconstitute(props: {
    id: DestinationId;
    socialAccountId: SocialAccountId;
    platform: SocialPlatform;
    streamTarget: StreamTargetInfo | null;
    status: DestinationStatus;
    errorMessage: string | null;
  }): Destination {
    return new Destination(
      props.id,
      props.socialAccountId,
      props.platform,
      props.streamTarget,
      props.status,
      props.errorMessage,
    );
  }

  assignStreamTarget(target: StreamTargetInfo): void {
    this._streamTarget = target;
    this._status = DS.CONNECTING;
  }

  markLive(): void {
    if (this._status !== DS.CONNECTING) {
      throw new DomainError(`Cannot mark LIVE from status '${this._status}'`, 'INVALID_STATUS');
    }
    this._status = DS.LIVE;
    this._errorMessage = null;
  }

  markError(message: string): void {
    this._status = DS.ERROR;
    this._errorMessage = message;
  }

  markEnded(): void {
    this._status = DS.ENDED;
  }

  get id(): DestinationId { return this._id; }
  get socialAccountId(): SocialAccountId { return this._socialAccountId; }
  get platform(): SocialPlatform { return this._platform; }
  get streamTarget(): StreamTargetInfo | null { return this._streamTarget; }
  get status(): DestinationStatus { return this._status; }
  get errorMessage(): string | null { return this._errorMessage; }

  get rtmpDestination(): string | null {
    if (!this._streamTarget) return null;
    return `${this._streamTarget.rtmpUrl}/${this._streamTarget.streamKey}`;
  }

  get platformStreamId(): string | null {
    return this._streamTarget?.platformStreamId ?? null;
  }
}
