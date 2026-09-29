import type { NutritionProfile } from '../../lib/nutrition-types';
import { MET, BURN_RELATIVE_ERROR, EXERCISE_CREDIT } from './constants';
import { assumedExerciseBurn, activityWord } from './energy';
import { estimate, type Estimate } from './uncertainty';

/* ============================================================
   Exercise energy.

   The anti-double-counting logic was already right and is kept.
   Two things changed.

   The quantity an activity level "already assumes" is now
   derived from the level itself and the floor of the FAO range,
   instead of the bare 1.25 that used to sit in the code with no
   explanation and no way to check it.

   And a burn figure is now a range. MET values are population
   averages applied to one person; presenting the result as a
   precise integer was the single most over-confident number in
   the app. ±30% is labelled as a rule of thumb, because that is
   what it is — no interval was computed.
   ============================================================ */

export const kcalBurned = (kind: string, minutes: number, weightKg: number): number =>
  Math.round((((MET[kind] ?? MET.other) * 3.5 * weightKg) / 200) * minutes);

export function burnEstimate(kind: string, minutes: number, weightKg: number): Estimate {
  const v = kcalBurned(kind, minutes, weightKg);
  return estimate(v, {
    relative: BURN_RELATIVE_ERROR,
    basis: 'rule-of-thumb',
    confidence: 'low',
    why: `From a standard MET value for ${kind}, your weight and ${minutes} minutes. MET values are averages across a lot of people, so treat this as a range rather than a reading — the true figure for you could be a third either side.`,
    sources: ['PRODUCT_JUDGEMENT'],
  });
}

export interface ExerciseCredit {
  assumed: number;
  extra: number;
  credit: number;
  note?: string;
}

/**
 * How much of today's logged burn is genuinely on top of what the activity
 * level already built in, and how much of that to give back.
 */
export function exerciseCredit(
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activity'> & { bodyFatPct?: number },
  burnedToday: number,
): ExerciseCredit {
  const assumed = assumedExerciseBurn(p);
  const extra = Math.max(0, Math.round(burnedToday - assumed));
  const credit = Math.min(EXERCISE_CREDIT.capKcal, Math.round(extra * EXERCISE_CREDIT.fraction));

  if (credit > 0) {
    return {
      assumed,
      extra,
      credit,
      note: `You logged about ${Math.round(burnedToday)} kcal of training against the ${assumed} your activity level already builds in. Half of the ${extra} extra is added back — half, because burn estimates run high in a known direction, and eating all of them back is how a deficit stalls.`,
    };
  }
  if (burnedToday > 0) {
    return {
      assumed,
      extra,
      credit: 0,
      note: `You logged about ${Math.round(burnedToday)} kcal today, which is inside the ${assumed} your "${activityWord(p.activity)}" setting already assumes. Nothing is added back — that would be counting the same session twice.`,
    };
  }
  return { assumed, extra: 0, credit: 0 };
}
