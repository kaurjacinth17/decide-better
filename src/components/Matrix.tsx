'use client';
import { useState } from 'react';
import { clamp, derivedText, deriveScores, fmtValue, LIMITS, nm, type Criterion } from '@/engine';
import * as ops from '@/store/ops';
import { LiveInput, LiveTextarea } from './LiveInput';
import { optColor, useWorkspace } from './Workspace';

const tint = (v: number) => Math.round(((clamp(v, 1, 10) - 1) / 9) * 22);

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M3 6h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="6" r="2.4" fill="var(--panel)" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="13" cy="14" r="2.4" fill="var(--panel)" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Tags({ c }: { c: Criterion }) {
  const t: React.ReactNode[] = [];
  if (c.mode === 'value')
    t.push(
      <span key="v" className="tag">
        {c.unit || 'Actual values'} · {c.direction > 0 ? 'higher' : 'lower'} is better
      </span>,
    );
  else if (c.hint)
    t.push(
      <span key="h" className="tag">
        {c.hint}
      </span>,
    );
  if (c.dealBreaker !== null)
    t.push(
      <span key="d" className="tag bad">
        {c.mode === 'value'
          ? `Rule out ${c.direction > 0 ? 'below' : 'above'} ${fmtValue(c.dealBreaker, c.unit)}`
          : `Rule out below ${c.dealBreaker}`}
      </span>,
    );
  return t.length ? <span className="mt-1 flex flex-wrap gap-1">{t}</span> : null;
}

