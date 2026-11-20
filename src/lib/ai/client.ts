'use client';
/** Browser side of the AI layer: status, the user's on/off switch, and a typed fetch with friendly errors. */
import { useSyncExternalStore } from 'react';
import type { AiErrorBody, AiErrorCode, AiFeature } from './schemas';

export type AiResult<T> = { ok: true; data: T } | { ok: false; code: AiErrorCode | 'offline'; message: string };

export async function aiRequest<T>(feature: AiFeature, body: unknown, signal?: AbortSignal): Promise<AiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return { ok: false, code: 'offline', message: 'You’re offline. AI suggestions need a connection; everything else still works.' };
  try {
    const res = await fetch(`/api/ai/${feature}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const json = (await res.json().catch(() => null)) as (T & Partial<AiErrorBody>) | null;
    if (!res.ok || !json || json.error) {
      return { ok: false, code: json?.error?.code ?? 'upstream', message: json?.error?.message ?? 'The AI request failed. Try again.' };
    }
    return { ok: true, data: json };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, code: 'timeout', message: 'Cancelled.' };
    return { ok: false, code: 'upstream', message: 'Could not reach the server. Check your connection and try again.' };
  }
}

/* --------------------------- availability state --------------------------- */

type Status = 'unknown' | 'available' | 'unavailable';
const PREF_KEY = 'decide-better-ai';
let status: Status = 'unknown';
let enabled = true;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    enabled = localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    /* storage blocked: default on */
  }
  fetch('/api/ai/status')
    .then((r) => r.json() as Promise<{ available: boolean }>)
    .then((j) => {
      status = j.available ? 'available' : 'unavailable';
      emit();
    })
    .catch(() => {
      status = 'unavailable';
      emit();
    });
}

export function setAiEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  emit();
}

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
};

/** `active` = the server has a key AND the user hasn't switched AI off. */
export function useAi(): { status: Status; enabled: boolean; active: boolean } {
  const s = useSyncExternalStore(
    subscribe,
    () => status,
    () => 'unknown' as Status,
  );
  const e = useSyncExternalStore(
    subscribe,
    () => enabled,
    () => true,
  );
  return { status: s, enabled: e, active: s === 'available' && e };
}
