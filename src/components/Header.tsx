'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATE_KEYS, nm } from '@/engine';
import { TEMPLATES } from '@/templates';
import { actions, useApp, useCurrent } from '@/store/appStore';
import { libraryOrder } from '@/store/decisionStore';
import { setTitle } from '@/store/ops';
import { LiveInput } from './LiveInput';
import { ThemeSelect } from './ThemeSelect';

export function Brand() {
  return (
    <p className="flex items-center gap-2.5 text-[17px] font-bold">
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" rx="1.5" fill="currentColor" />
        <rect x="12" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="1" y="12" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="12" y="12" width="9" height="9" rx="1.5" fill="var(--brick)" />
      </svg>
      Decide Better
    </p>
  );
}

function DeleteButton() {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`btn ghost ${armed ? 'warn' : ''}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        clearTimeout(timer.current);
        setArmed(false);
        actions().remove();
      }}
    >
      {armed ? 'Confirm delete' : 'Delete'}
    </button>
  );
}

function Library() {
  const decisions = useApp((s) => s.decisions);
  const items = useMemo(() => libraryOrder({ decisions }).map((d) => [d.id, d.title] as const), [decisions]);
  const currentId = useApp((s) => s.currentId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="libsel" className="sr-only-x">
        Saved decisions
      </label>
      <select id="libsel" className="sel" value={currentId} onChange={(e) => actions().select(e.target.value)}>
        {items.map(([id, title]) => (
          <option key={id} value={id}>
            {nm(title || 'Untitled decision', 40)}
          </option>
        ))}
      </select>
      <button type="button" className="btn ghost" onClick={() => actions().create('blank')}>
        New
      </button>
      <button type="button" className="btn ghost" onClick={() => actions().duplicate()}>
        Duplicate
      </button>
      <DeleteButton />
    </div>
  );
}

export function Header({ extra }: { extra?: React.ReactNode }) {
  const d = useCurrent();
  return (
    <header className="band pb-2">
      <div className="wrap">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            <Library />
            <ThemeSelect />
          </div>
        </div>
        <p className="mt-1 text-mut">Weigh what matters, score each option, and see what it would take to change your mind.</p>
        <label htmlFor="title" className="sr-only-x">
          Your decision
        </label>
        <LiveInput
          id="title"
          className="q"
          autoComplete="off"
          maxLength={90}
          value={d.title}
          onLive={(v) => actions().edit((x) => setTitle(x, v))}
          onCommit={() => actions().commit()}
        />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="New decision from a template">
          <span className="mr-1 text-[15px] text-mut">New from template</span>
          {TEMPLATE_KEYS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={d.templateKey === k} onClick={() => actions().create(k)}>
              {TEMPLATES[k].label}
            </button>
          ))}
        </div>
        {extra}
      </div>
    </header>
  );
}
