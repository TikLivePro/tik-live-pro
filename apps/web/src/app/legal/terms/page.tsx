import type { Metadata } from 'next';
import { TermsView } from '@/features/legal';

export const metadata: Metadata = {
  title: 'Terms of Service — TikLivePro',
  description: 'Read the TikLivePro Terms of Service.',
};

export default function TermsPage() {
  return <TermsView />;
}
