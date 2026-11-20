'use client';
import { useState } from 'react';
import { toExport } from '@/lib/schema';
import { actions, useCurrent } from '@/store/appStore';

export function ExportImport() {
  const d = useCurrent();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const exportIt = async () => {
    const txt = JSON.stringify(toExport([d]));
    setText(txt);
    try {
      await navigator.clipboard.writeText(txt);
      setMsg('Copied. Paste it into Decide Better on another device.');
    } catch {
      setMsg('Copying was blocked. The text is in the box above; select it and copy it yourself.');
    }
  };
  const importIt = () => {
    const { imported, errors } = actions().importText(text);
    if (!imported.length) {
      setMsg(`That doesn't look like a Decide Better decision. ${errors[0] ?? ''} Paste the full text you copied.`);
      return;
    }
    setMsg(
      imported.length === 1
        ? `Imported “${imported[0]!.title}” as a new decision.`
        : `Imported ${imported.length} decisions.` + (errors.length ? ` ${errors.length} skipped.` : ''),
    );
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(toExport([d]), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(d.title || 'decision').replace(/[^\w]+/g, '-').toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <details className="panel no-print">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold">Export or import a decision</summary>
      <p className="note">
        Copy this decision as text to move it to another device, or paste one here to add it to your list. Exports from the earlier
        single-page version work too.
      </p>
      <label htmlFor="iobox" className="sr-only-x">
        Decision data
      </label>
      <textarea id="iobox" className="iobox" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={exportIt}>
          Copy this decision
        </button>
        <button type="button" className="btn" onClick={download}>
          Download as file
        </button>
        <button type="button" className="btn" disabled={!text.trim()} onClick={importIt}>
          Import pasted decision
        </button>
      </div>
      <p className="small" role="status">
        {msg}
      </p>
    </details>
  );
}
