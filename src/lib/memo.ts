/**
 * Decision-memo facts: every figure the memo may quote, pre-formatted exactly as the UI
 * shows it. The printable memo is built from these, and the AI memo (feature D) receives
 * only these and is checked against them, so it cannot introduce numbers of its own.
 */
import { CERTAINTY, confidenceLabel, f2, fmtValue, leadLabel, pc, pc1, type SimResult } from '@/engine';
import type { Analysis } from '@/engine/analyse';

export interface MemoFacts {
  title: string;
  optionCount: number;
  criterionCount: number;
  leader: { name: string; score: string } | null;
  runnerUp: { name: string; score: string } | null;
  margin: string | null;
  leadLabel: string | null;
  tie: boolean;
  winnerByElimination: boolean;
  confidence: { label: string; winShare: string; runs: string } | null;
  ruledOut: { option: string; reasons: string[] }[];
  criteria: {
    name: string;
    weight: string;
    certainty: string;
    scale: string;
    ratings: { option: string; shown: string; score: string }[];
  }[];
  totals: { option: string; score: string; ruledOut: boolean }[];
  biggestAdvantage: { criterion: string; leaderShows: string; runnerUpShows: string; points: string; weight: string } | null;
  biggestDrawback: { criterion: string; leaderShows: string; runnerUpShows: string; points: string; weight: string } | null;
  headlineFlip: { criterion: string; direction: 'above' | 'below' | 'ignored'; threshold: string; now: string; newLeader: string } | null;
  scoreFlips: string[];
  mostDoubt: { source: string; share: string } | null;
  gut: string | null;
}

const show = (a: Analysis, i: number, j: number) => {
  const c = a.model.decision.criteria[i]!;
  return c.mode === 'value' ? fmtValue(c.values[j], c.unit) : String(c.scores[j]);
};