function Settings({ c, i }: { c: Criterion; i: number }) {
  const { change, edit, commit } = useWorkspace();
  const v = c.mode === 'value';
  const on = c.dealBreaker !== null;
  const dbLabel = v ? (c.direction > 0 ? 'Rule out any option below' : 'Rule out any option above') : 'Rule out any option scoring below';
  return (
    <div className="rx" id={`set-${c.id}`}>
      <div className="rf" role="group" aria-label={`How ${c.name} is scored`}>
        <span className="rl">Scored as</span>
        <span className="seg">
          <button type="button" aria-pressed={!v} onClick={() => change((d) => ops.setMode(d, i, 'score'))}>
            1–10 rating
          </button>
          <button type="button" aria-pressed={v} onClick={() => change((d) => ops.setMode(d, i, 'value'))}>
            Actual values
          </button>
        </span>
      </div>
      {v ? (
        <>
          <div className="rf" role="group" aria-label={`Better direction for ${c.name}`}>
            <span className="rl">Better when</span>
            <span className="seg">
              <button type="button" aria-pressed={c.direction > 0} onClick={() => change((d) => ops.setDirection(d, i, 1))}>
                Higher
              </button>
              <button type="button" aria-pressed={c.direction < 0} onClick={() => change((d) => ops.setDirection(d, i, -1))}>
                Lower
              </button>
            </span>
          </div>
          <label className="rf">
            <span className="rl">Unit</span>
            <LiveInput
              className="fld sm"
              value={c.unit}
              placeholder="₹, hours, km"
              maxLength={16}
              onLive={(x) => edit((d) => ops.setUnit(d, i, x))}
              onCommit={commit}
            />
          </label>
          <p className="rnote">
            Values become a 1–10 score in proportion to the best option: the best gets 10, one that is{' '}
            {c.direction > 0 ? 'half as high' : 'twice as costly'} gets 5.
          </p>
        </>
      ) : (
        <label className="rf">
          <span className="rl">Note</span>
          <LiveInput
            className="fld"
            value={c.hint}
            placeholder="e.g. 10 = lowest risk"
            maxLength={40}
            onLive={(x) => edit((d) => ops.setHint(d, i, x))}
            onCommit={commit}
          />
        </label>
      )}
      <div className="rf">
        <label className="chk">
          <input type="checkbox" checked={on} onChange={(e) => change((d) => ops.toggleDealBreaker(d, i, e.target.checked))} />
          Deal-breaker
        </label>
        {on && (
          <>
            <span className="rl" aria-hidden="true">
              {dbLabel}
            </span>
            <LiveInput
              className="fld sm"
              type="number"
              step="any"
              inputMode="decimal"
              aria-label={dbLabel}
              value={String(c.dealBreaker)}
              onLive={(x) => edit((d) => ops.setDealBreaker(d, i, x))}
              onCommit={commit}
            />
            {v && c.unit && <span className="rl">{c.unit}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ c, i, open, toggle }: { c: Criterion; i: number; open: boolean; toggle(): void }) {
  const { d, a, edit, commit, change, readOnly } = useWorkspace();
  const derived = deriveScores(c);
  const v = c.mode === 'value';
  return (
    <>
      <div className={`r${open ? ' open' : ''}`}>
        <div className="cn">
          <LiveInput
            className="cname"
            aria-label={`Criterion ${i + 1} name`}
            maxLength={LIMITS.nameMax}
            value={c.name}
            readOnly={readOnly}
            onLive={(x) => edit((dd) => ops.renameCriterion(dd, i, x))}
            onCommit={commit}
          />
          <Tags c={c} />
        </div>
        <div className="cw">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={c.weight}
            disabled={readOnly}
            aria-label={`Importance of ${c.name}`}
            aria-valuetext={`${Math.round(a.model.wn[i]! * 100)}% of total weight`}
            onChange={(e) => edit((dd) => ops.setWeight(dd, i, Number(e.target.value)))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <output className="wp">{Math.round(a.model.wn[i]! * 100)}%</output>
        </div>
        <div className="sc">
          {d.options.map((o, j) => (
            <label key={o.id} className="block">
              <span className="ol">{o.name}</span>
              <LiveInput
                className="sv"
                type="number"
                inputMode="decimal"
                {...(v ? { step: 'any', placeholder: 'value' } : { min: 1, max: 10, step: 0.5 })}
                aria-label={`${o.name} on ${c.name}`}
                readOnly={readOnly}
                style={{ ['--h' as string]: tint(derived[j]!) }}
                value={v ? (c.values[j] === null ? '' : String(c.values[j])) : String(c.scores[j])}
                onLive={(x) => edit((dd) => (v ? ops.setValue(dd, i, j, x) : ops.setScore(dd, i, j, x)))}
                onCommit={commit}
              />
              {v && <span className="dv">{derivedText(derived[j]!)}</span>}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-1">
          {!readOnly && (
            <>
              <button
                type="button"
                className={`x${open ? ' act' : ''}`}
                aria-expanded={open}
                aria-controls={`set-${c.id}`}
                aria-label={`Settings for ${c.name}`}
                onClick={toggle}
              >
                <SettingsIcon />
              </button>
              {d.criteria.length > 1 && (
                <button
                  type="button"
                  className="x"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => change((dd) => ops.removeCriterion(dd, i))}
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {open && !readOnly && <Settings c={c} i={i} />}
    </>
  );
}

export function GutSelect() {
  const { d, change, readOnly } = useWorkspace();
  return (
    <label className="flex items-center gap-2 whitespace-nowrap text-[15px] text-mut" htmlFor="gut">
      Your gut pick
      <select
        id="gut"
        className="sel"
        disabled={readOnly}
        value={d.gutOptionId ?? ''}
        onChange={(e) => change((x) => ops.setGut(x, e.target.value || null))}
      >
        <option value="">No lean yet</option>
        {d.options.map((o) => (
          <option key={o.id} value={o.id}>
            {nm(o.name, 28)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Matrix({ onOpenWeights, children }: { onOpenWeights?: () => void; children?: React.ReactNode }) {
  const { d, edit, commit, change, readOnly } = useWorkspace();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const n = d.options.length;
  const cols = `minmax(130px,1.2fr) minmax(130px,1fr) minmax(0,${(n * 0.75).toFixed(2)}fr) 96px`;
  const focusLast = (sel: string) =>
    requestAnimationFrame(() => {
      const els = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(sel);
      const el = els[els.length - 1];
      el?.focus();
      el?.select();
    });

  return (
    <section className="panel" aria-labelledby="mxh">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <h2 id="mxh">Score each option</h2>
        <GutSelect />
      </div>
      <p className="note">
        Rate each option 1–10, where 10 is best for you, or switch a criterion to actual values with its settings button. Importance sliders
        are rescaled so the weights always total 100%. Click any name to rename it.
      </p>
      <div style={{ ['--n' as string]: n, ['--cols' as string]: cols }}>
        <div className="r hd">
          <div className="hl">Criterion</div>
          <div className="hl">Importance</div>
          <div className="sc">
            {d.options.map((o, j) => (
              <div key={o.id} className="oh">
                <i style={{ background: optColor(j) }} aria-hidden="true" />
                <small>Option {j + 1}</small>
                {n > 2 && !readOnly && (
                  <button type="button" className="x" aria-label={`Remove ${o.name}`} onClick={() => change((x) => ops.removeOption(x, j))}>
                    ×
                  </button>
                )}
                <LiveTextarea
                  className="oname"
                  rows={2}
                  maxLength={LIMITS.nameMax}
                  aria-label={`Option ${j + 1} name`}
                  spellCheck={false}
                  readOnly={readOnly}
                  value={o.name}
                  onLive={(v) => edit((x) => ops.renameOption(x, j, v))}
                  onCommit={commit}
                />
              </div>
            ))}
          </div>
          <div className="hl" />
        </div>
        {d.criteria.map((c, i) => (
          <Row
            key={c.id}
            c={c}
            i={i}
            open={openRows.has(c.id)}
            toggle={() =>
              setOpenRows((s) => {
                const next = new Set(s);
                if (next.has(c.id)) next.delete(c.id);
                else next.add(c.id);
                return next;
              })
            }
          />
        ))}
      </div>
      {!readOnly && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={d.criteria.length >= LIMITS.maxCriteria}
            onClick={() => {
              change((x) => void ops.addCriterion(x));
              focusLast('.cname');
            }}
          >
            Add criterion
          </button>
          <button
            type="button"
            className="btn"
            disabled={n >= LIMITS.maxOptions}
            onClick={() => {
              change((x) => void ops.addOption(x));
              focusLast('.oname');
            }}
          >
            Add option
          </button>
          {onOpenWeights && (
            <button type="button" className="btn" disabled={d.criteria.length < 2} onClick={onOpenWeights}>
              Help me set weights
            </button>
          )}
          {children}
        </div>
      )}
      <p className="small">The template scores and prices are examples. Replace them with your own.</p>
    </section>
  );
}
