import type { Metadata } from 'next';
import { MemoPage } from '@/components/MemoView';

export const metadata: Metadata = { title: 'Decision memo · Decide Better' };

export default function Page() {
  return <MemoPage />;
}
