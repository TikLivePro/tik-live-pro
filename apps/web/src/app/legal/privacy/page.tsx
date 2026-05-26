import type { Metadata } from 'next';
import { PrivacyView } from '@/features/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — TikLivePro',
  description: 'Read the TikLivePro Privacy Policy.',
};

export default function PrivacyPage() {
  return <PrivacyView />;
}
