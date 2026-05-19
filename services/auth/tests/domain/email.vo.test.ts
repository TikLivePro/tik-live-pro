import { EmailVO } from '@tik-live-pro/domain';
import { ValidationError } from '@tik-live-pro/domain';

describe('EmailVO', () => {
  it('creates a valid email', () => {
    const email = EmailVO.create('Test@Example.COM');
    expect(email.toString()).toBe('test@example.com');
  });

  it('trims whitespace', () => {
    const email = EmailVO.create('  user@example.com  ');
    expect(email.toString()).toBe('user@example.com');
  });

  it('throws ValidationError for invalid email', () => {
    expect(() => EmailVO.create('not-an-email')).toThrow(ValidationError);
    expect(() => EmailVO.create('')).toThrow(ValidationError);
    expect(() => EmailVO.create('missing@')).toThrow(ValidationError);
  });

  it('throws for emails exceeding 254 chars', () => {
    const long = `${'a'.repeat(250)}@b.com`;
    expect(() => EmailVO.create(long)).toThrow(ValidationError);
  });

  it('compares equality correctly', () => {
    const a = EmailVO.create('a@b.com');
    const b = EmailVO.create('A@B.COM');
    expect(a.equals(b)).toBe(true);
  });
});
