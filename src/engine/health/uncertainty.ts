import type { SourceKey } from './constants';

/* ============================================================
   Estimates, not measurements.

   Everything a person could act on comes back as an Estimate: a
   working number, the band around it, where the band came from,
   and one sentence of why.

   The discipline that makes this worth having is in `basis`. A
   band derived from a published SD is not the same kind of
   object as ±10% picked as a rule of thumb, and the UI must be
   able to tell them apart — otherwise "confidence interval"
   becomes decoration. Nothing here computes a statistic that was
   not in a source.
   ============================================================ */

export type Basis =
  /** a population equation applied to this person */
  | 'population-equation'
  /** derived from this user's own logs and weight trend */
  | 'personal-data'
  /** arithmetic on numbers the user supplied; no model error */
  | 'arithmetic'
  /** a rule of thumb, honestly labelled */
  | 'rule-of-thumb';

export type Confidence = 'low' | 'moderate' | 'good';

export interface Estimate {
  /** the number to show */
  value: number;
  /** [low, high]; equal to [value, value] when basis is 'arithmetic' */
  band: [number, number];
  basis: Basis;
  confidence: Confidence;
  /** one sentence, written for the user */
  why: string;
  sources: SourceKey[];
}

const r = (n: number) => Math.round(n);

export function estimate(
  value: number,
  opts: {
    band?: [number, number];
    sd?: number;
    relative?: number;
    basis: Basis;
    confidence: Confidence;
    why: string;
    sources: SourceKey[];
  },
): Estimate {
  let band: [number, number];
  if (opts.band) band = [r(opts.band[0]), r(opts.band[1])];
  else if (opts.sd !== undefined) band = [r(value - opts.sd), r(value + opts.sd)];
  else if (opts.relative !== undefined) band = [r(value * (1 - opts.relative)), r(value * (1 + opts.relative))];
  else band = [r(value), r(value)];

  return {
    value: r(value),
    band: [Math.min(band[0], band[1]), Math.max(band[0], band[1])],
    basis: opts.basis,
    confidence: opts.confidence,
    why: opts.why,
    sources: opts.sources,
  };
}

/** A number the user gave us, transformed. No model, so no band. */
export const exact = (value: number, why: string, sources: SourceKey[] = []): Estimate =>
  estimate(value, { basis: 'arithmetic', confidence: 'good', why, sources });

/** Shifts an estimate while carrying its uncertainty. */
export const shift = (e: Estimate, delta: number, why: string): Estimate => ({
  ...e,
  value: r(e.value + delta),
  band: [r(e.band[0] + delta), r(e.band[1] + delta)],
  why,
});

/** Clamps an estimate and its band into a range. */
export function bound(e: Estimate, lo: number, hi: number): Estimate {
  const c = (n: number) => Math.min(hi, Math.max(lo, n));
  return { ...e, value: r(c(e.value)), band: [r(c(e.band[0])), r(c(e.band[1]))] };
}

/** "2,380" / "2,180–2,580" — the second is what sits behind "Why this number?". */
export const formatValue = (e: Estimate): string => e.value.toLocaleString('en-IN');
export const formatBand = (e: Estimate): string =>
  e.band[0] === e.band[1]
    ? e.value.toLocaleString('en-IN')
    : `${e.band[0].toLocaleString('en-IN')}–${e.band[1].toLocaleString('en-IN')}`;

/** Plain words for how much to trust it. Never a percentage we did not compute. */
export const confidenceLabel = (e: Estimate): string => {
  if (e.basis === 'arithmetic') return 'Calculated from what you entered';
  if (e.basis === 'personal-data') {
    return e.confidence === 'good'
      ? 'Learned from your own logs'
      : 'Starting to learn from your own logs';
  }
  if (e.basis === 'rule-of-thumb') return 'A rough estimate';
  return e.confidence === 'low' ? 'A rough population estimate' : 'A population estimate';
};
