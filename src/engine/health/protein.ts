import type { NutritionProfile, GoalTrack, MealSlot } from '../../lib/nutrition-types';
import { PROTEIN } from './constants';
import { bmi } from './bmi';
import { estimate, type Estimate } from './uncertainty';

/* ============================================================
   Protein.

   Two changes from the old rule, both from the same place: the
   ISSN position stand says 1.4–2.0 g/kg/day for most exercising
   people, 0.25 g/kg or 20–40 g per dose, and discusses 1.6–2.4
   g/kg in hypocaloric conditions.

   First, above BMI 30 the per-kg figure is taken on adjusted
   body weight. The evidence behind those ranges comes largely
   from lean and overweight cohorts; applying g/kg to a very high
   body weight produces targets that are neither supported nor
   achievable in food.

   Second, the per-meal dose is now produced, not just the daily
   total. Mango already plans meals, so the actionable number is
   the one per plate.

   Deliberately not raised further. The stand's own framing is a
   range, and "more is better" is not what it says.
   ============================================================ */

/** Devine ideal body weight, the usual basis for the adjusted-weight formula. */
const idealBodyWeightKg = (heightCm: number, sex: NutritionProfile['sex']): number => {
  const inchesOver5ft = Math.max(0, (heightCm - 152.4) / 2.54);
  const base = sex === 'female' ? 45.5 : sex === 'male' ? 50 : 47.75;
  return base + 2.3 * inchesOver5ft;
};

/**
 * The weight g/kg is taken on. Actual weight below BMI 30; above it, ideal
 * plus 40% of the excess, which is standard clinical practice.
 */
export function referenceWeightKg(p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'sex'>): {
  kg: number;
  adjusted: boolean;
} {
  if (bmi(p.weightKg, p.heightCm) < PROTEIN.adjustAboveBmi) return { kg: p.weightKg, adjusted: false };
  const ideal = idealBodyWeightKg(p.heightCm, p.sex);
  return { kg: ideal + PROTEIN.adjustFactor * (p.weightKg - ideal), adjusted: true };
}

export function proteinPerKg(track: GoalTrack, intents: string[]): number {
  if (track === 'muscle_gain') return PROTEIN.muscleGain;
  if (track === 'fat_loss') return PROTEIN.fatLoss;
  if (intents.includes('performance')) return PROTEIN.performance;
  return PROTEIN.wellness;
}

export function proteinEstimate(
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'sex' | 'track' | 'intents'>,
): Estimate {
  const ref = referenceWeightKg(p);
  const perKg = proteinPerKg(p.track, p.intents as string[]);
  const raw = ref.kg * perKg;
  const value = Math.min(PROTEIN.absoluteMaxG, Math.max(PROTEIN.absoluteMinG, raw));

  const why = ref.adjusted
    ? `${perKg} g per kg, taken on an adjusted body weight of ${Math.round(ref.kg)} kg rather than your scale weight. The research behind these ranges comes mostly from lean and overweight groups, so applying it to full body weight would give a target that is neither supported by the evidence nor realistic to eat.`
    : `${perKg} g per kg of body weight. The ISSN position stand puts 1.4–2.0 g/kg/day as sufficient for most people who train; the figure used here reflects your goal.`;

  return estimate(value, {
    band: [ref.kg * Math.max(1.2, perKg - 0.3), ref.kg * (perKg + 0.3)],
    basis: 'population-equation',
    confidence: 'good',
    why,
    sources: ['ISSN_PROTEIN'],
  });
}

/**
 * Per-meal protein. ISSN gives 0.25 g/kg per dose, or 20–40 g absolute —
 * which is the number a person can actually act on when looking at a plate.
 */
export function perMealProtein(
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'sex'>,
): { grams: number; why: string } {
  const ref = referenceWeightKg(p);
  const dose = ref.kg * PROTEIN.perMealGPerKg;
  const grams = Math.round(Math.min(PROTEIN.perMealMaxG, Math.max(PROTEIN.perMealMinG, dose)));
  return {
    grams,
    why: `About ${grams} g per meal. ISSN puts a useful dose at 0.25 g per kg, or 20–40 g — spreading protein across the day is better than one large serving.`,
  };
}

/** Distributes the daily target across the slots actually being eaten. */
export function distributeProtein(totalG: number, slots: MealSlot[]): Record<string, number> {
  if (!slots.length) return {};
  /* Meals carry more than snacks, but every slot clears a useful dose where
     the total allows it. */
  const weight: Record<string, number> = { breakfast: 1, lunch: 1.15, dinner: 1.15, snack: 0.55 };
  const sum = slots.reduce((s, k) => s + (weight[k] ?? 1), 0);
  const out: Record<string, number> = {};
  for (const k of slots) out[k] = Math.round((totalG * (weight[k] ?? 1)) / sum);
  return out;
}