export function memoFacts(a: Analysis, sim: SimResult | null): MemoFacts {
  const m = a.model;
  const d = m.decision;
  const O = d.options;
  const C = d.criteria;
  const L = m.leader;
  const R = m.runnerUp;
  const card = (x: { i: number; delta: number }) =>
    x.i < 0 || L === undefined || R === undefined
      ? null
      : {
          criterion: C[x.i]!.name,
          leaderShows: show(a, x.i, L),
          runnerUpShows: show(a, x.i, R),
          points: `${x.delta >= 0 ? '+' : '−'}${f2(Math.abs(x.delta))}`,
          weight: pc(m.wn[x.i]!),
        };
  let mostDoubt: MemoFacts['mostDoubt'] = null;
  if (sim && a.comparable && sim.attr.length === C.length) {
    const top = sim.attr.indexOf(Math.max(...sim.attr));
    if (sim.weightFlip !== null && sim.weightFlip > (sim.attr[top] ?? 0)) mostDoubt = { source: 'your weights', share: pc(sim.weightFlip) };
    else if ((sim.attr[top] ?? 0) >= 0.02) mostDoubt = { source: C[top]!.name, share: pc(sim.attr[top]!) };
  }
  const bf = a.headline;
  let gut: string | null = null;
  const g = a.gut;
  if (g.kind === 'agrees') gut = `The user's gut pick, ${O[g.option]!.name}, agrees with the leader.`;
  else if (g.kind === 'tiebreak')
    gut = `The criteria can't separate the top two; the user's gut pick, ${O[g.option]!.name}, is a fair tiebreaker.`;
  else if (g.kind === 'ruledOut') gut = `The user's gut pick, ${O[g.option]!.name}, breaks a deal-breaker.`;
  else if (g.kind === 'disagrees' && L !== undefined) {
    const y = g.analysis;
    gut =
      `The user's gut pick is ${O[g.option]!.name}, but the criteria prefer ${O[L]!.name} by ${f2(m.S[L]! - m.S[g.option]!)} points` +
      (y.biggest >= 0 ? `, mostly because of ${C[y.biggest]!.name}.` : '.') +
      (y.flip
        ? ` ${O[g.option]!.name} would lead if ${C[y.flip.i]!.name} were weighted ${y.flip.dir > 0 ? 'above' : 'below'} ${pc1(y.flip.t, m.wn[y.flip.i]!)} (now ${pc(m.wn[y.flip.i]!)}).`
        : ` No single weight change puts ${O[g.option]!.name} on top.`);
  }
  const Rn = R !== undefined ? O[R]!.name : '';
  const W = L !== undefined ? O[L]!.name : '';
  return {
    title: d.title,
    optionCount: O.length,
    criterionCount: C.length,
    leader: L !== undefined ? { name: O[L]!.name, score: f2(m.S[L]!) } : null,
    runnerUp: R !== undefined ? { name: O[R]!.name, score: f2(m.S[R]!) } : null,
    margin: R !== undefined ? f2(m.gap) : null,
    leadLabel: R !== undefined ? leadLabel(m.gap, m.tie) : null,
    tie: m.tie,
    winnerByElimination: L !== undefined && R === undefined,
    confidence:
      sim && L !== undefined && a.comparable
        ? { label: confidenceLabel(sim.p[L]!, m.tie).label, winShare: pc(sim.p[L]!), runs: sim.N.toLocaleString('en-IN') }
        : null,
    ruledOut: m.order
      .filter((j) => !m.eligible[j])
      .map((j) => ({
        option: O[j]!.name,
        reasons: m.fails[j]!.map((i) => {
          const c = C[i]!;
          return c.mode === 'value'
            ? `${c.name} is ${fmtValue(c.values[j], c.unit)}, ${c.direction > 0 ? 'below' : 'above'} the limit of ${fmtValue(c.dealBreaker, c.unit)}`
            : `${c.name} scored ${c.scores[j]}, below the minimum of ${c.dealBreaker}`;
        }),
      })),
    criteria: C.map((c, i) => ({
      name: c.name,
      weight: pc(m.wn[i]!),
      certainty: CERTAINTY[c.certainty].label,
      scale:
        c.mode === 'value'
          ? `${c.unit || 'actual values'}, ${c.direction > 0 ? 'higher' : 'lower'} is better`
          : c.hint || '1–10 rating, 10 is best',
      ratings: O.map((o, j) => ({ option: o.name, shown: show(a, i, j), score: String(Math.round(m.D[i]![j]! * 10) / 10) })),
    })),
    totals: m.order.map((j) => ({ option: O[j]!.name, score: f2(m.S[j]!), ruledOut: !m.eligible[j] })),
    biggestAdvantage: card(a.advantage),
    biggestDrawback: card(a.drawback),
    headlineFlip:
      bf && a.comparable && !m.tie
        ? {
            criterion: C[bf.i]!.name,
            direction: bf.dir < 0 && bf.t < 0.005 ? 'ignored' : bf.dir > 0 ? 'above' : 'below',
            threshold: pc1(bf.t, m.wn[bf.i]!),
            now: pc(m.wn[bf.i]!),
            newLeader: O[bf.to]!.name,
          }
        : null,
    scoreFlips: a.scoreFlips.map((f) => {
      const c = C[f.criterion]!;
      return f.who === 'runnerUp'
        ? `${Rn}'s ${c.name} score rose above ${f.threshold.toFixed(1)} (now ${f.from})`
        : `${W}'s ${c.name} score fell below ${f.threshold.toFixed(1)} (now ${f.from})`;
    }),
    mostDoubt,
    gut,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic memo text (always available, no AI)                  */
/* ------------------------------------------------------------------ */

export interface MemoSection {
  heading: string;
  paragraphs: string[];
}

export function deterministicMemo(f: MemoFacts): MemoSection[] {
  const out: MemoSection[] = [];
  if (!f.leader) {
    out.push({
      heading: 'Recommendation',
      paragraphs: ['No option passes every deal-breaker. Loosen a deal-breaker or add an option before deciding.'],
    });
    return out;
  }
  if (f.winnerByElimination) {
    out.push({
      heading: 'Recommendation',
      paragraphs: [`${f.leader.name} is the only option that passes every deal-breaker, scoring ${f.leader.score} out of 10.`],
    });
  } else if (f.tie) {
    out.push({
      heading: 'Recommendation',
      paragraphs: [
        `${f.leader.name} and ${f.runnerUp!.name} are effectively tied at ${f.leader.score} out of 10. The criteria can't separate them, so the choice rests on something not yet captured.`,
      ],
    });
  } else {
    const conf = f.confidence
      ? ` It wins ${f.confidence.winShare} of ${f.confidence.runs} simulated outcomes (${f.confidence.label.toLowerCase()}).`
      : '';
    out.push({
      heading: 'Recommendation',
      paragraphs: [
        `On the criteria and weights given, ${f.leader.name} comes out ahead with ${f.leader.score} out of 10, ${f.margin} points ahead of ${f.runnerUp!.name} (${f.runnerUp!.score}). ${f.leadLabel}.${conf}`,
      ],
    });
  }
  const why: string[] = [];
  if (f.biggestAdvantage)
    why.push(
      `The biggest advantage is ${f.biggestAdvantage.criterion}: ${f.biggestAdvantage.leaderShows} against ${f.biggestAdvantage.runnerUpShows}, worth ${f.biggestAdvantage.points} points at ${f.biggestAdvantage.weight} weight.`,
    );
  if (f.biggestDrawback)
    why.push(
      `The biggest drawback is ${f.biggestDrawback.criterion}: ${f.biggestDrawback.leaderShows} against ${f.biggestDrawback.runnerUpShows}, costing ${f.biggestDrawback.points} points at ${f.biggestDrawback.weight} weight.`,
    );
  const top = [...f.criteria].sort((a, b) => parseInt(b.weight) - parseInt(a.weight)).slice(0, 3);
  why.push(`The heaviest criteria are ${top.map((c) => `${c.name} (${c.weight})`).join(', ')}.`);
  out.push({ heading: 'Why it leads', paragraphs: why });

  if (f.ruledOut.length) out.push({ heading: 'Ruled out', paragraphs: f.ruledOut.map((r) => `${r.option}: ${r.reasons.join('; ')}.`) });

  const change: string[] = [];
  if (f.headlineFlip)
    change.push(
      f.headlineFlip.direction === 'ignored'
        ? `The result changes only if ${f.headlineFlip.criterion} is ignored completely (now ${f.headlineFlip.now}); ${f.headlineFlip.newLeader} would then lead.`
        : `The result changes if ${f.headlineFlip.criterion} is weighted ${f.headlineFlip.direction} ${f.headlineFlip.threshold} (now ${f.headlineFlip.now}); ${f.headlineFlip.newLeader} would then lead.`,
    );
  else if (!f.tie && !f.winnerByElimination) change.push(`No single weight change flips the result.`);
  if (f.scoreFlips.length) change.push(`It would also change if ${f.scoreFlips.slice(0, 2).join(', or if ')}.`);
  if (change.length) out.push({ heading: 'What would change the decision', paragraphs: change });

  const doubt: string[] = [];
  if (f.mostDoubt)
    doubt.push(
      `Most of the uncertainty comes from ${f.mostDoubt.source}: doubt there alone changes the leader in ${f.mostDoubt.share} of runs.`,
    );
  const guesses = f.criteria.filter((c) => c.certainty === 'Guessing').map((c) => c.name);
  if (guesses.length)
    doubt.push(`Scores marked as guesses: ${guesses.join(', ')}. Firming these up is the cheapest way to raise confidence.`);
  if (doubt.length) out.push({ heading: 'Uncertainty', paragraphs: doubt });
  if (f.gut) out.push({ heading: 'Gut check', paragraphs: [f.gut] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Number guard for AI-written text                                   */
/* ------------------------------------------------------------------ */

/** Every number-like token in a text (handles 1,35,000 / 7.35 / 86% / −0.60). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));
}

/** The numbers a memo is allowed to quote: everything in the facts, plus small counting words' digits. */
export function allowedNumbers(f: MemoFacts): Set<string> {
  const set = new Set(numbersIn(JSON.stringify(f)));
  for (let k = 0; k <= 10; k++) set.add(String(k));
  set.add('100');
  return set;
}

/** Numbers in `text` that do not appear in the facts. Empty means the text invents nothing. */
export function inventedNumbers(text: string, f: MemoFacts): string[] {
  const ok = allowedNumbers(f);
  const norm = (n: string) => (n.includes('.') ? String(Number(n)) : n);
  const okNorm = new Set([...ok].map(norm));
  return [...new Set(numbersIn(text))].filter((n) => !ok.has(n) && !okNorm.has(norm(n)));
}
