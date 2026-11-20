import type { Metadata } from 'next';
import { ComparePage } from '@/components/CompareView';

export const metadata: Metadata = { title: 'Compare versions · Decide Better' };

export default function Page() {
  return <ComparePage />;
}
