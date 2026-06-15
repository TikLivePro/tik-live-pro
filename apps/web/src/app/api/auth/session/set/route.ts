import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'refresh_token';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { refreshToken?: string };
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return NextResponse.json({ error: 'refreshToken required' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, body.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_S,
  });
  return response;
}
