import { ValidationError } from '../errors/domain.errors.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class PasswordVO {
  private constructor(private readonly hashed: string) {}

  static async fromPlainText(plain: string): Promise<PasswordVO> {
    if (plain.length < 8 || plain.length > 128) {
      throw new ValidationError('Password must be between 8 and 128 characters');
    }
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(salt + plain)
      .digest('hex');
    return new PasswordVO(`${salt}:${hash}`);
  }

  static fromHash(hashed: string): PasswordVO {
    return new PasswordVO(hashed);
  }

  async verify(plain: string): Promise<boolean> {
    const [salt, hash] = this.hashed.split(':');
    if (!salt || !hash) return false;
    const candidate = createHash('sha256')
      .update(salt + plain)
      .digest('hex');
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  }

  get value(): string {
    return this.hashed;
  }
}
