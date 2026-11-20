/** Build the compact decision brief the AI sees: names, weights, ratings and totals — computed by the engine. */
import { f2, fmtValue, type Analysis } from '@/engine';
import { CERTAINTY_WORDS, type DecisionBrief } from './schemas';

export function decisionBrief(a: Analysis): DecisionBrief {
  const m = a.model;
  const d = m.decision;
  return {
    title: d.title.slice(0, 200),
    options: d.options.map((o) => o.name.slice(0, 80)),
    criteria: d.criteria.map((c, i) => ({
      name: c.name.slice(0, 80),
      weightPercent: Math.round(m.wn[i]! * 100),
      scale:
        c.mode === 'value'
          ? `${c.unit || 'actual values'}, ${c.direction > 0 ? 'higher' : 'lower'} is better`.slice(0, 120)
          : (c.hint || '1-10, 10 is best').slice(0, 120),
      certainty: CERTAINTY_WORDS[c.certainty],
      ratings: d.options.map((_, j) => (c.mode === 'value' ? fmtValue(c.values[j], c.unit) : String(c.scores[j]))),
      dealBreaker:
        c.dealBreaker === null
          ? null
          : c.mode === 'value'
            ? `rule out ${c.direction > 0 ? 'below' : 'above'} ${fmtValue(c.dealBreaker, c.unit)}`
            : `rule out below ${c.dealBreaker}`,
    })),
    leader: m.leader !== undefined ? d.options[m.leader]!.name : null,
    totals: m.order.map((j) => ({ option: d.options[j]!.name, total: f2(m.S[j]!) })),
  };
}
