/**
 * Shared plumbing for the AI route handlers: availability, same-origin check, body size,
 * per-session rate limit (cookie-identified, with a looser per-IP backstop), and mapping
 * every failure to a JSON error the UI can show as a friendly fallback.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AiError } from './errors';
import { aiConfigured, generate as realGenerate, type Generate } from './generate';
import { createRateLimiter, sessionLimiter, type RateLimiter } from './rateLimit';

const MAX_BODY_BYTES = 64 * 1024;
export const SESSION_COOKIE = 'db_ai_session';

const ipLimiter = createRateLimiter(Math.max(1, Number(process.env.AI_RATE_LIMIT) || 30) * 3, 60 * 60 * 1000);

export interface RouteDeps {
  generate: Generate;
  configured: () => boolean;
  limiter: RateLimiter;
  ipLimiter: RateLimiter;
}

const defaultDeps: RouteDeps = { generate: realGenerate, configured: aiConfigured, limiter: sessionLimiter, ipLimiter };

const newSessionId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

export function aiRoute(handler: (body: unknown, generate: Generate) => Promise<unknown>, deps: RouteDeps = defaultDeps) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    let sid = req.cookies.get(SESSION_COOKIE)?.value;
    const isNew = !sid || !/^[0-9a-f]{32}$/.test(sid);
    if (isNew) sid = newSessionId();
    const reply = (status: number, body: unknown, headers?: Record<string, string>) => {
      const res = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
      if (isNew)
        res.cookies.set(SESSION_COOKIE, sid!, {
          httpOnly: true,
          sameSite: 'strict',
          secure: req.nextUrl.protocol === 'https:',
          path: '/api/ai',
          maxAge: 60 * 60 * 24,
        });
      return res;
    };
    try {
      const origin = req.headers.get('origin');
      if (origin && origin !== req.nextUrl.origin) throw new AiError('bad_request', 'Cross-site requests are not allowed.');
      if (!deps.configured())
        throw new AiError('unavailable', 'AI suggestions are not set up on this server. Everything else works as normal.');
      const len = Number(req.headers.get('content-length') ?? 0);
      if (len > MAX_BODY_BYTES) throw new AiError('bad_request', 'That request is too large.');
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) throw new AiError('bad_request', 'That request is too large.');
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
      const wait = deps.limiter.hit(sid!) || deps.ipLimiter.hit(`ip:${ip}`);
      if (wait)
        throw new AiError(
          'rate_limited',
          `You've reached the limit for AI suggestions. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`,
          wait,
        );
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AiError('bad_request', 'The request was not valid JSON.');
      }
      return reply(200, await handler(body, deps.generate));
    } catch (e) {
      const err = AiError.fromSdk(e);
      if (!(e instanceof AiError)) console.error('[ai] unexpected error', e);
      return reply(err.status, err.toBody(), err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : undefined);
    }
  };
}
