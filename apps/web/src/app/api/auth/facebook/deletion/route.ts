import { createHmac, timingSafeEqual } from 'crypto';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function GET(): never {
  redirect('/data-deletion');
}

function base64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const appSecret = process.env['FACEBOOK_APP_SECRET'];
  if (!appSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const signedRequest = formData.get('signed_request');
  if (typeof signedRequest !== 'string') {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
  }

  const dotIndex = signedRequest.indexOf('.');
  if (dotIndex === -1) {
    return NextResponse.json({ error: 'Malformed signed_request' }, { status: 400 });
  }

  const encodedSig = signedRequest.slice(0, dotIndex);
  const encodedPayload = signedRequest.slice(dotIndex + 1);

  const expectedSig = createHmac('sha256', appSecret).update(encodedPayload).digest();
  const actualSig = base64urlDecode(encodedSig);

  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let payload: { user_id?: string; algorithm?: string };
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload).toString('utf8')) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (!payload.user_id) {
    return NextResponse.json({ error: 'Missing user_id in payload' }, { status: 400 });
  }

  const authServiceUrl = process.env['AUTH_SERVICE_INTERNAL_URL'] ?? 'http://localhost:3001';
  await fetch(`${authServiceUrl}/auth/oauth/deletion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'facebook', providerUserId: payload.user_id }),
  });

  const confirmationCode = crypto.randomUUID();
  const appUrl = process.env['NEXTAUTH_URL'] ?? 'https://tiklivepro.me';

  return NextResponse.json({
    url: `${appUrl}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
