import type { Metadata } from 'next';
import { ShareView } from '@/components/ShareView';

export const metadata: Metadata = { title: 'Shared decision · Decide Better', robots: { index: false } };

export default function Page() {
  return <ShareView />;
}
