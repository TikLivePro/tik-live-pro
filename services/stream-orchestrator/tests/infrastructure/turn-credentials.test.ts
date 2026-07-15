import { createHmac } from 'node:crypto';
import { generateTurnCredential } from '../../src/infrastructure/turn/turn-credentials.js';

describe('generateTurnCredential', () => {
  it('produces a username in "<future-unix-ts>:<label>" form', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { username } = generateTurnCredential('secret', 'viewer-abc');

    const [expiry, label] = username.split(':');
    expect(label).toBe('viewer-abc');
    expect(Number(expiry)).toBeGreaterThan(nowSeconds);
    // +1s tolerance for a clock tick between the two Date.now() reads above.
    expect(Number(expiry)).toBeLessThanOrEqual(nowSeconds + 3601);
  });

  it('produces a credential that matches the coturn HMAC-SHA1 scheme', () => {
    const { username, credential } = generateTurnCredential('my-secret', 'label-1');
    const expected = createHmac('sha1', 'my-secret').update(username).digest('base64');
    expect(credential).toBe(expected);
  });

  it('produces different credentials for different secrets', () => {
    const a = generateTurnCredential('secret-a', 'same-label');
    const b = generateTurnCredential('secret-b', 'same-label');
    expect(a.credential).not.toBe(b.credential);
  });
});
