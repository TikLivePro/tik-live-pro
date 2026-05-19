import { ValidationError } from '../errors/domain.errors.js';
import type { Email } from '@tik-live-pro/shared-types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailVO {
  private constructor(private readonly value: Email) {}

  static create(raw: string): EmailVO {
    const trimmed = raw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed) || trimmed.length > 254) {
      throw new ValidationError(`Invalid email address: ${raw}`);
    }
    return new EmailVO(trimmed as Email);
  }

  toString(): string {
    return this.value;
  }

  equals(other: EmailVO): boolean {
    return this.value === other.value;
  }

  get branded(): Email {
    return this.value;
  }
}
