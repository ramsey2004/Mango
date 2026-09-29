import type { NutritionProfile, Nutrients } from '../lib/nutrition-types';
import { healthTargets, gate as healthGate, type HealthTargets } from './health';

/* ============================================================
   Compatibility shim.

   The calculation engine moved to src/engine/health/, split by
   concern, with every constant sourced and every actionable
   number carrying a band. Twelve files import from here, so this
   keeps them working while they migrate, and re-exports the new
   surface so each one can adopt the richer version on its own
   schedule rather than in one large change.

   Nothing is calculated in this file.
   ============================================================ */

export {
  bmi,
  bmiBand,
  waistReading,
  activityLabel,
  kcalBurned,
  burnEstimate,
  healthTargets,
  gate,
  adaptiveMaintenance,
  weightTrend,
  rateSentence,
  perMealProtein,
  distributeProtein,
  bmrEstimate,
  tdeeEstimate,
  proteinEstimate,
  SOURCES,
  cite,
  formatBand,
  formatValue,
  confidenceLabel,
} from './health';

export type { Estimate, HealthTargets, Gate } from './health';

export type Targets = HealthTargets;

/** The engine's entry point. Same signature as before; richer return. */
export const targetsFor = (raw: NutritionProfile, burnedToday = 0): HealthTargets =>
  healthTargets(raw, burnedToday);

/** @deprecated use `bmrEstimate` — this drops the band. */
export const bmr = (p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number =>
  healthTargets({
    ...(p as NutritionProfile),
    activity: 'sedentary',
    track: 'wellness',
    intents: [],
  } as NutritionProfile).bmr;

/** @deprecated use `tdeeEstimate` — this drops the band. */
export const tdee = (p: NutritionProfile): number => healthTargets(p).tdee;

export interface ProfileCheck {
  safe: NutritionProfile;
  missing: Array<'weight' | 'height' | 'age'>;
  clamped: string[];
  unusable: boolean;
  minor: boolean;
}

/** @deprecated use `gate` — this collapses four states into one boolean. */
export function checkProfile(p: NutritionProfile): ProfileCheck {
  const g = healthGate(p);
  return {
    safe: g.safe,
    missing: g.missing,
    clamped: g.clamped,
    unusable: g.verdict === 'ask',
    minor: g.minor,
  };
}

export const sumNutrients = (items: Nutrients[]): Nutrients =>
  items.reduce(
    (a, b) => ({
      kcal: a.kcal + b.kcal,
      protein: a.protein + b.protein,
      carbs: a.carbs + b.carbs,
      fat: a.fat + b.fat,
      fibre: a.fibre + b.fibre,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );

export const roundN = (n: Nutrients): Nutrients => ({
  kcal: Math.round(n.kcal),
  protein: Math.round(n.protein),
  carbs: Math.round(n.carbs),
  fat: Math.round(n.fat),
  fibre: Math.round(n.fibre),
});
