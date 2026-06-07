import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Deletion — TikLivePro',
  description: 'Your data deletion request has been received.',
};

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function DataDeletionPage({ searchParams }: Props) {
  const { code } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-center text-white">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Data Deletion Request Received</h1>
        <p className="text-neutral-400">
          Your request to delete your Facebook-linked data from TikLivePro has been processed. Your
          Facebook account connection has been removed.
        </p>
        {code && (
          <p className="text-sm text-neutral-500">
            Confirmation code: <span className="font-mono text-neutral-300">{code}</span>
          </p>
        )}
        <p className="text-sm text-neutral-500">
          If you have questions, contact us at{' '}
          <a href="mailto:support@tiklivepro.me" className="underline hover:text-white">
            support@tiklivepro.me
          </a>
          .
        </p>
      </div>
    </main>
  );
}
