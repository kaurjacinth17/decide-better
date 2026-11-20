'use client';
import Link from 'next/link';
import { useState } from 'react';
import { shareUrl } from '@/lib/share';
import { actions, useApp, useCurrent } from '@/store/appStore';

/** Share, versions, compare and memo — the features added on top of the prototype. */
export function Toolbar() {
  const d = useCurrent();
  const versions = useApp((s) => s.snapshots.length);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState<string | null>(null);

  const share = async () => {
    const url = shareUrl(window.location.origin, d);
    try {
      await navigator.clipboard.writeText(url);
      setLink(null);
      setMsg('Read-only link copied. Anyone with it can view this decision; the data lives in the link itself.');
    } catch {
      setLink(url);
      setMsg('Copying was blocked. Select the link below and copy it.');
    }
  };
  const saveVersion = async () => {
    const label = `Version ${versions + 1} · ${new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    await actions().saveSnapshot(label);
    setLink(null);
    setMsg(`Saved “${label}”. Use Compare versions to put it side by side with later changes.`);
  };

  return (
    <div className="no-print mt-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Share and review">
        <button type="button" className="btn ghost" onClick={share}>
          Share read-only link
        </button>
        <button type="button" className="btn ghost" onClick={saveVersion}>
          Save version
        </button>
        <Link className="btn ghost" href="/compare">
          Compare versions
        </Link>
        <Link className="btn ghost" href="/memo">
          Decision memo
        </Link>
      </div>
      <p className="small mt-2" role="status">
        {msg}
      </p>
      {link && (
        <>
          <label htmlFor="sharelink" className="sr-only-x">
            Share link
          </label>
          <input id="sharelink" className="fld mt-2 w-full" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  );
}
