/** Domain types shared by the engine, the store and the UI. Pure data, no behaviour. */

export type Certainty = 0 | 1 | 2;
export type Mode = 'score' | 'value';
export type Direction = 1 | -1;

export const TEMPLATE_KEYS = ['job', 'rent', 'laptop', 'mba', 'move', 'biz', 'blank'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface Option {
  id: string;
  name: string;
}

export interface Criterion {
  id: string;
  name: string;
  /** Raw importance 0–100. Normalised weights are derived from these. */
  weight: number;
  /** Free-text scale note shown in score mode, e.g. "10 = lowest risk". */
  hint: string;
  mode: Mode;
  /** 1 = higher is better, -1 = lower is better (value mode only). */
  direction: Direction;
  unit: string;
  /** 1–10 rating per option (score mode). Kept in value mode so switching back is lossless. */
  scores: number[];
  /** Raw value per option (value mode). null = not entered. */
  values: (number | null)[];
  /** 0 Sure, 1 Fairly sure, 2 Guessing. Drives simulation noise. */
  certainty: Certainty;
  /** Score mode: minimum score. Value mode: minimum (higher-better) or maximum (lower-better) raw value. */
  dealBreaker: number | null;
}

export interface Decision {
  id: string;
  title: string;
  templateKey: TemplateKey;
  gutOptionId: string | null;
  /** Also vary every weight by up to ±25% in the simulation. */
  varyWeights: boolean;
  options: Option[];
  criteria: Criterion[];
  createdAt: number;
  updatedAt: number;
}

export const LIMITS = {
  minOptions: 2,
  maxOptions: 5,
  minCriteria: 1,
  maxCriteria: 10,
  titleMax: 90,
  nameMax: 40,
} as const;
