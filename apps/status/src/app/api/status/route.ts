import { NextResponse } from 'next/server';
import { fetchStatus } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const summary = await fetchStatus();
  return NextResponse.json(summary, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
