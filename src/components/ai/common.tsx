'use client';
import type { ReactNode } from 'react';
import { setAiEnabled, useAi } from '@/lib/ai/client';

/** The always-visible reminder on every AI surface. */
export function AiNote({ children }: { children?: ReactNode }) {
  return (
    <p className="ai-note mt-3" role="note">
      AI suggestions are proposals. Nothing changes until you accept it, and every accepted change can be undone. All scores and results are
      calculated by the app, not the AI.{children}
    </p>
  );
}

export function AiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ro mt-3" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn ghost mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Header switch. When the server has no key, explains that instead. */
export function AiToggle() {
  const { status, enabled } = useAi();
  if (status === 'unknown') return null;
  if (status === 'unavailable')
    return (
      <p className="small mt-0" data-testid="ai-status">
        AI suggestions aren&apos;t set up on this server. Everything else works as normal.
      </p>
    );
  return (
    <label className="chk text-[15px]" data-testid="ai-status">
      <input type="checkbox" checked={enabled} onChange={(e) => setAiEnabled(e.target.checked)} />
      AI suggestions
    </label>
  );
}

export const Spinner = ({ label }: { label: string }) => (
  <p className="small mt-3" role="status" aria-live="polite">
    {label}
  </p>
);
