import type { NutritionProfile } from '../../lib/nutrition-types';
import { RANGE } from './constants';
import { bmi } from './bmi';

/* ============================================================
   The gate.

   Four states, decided before any number is produced, in a
   fixed order of severity. Two properties matter more than the
   rules themselves:

   The tier never touches this. A paid plan does not buy safer
   arithmetic and a free one does not get a worse floor — the
   coach already works this way and the targets now do too.

   The AI never overrides it. This runs first, and when it says
   REFUSE, nothing downstream gets to produce a number that
   could be shown instead.
   ============================================================ */

export type Verdict = 'refuse' | 'ask' | 'estimate' | 'calculate';

export interface Gate {
  verdict: Verdict;
  /** what to tell the user, in their words */
  reason?: string;
  /** which fields would move this forward */
  missing: Array<'weight' | 'height' | 'age'>;
  /** values pulled into range, and what was done */
  clamped: string[];
  /** the profile with implausible values bounded */
  safe: NutritionProfile;
  /** true when a deficit must not be applied whatever the track says */
  noDeficit: boolean;
  /** widen the bands and say so */
  wideBand: boolean;
  minor: boolean;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function gate(p: NutritionProfile): Gate {
  const missing: Gate['missing'] = [];
  const clamped: string[] = [];

  const take = (
    raw: unknown,
    key: 'weightKg' | 'heightCm' | 'age',
    label: 'weight' | 'height' | 'age',
    unit: string,
  ): number => {
    const v = num(raw);
    if (v === null || v <= 0) {
      missing.push(label);
      return (RANGE[key][0] + RANGE[key][1]) / 2;
    }
    const [lo, hi] = RANGE[key];
    if (v < lo) { clamped.push(`${label} read as ${v}${unit}, below anything these equations are valid for — treated as ${lo}${unit}`); return lo; }
    if (v > hi) { clamped.push(`${label} read as ${v}${unit}, above the range these equations are valid for — treated as ${hi}${unit}`); return hi; }
    return v;
  };

  const weightKg = take(p.weightKg, 'weightKg', 'weight', ' kg');
  const heightCm = take(p.heightCm, 'heightCm', 'height', ' cm');
  const age = take(p.age, 'age', 'age', '');
  const safe: NutritionProfile = { ...p, weightKg, heightCm, age };

  const rawAge = num(p.age);
  const minor = rawAge !== null && rawAge >= RANGE.age[0] && rawAge < 18;
  const b = missing.length ? 0 : bmi(weightKg, heightCm);

  const base = { missing, clamped, safe, minor };

  /* ---- refuse: no target at all ---- */

  if (b > 0 && b < 16) {
    return {
      ...base,
      verdict: 'refuse',
      noDeficit: true,
      wideBand: true,
      reason:
        'At this body weight Mango will not set a calorie target. That is not a judgement about you — it is that an app working from height and weight alone is the wrong tool here, and a doctor or a registered dietitian is the right one.',
    };
  }

  if (minor && p.track === 'fat_loss') {
    return {
      ...base,
      verdict: 'estimate',
      noDeficit: true,
      wideBand: true,
      reason:
        'Mango does not set a weight-loss target for anyone under 18. Growing bodies are not a deficit problem, and these equations are adult ones. The number shown is maintenance, and it is an estimate only.',
    };
  }

  /* ---- ask: the profile cannot support a number ---- */

  if (missing.length) {
    return {
      ...base,
      verdict: 'ask',
      noDeficit: false,
      wideBand: true,
      reason: `Add your ${missing.join(', ')} and Mango can work this out. Until then there is no honest number to show.`,
    };
  }

  /* ---- estimate: a number, with the uncertainty said out loud ---- */

  if (minor) {
    return {
      ...base,
      verdict: 'estimate',
      noDeficit: true,
      wideBand: true,
      reason: 'These equations were built on adults, so for anyone under 18 this is an estimate only and not a substitute for paediatric advice.',
    };
  }

  if (b >= 40) {
    return {
      ...base,
      verdict: 'estimate',
      noDeficit: false,
      wideBand: true,
      reason:
        'At this body weight the prediction equations are working at the edge of where they were validated, so the range is wider than usual. Worth having a dietitian look at the plan rather than trusting an app alone.',
    };
  }

  if (age >= 75) {
    return {
      ...base,
      verdict: 'estimate',
      noDeficit: false,
      wideBand: true,
      reason:
        'Above 75 these equations are less well validated, and protein and energy needs shift with age. Treat this as a starting point to discuss rather than a target.',
    };
  }

  if (clamped.length) {
    return {
      ...base,
      verdict: 'estimate',
      noDeficit: false,
      wideBand: true,
      reason: 'One of your entries was outside the range these equations cover, so it was brought back to the edge of that range. Worth checking it.',
    };
  }

  return { ...base, verdict: 'calculate', noDeficit: false, wideBand: false };
}

/** Never produce a target for these. Checked by the probe, not just by review. */
export const producesTarget = (g: Gate): boolean => g.verdict !== 'refuse' && g.verdict !== 'ask';
