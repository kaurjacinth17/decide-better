/** Number and text formatting, identical to the prototype's helpers. */

export const f2 = (x: number) => x.toFixed(2);
export const pc = (x: number) => `${Math.round(x * 100)}%`;
/** Show one decimal when a flip point would otherwise round to the current weight. */
export const pc1 = (t: number, now: number) => (Math.round(t * 100) === Math.round(now * 100) ? `${(t * 100).toFixed(1)}%` : pc(t));
/** Truncate to k characters with an ellipsis. */
export const nm = (s: string | null | undefined, k: number) => {
  const v = String(s || 'Untitled');
  return v.length > k ? `${v.slice(0, k - 1)}…` : v;
};
/** Escape table pipes for Markdown cells. */
export const md = (s: string) => String(s).replace(/\|/g, '/');

/** Format a raw value with its unit using Indian digit grouping. "₹" units are prefixed. */
export function fmtValue(x: number | null | undefined, unit: string): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const n = x.toLocaleString('en-IN');
  const u = String(unit || '').trim();
  if (u.startsWith('₹')) {
    const rest = u.slice(1).trim();
    return `₹${n}${rest ? ` ${rest}` : ''}`;
  }
  return `${n}${u ? ` ${u}` : ''}`;
}

/** Derived-score caption shown under value cells: "score 7.5". */
export const derivedText = (v: number) => `score ${Math.round(v * 10) / 10}`;
