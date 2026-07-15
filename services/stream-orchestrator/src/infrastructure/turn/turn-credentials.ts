import { createHmac } from 'node:crypto';

export interface TurnCredential {
  username: string;
  credential: string;
}

// Coturn's "use-auth-secret" convention only validates the credential at TURN
// Allocate time — once a relay is established it keeps working past expiry —
// so a 1h TTL is safe even for multi-hour live sessions and never needs
// mid-stream renewal.
const TURN_CREDENTIAL_TTL_SECONDS = 3600;

// RFC 5766 / coturn ephemeral credential scheme: username is "<expiry-unix-ts>:<label>",
// credential is base64(HMAC-SHA1(secret, username)). The label has no meaning to coturn —
// it's only echoed back in logs — so a random UUID keeps the session's ingest key out of
// a credential that ends up in a public-facing RTCPeerConnection config.
export function generateTurnCredential(secret: string, label: string): TurnCredential {
  const expiry = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiry}:${label}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}
