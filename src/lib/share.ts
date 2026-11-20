/**
 * Read-only share links: the decision is compressed with lz-string into the URL hash.
 * The hash never reaches the server, so a shared decision isn't uploaded anywhere.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Decision } from '@/engine/types';
import { DecisionSchema } from './schema';

export const SHARE_PARAM = 'd';

/** Drop fields the viewer doesn't need (timestamps) to keep links short. */
export function encodeDecision(d: Decision): string {
  const { createdAt: _c, updatedAt: _u, ...rest } = d;
  void _c;
  void _u;
  return compressToEncodedURIComponent(JSON.stringify(rest));
}

export function decodeDecision(encoded: string): { ok: true; decision: Decision } | { ok: false; error: string } {
  let json: string | null = null;
  try {
    json = decompressFromEncodedURIComponent(encoded);
  } catch {
    json = null;
  }
  if (!json) return { ok: false, error: 'This link is incomplete or damaged. Ask for it to be shared again.' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'This link is incomplete or damaged. Ask for it to be shared again.' };
  }
  const r = DecisionSchema.safeParse(raw);
  return r.success
    ? { ok: true, decision: r.data }
    : { ok: false, error: r.error.issues[0]?.message ?? 'This link does not contain a valid decision.' };
}

export const shareUrl = (origin: string, d: Decision) => `${origin}/view#${SHARE_PARAM}=${encodeDecision(d)}`;

/** Extract the encoded payload from a location hash like "#d=…". */
export function readHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return params.get(SHARE_PARAM);
}
