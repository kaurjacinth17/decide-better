/**
 * One call that returns every deterministic fact the UI and the AI memo need.
 * (The Monte Carlo simulation is separate because it runs in a worker.)
 */
import type { Criterion, Decision } from './types';
import { computeModel, contributions, type Model } from './model';
import { headlineFlip, scoreFlips, sensitivity, type CriterionSensitivity, type HeadlineFlip, type ScoreFlip } from './sensitivity';
import { gutAnalysis, type GutAnalysis } from './gut';
import { fmtValue, f2, md, pc } from './format';
import { confidenceLabel, type SimResult } from './simulate';

export type LeadLabel = 'Effectively a tie' | 'Too close to call' | 'Narrow lead' | 'Clear lead';
export const leadLabel = (gap: number, tie: boolean): LeadLabel =>
  tie ? 'Effectively a tie' : gap < 0.3 ? 'Too close to call' : gap < 0.8 ? 'Narrow lead' : 'Clear lead';

export interface AdvantageCard {
  /** Criterion index, or −1 for none. */
  i: number;
  /** Signed contribution to the leader's lead over the runner-up. */
  delta: number;
}

export type GutState =
  | { kind: 'none' }
  | { kind: 'ruledOut'; option: number }
  | { kind: 'agrees'; option: number }
  | { kind: 'tiebreak'; option: number }
  | { kind: 'disagrees'; option: number; analysis: GutAnalysis };

export interface Analysis {
  model: Model;
  sens: CriterionSensitivity[];
  headline: HeadlineFlip | null;
  scoreFlips: ScoreFlip[];
  contributions: number[][];
  advantage: AdvantageCard;
  drawback: AdvantageCard;
  gut: GutState;
  /** At least two options pass every deal-breaker. */
  comparable: boolean;
}

export function analyse(decision: Decision): Analysis {
  const model = computeModel(decision);
  const { D, wn, leader, runnerUp, eo, tie, eligible } = model;
  const comparable = eo.length >= 2;
  const sens = sensitivity(model);
  const headline = comparable ? headlineFlip(sens) : null;

  let advantage: AdvantageCard = { i: -1, delta: 0 };
  let drawback: AdvantageCard = { i: -1, delta: 0 };
  if (comparable && leader !== undefined && runnerUp !== undefined) {
    const d = decision.criteria.map((_, i) => wn[i]! * (D[i]![leader]! - D[i]![runnerUp]!));
    d.forEach((v, i) => {
      if (v > 1e-9 && (advantage.i < 0 || v > advantage.delta)) advantage = { i, delta: v };
      if (v < -1e-9 && (drawback.i < 0 || v < drawback.delta)) drawback = { i, delta: v };
    });
  }

  let gut: GutState = { kind: 'none' };
  const g = decision.options.findIndex((o) => o.id === decision.gutOptionId);
  if (g >= 0) {
    if (!eligible[g]) gut = { kind: 'ruledOut', option: g };
    else if (g === leader && !tie) gut = { kind: 'agrees', option: g };
    else if (tie && (g === leader || g === runnerUp)) gut = { kind: 'tiebreak', option: g };
    else if (leader !== undefined) gut = { kind: 'disagrees', option: g, analysis: gutAnalysis(model, g) };
  }

  return {
    model,
    sens,
    headline,
    scoreFlips: scoreFlips(model),
    contributions: contributions(model),
    advantage,
    drawback,
    gut,
    comparable,
  };
}

/** The value shown for an option on a criterion: the raw value in value mode, else the rating. */
export const cellText = (c: Criterion, j: number) => (c.mode === 'value' ? fmtValue(c.values[j], c.unit) : String(c.scores[j]));

/** The "Copy summary" Markdown, matching the prototype's output. */
export function summaryMarkdown(a: Analysis, sim: SimResult | null): string {
  const { model } = a;
  const { decision, wn, S, D, eo, eligible, leader, runnerUp } = model;
  const C = decision.criteria;
  const O = decision.options;
  const L: string[] = [`# ${md(decision.title)}`, ''];
  if (eo.length >= 2 && leader !== undefined && runnerUp !== undefined) {
    L.push(
      `Leader: **${md(O[leader]!.name)}** (${f2(S[leader]!)}/10), ahead of ${md(O[runnerUp]!.name)} by ${f2(S[leader]! - S[runnerUp]!)} points.`,
    );
    if (sim)
      L.push(`Wins in ${pc(sim.p[leader]!)} of ${sim.N} simulations (${confidenceLabel(sim.p[leader]!, model.tie).label.toLowerCase()}).`);
    const bf = a.headline;
    L.push(
      bf
        ? `Changes if ${md(C[bf.i]!.name)} is weighted ${bf.dir > 0 ? 'above' : 'below'} ${pc(bf.t)} (now ${pc(wn[bf.i]!)}); ${md(O[bf.to]!.name)} would lead.`
        : 'No single weight change flips the result.',
    );
  } else {
    L.push(leader !== undefined ? `${md(O[leader]!.name)} wins by elimination.` : 'No option passes every deal-breaker.');
  }
  L.push(
    '',
    `| Criterion | Weight | ${O.map((o, j) => md(o.name) + (eligible[j] ? '' : ' (ruled out)')).join(' | ')} |`,
    `|---|---:|${O.map(() => '---:').join('|')}|`,
  );
  C.forEach((c, i) =>
    L.push(
      `| ${md(c.name)} | ${pc(wn[i]!)} | ${O.map((_, j) =>
        c.mode === 'value' ? `${fmtValue(c.values[j], c.unit)} (${Math.round(D[i]![j]! * 10) / 10})` : String(c.scores[j]),
      ).join(' | ')} |`,
    ),
  );
  L.push(`| **Total** | 100% | ${O.map((_, j) => `**${f2(S[j]!)}**`).join(' | ')} |`);
  return L.join('\n');
}
