import { handleIntake } from '@/server/ai/handlers';
import { aiRoute } from '@/server/ai/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hosts such as Vercel stop functions after this many seconds; the route's own 55 s deadline fits inside it.
export const maxDuration = 60;

export const POST = aiRoute(handleIntake);
