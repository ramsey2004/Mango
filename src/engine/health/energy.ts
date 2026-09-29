import type { NutritionProfile, ActivityKey } from '../../lib/nutrition-types';
import { MSJ, CUNNINGHAM, PAL, PAL_BAND, PAL_FLOOR, BMR_SD_KCAL } from './constants';
import { estimate, type Estimate } from './uncertainty';

/* ============================================================
   Basal and total energy.

   Three things this module does that the old one did not.

   It returns a range for `sex: 'other'` instead of an invented
   offset. The previous −78 was the arithmetic midpoint of +5 and
   −161; no study produced it. Dietetic guidance for exactly this
   case recommends presenting a range spanning both values, which
   is also the only honest description of what the app knows.

   It uses fat-free mass when the user has supplied body fat.
   Comparing Indian and Australian adults, BMR differences
   disappeared once adjusted for fat-free mass — so where lean
   mass is known, the right move is not to correct a weight-based
   equation but to stop using one.

   And its activity factors sit inside the FAO/WHO/UNU bands.
   The old sedentary factor of 1.2 was below the entire range
   those authors report for free-living adults.
   ============================================================ */

/* --------------------------------- BMR ----------------------------------- */

const msj = (weightKg: number, heightCm: number, age: number, offset: number): number =>
  MSJ.perKg * weightKg + MSJ.perCm * heightCm + MSJ.perYear * age + offset;

/** Fat-free mass, when body fat is known. */
export const fatFreeMass = (weightKg: number, bodyFatPct: number): number =>
  weightKg * (1 - bodyFatPct / 100);

export function bmrEstimate(
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'> & { bodyFatPct?: number },
): Estimate {
  /* Body composition beats the sex term. When lean mass is known, Cunningham
     needs no sex coefficient at all — which incidentally makes the whole
     `sex: 'other'` problem disappear for anyone who measures body fat. */
  if (typeof p.bodyFatPct === 'number' && Number.isFinite(p.bodyFatPct) && p.bodyFatPct > 0) {
    const ffm = fatFreeMass(p.weightKg, p.bodyFatPct);
    const v = CUNNINGHAM.intercept + CUNNINGHAM.perKgFFM * ffm;
    return estimate(v, {
      relative: 0.08,
      basis: 'population-equation',
      confidence: 'good',
      why: `From your fat-free mass (${Math.round(ffm)} kg), which predicts resting energy better than body weight does — and needs no assumption about sex.`,
      sources: ['CUNNINGHAM_1980', 'SOAR_1993'],
    });
  }

  const male = msj(p.weightKg, p.heightCm, p.age, MSJ.maleOffset);
  const female = msj(p.weightKg, p.heightCm, p.age, MSJ.femaleOffset);

  if (p.sex === 'male' || p.sex === 'female') {
    const v = p.sex === 'male' ? male : female;
    return estimate(v, {
      sd: BMR_SD_KCAL,
      basis: 'population-equation',
      confidence: 'moderate',
      why: 'Mifflin-St Jeor, from your height, weight, age and sex. It is an estimate of resting energy, not a measurement — two people with identical profiles can differ by a couple of hundred calories.',
      sources: ['MSJ_1990', 'WIJESINGHE_2021'],
    });
  }

  /* Neither equation applies, and there is no third one. A range spanning
     both is what the app actually knows. */
  return estimate((male + female) / 2, {
    band: [female - BMR_SD_KCAL, male + BMR_SD_KCAL],
    basis: 'population-equation',
    confidence: 'low',
    why: 'Mifflin-St Jeor has a male and a female form and no third form, so this is shown as the range between them rather than a single number. Adding your body-fat percentage in Settings replaces this with an equation that needs no assumption about sex.',
    sources: ['MSJ_1990', 'AND_GENDER'],
  });
}

/* --------------------------------- TDEE ---------------------------------- */

export const palFor = (a: ActivityKey): number => PAL[a] ?? PAL.sedentary;
export const palBandFor = (a: ActivityKey): [number, number] => PAL_BAND[a] ?? PAL_BAND.sedentary;

export const activityLabel: Record<ActivityKey, string> = {
  sedentary: 'Sedentary — desk work, little movement',
  light: 'Lightly active — some walking most days',
  walking: 'Walking — a deliberate walk most days',
  cycling: 'Cycling regularly',
  gym: 'Gym — resistance training several times a week',
  running: 'Running regularly',
  sports: 'Sport — training or matches most weeks',
  very_active: 'Highly active — physical job or twice-daily training',
};

/**
 * A label for an activity key, safe against a key that is not in the table.
 * A document written by an older build — or corrupted — must not be able to
 * crash the engine that produces somebody's calorie target.
 */
export const activityWord = (a: ActivityKey): string =>
  (activityLabel[a] ?? activityLabel.sedentary).split('—')[0].trim().toLowerCase();

export function tdeeEstimate(
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activity'> & { bodyFatPct?: number },
): Estimate {
  const b = bmrEstimate(p);
  const f = palFor(p.activity);
  const [lo, hi] = palBandFor(p.activity);

  /* The band compounds two uncertainties: the equation's, and the fact that
     one activity level covers a range of real behaviour. FAO says as much —
     assigning a single level to an individual over-simplifies what people
     actually do. */
  return estimate(b.value * f, {
    band: [b.band[0] * lo, b.band[1] * hi],
    basis: 'population-equation',
    confidence: 'low',
    why: `Your resting estimate multiplied by ${f} for "${activityWord(p.activity)}". That multiplier sits in the ${lo}–${hi} band FAO/WHO/UNU report for this kind of lifestyle; a single level covers a lot of different days, which is why the range is wide.`,
    sources: ['FAO_2004', ...b.sources],
  });
}

/**
 * The part of an activity factor that is exercise rather than baseline living.
 *
 * The old code used a bare 1.25 here with no explanation. This derives the
 * same quantity from the factor itself and the floor of the FAO range, so
 * there is no free parameter left to argue about.
 */
export const assumedExerciseBurn = (
  p: Pick<NutritionProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activity'> & { bodyFatPct?: number },
): number => Math.max(0, Math.round(bmrEstimate(p).value * (palFor(p.activity) - PAL_FLOOR)));
