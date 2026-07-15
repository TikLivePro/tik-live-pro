import type { Metadata } from 'next';
import { DataDeletionView } from '@/features/legal';

export const metadata: Metadata = {
  title: 'Data Deletion — TikLivePro',
  description: 'Request deletion of your TikLivePro data.',
};

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function DataDeletionPage({ searchParams }: Props) {
  const { code } = await searchParams;

  return <DataDeletionView facebookCode={code} />;
}
