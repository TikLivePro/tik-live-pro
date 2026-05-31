import type { Metadata } from 'next';
import { WatchView, WatchNotFound } from '@/features/stream/components/WatchView';
import type { PublicSession } from '@/features/stream/components/WatchView';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionId } = await params;
  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/public`, { next: { revalidate: 10 } });
    if (res.ok) {
      const { data } = (await res.json()) as { data: PublicSession };
      const isLive = data.status === 'live';
      return {
        title: `${data.title}${isLive ? ' — LIVE' : ''} · TikLivePro`,
        description: isLive
          ? `Watch ${data.title} live on TikLivePro`
          : `${data.title} on TikLivePro`,
      };
    }
  } catch {
    // fallback to default below
  }
  return { title: 'Watch · TikLivePro' };
}

export default async function WatchPage({ params }: Props): Promise<React.ReactElement> {
  const { sessionId } = await params;

  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/public`, {
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const { data } = (await res.json()) as { data: PublicSession };
      return <WatchView initialSession={data} apiBase={API_BASE} />;
    }
  } catch {
    // fall through to not-found state
  }

  return <WatchNotFound />;
}
