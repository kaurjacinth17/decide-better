import { NextResponse } from 'next/server';
import { aiConfigured, aiModel } from '@/server/ai/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tells the UI whether AI suggestions are available. Never exposes the key. */
export function GET() {
  return NextResponse.json(
    { available: aiConfigured(), model: aiConfigured() ? aiModel() : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
