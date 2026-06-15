import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'refresh_token';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const API_BASE =
  process.env['BACKEND_INTERNAL_URL'] ??
  process.env['NEXT_PUBLIC_API_URL'] ??
  'http://localhost:3000';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let data: { accessToken: string; refreshToken: string };
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      const response = NextResponse.json({ error: 'session_expired' }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }
    const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    data = json.data;
  } catch {
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
  }

  const response = NextResponse.json({ accessToken: data.accessToken });
  response.cookies.set(COOKIE_NAME, data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_S,
  });
  return response;
}
