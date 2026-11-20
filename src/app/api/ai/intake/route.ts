import { handleIntake } from '@/server/ai/handlers';
import { aiRoute } from '@/server/ai/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = aiRoute(handleIntake);
