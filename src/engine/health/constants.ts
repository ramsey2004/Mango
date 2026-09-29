/* ============================================================
   Every number this engine uses, in one file, each with the
   source it came from.

   The rule for this file: if a number cannot be attributed, it
   does not belong here. Where a value is a product judgement
   rather than a finding, it says so in the comment — a guard
   rail is allowed to be a choice, it is not allowed to be
   disguised as evidence.

   Citation keys resolve in methodology.ts.
   ============================================================ */

/** Citation keys, so a constant and its source cannot drift apart. */
export type SourceKey =
  | 'FAO_2004'
  | 'NICE_2025'
  | 'IOM_FIBRE'
  | 'ISSN_PROTEIN'
  | 'MSJ_1990'
  | 'CUNNINGHAM_1980'
  | 'SOAR_1993'
  | 'WIJESINGHE_2021'
  | 'HALL_2013'
  | 'INDIA_OBESITY_2024'
  | 'AND_GENDER'
  | 'PRODUCT_JUDGEMENT';

/* ------------------------------ input ranges ----------------------------- */

/** The span over which the prediction equations mean anything. */
export const RANGE = {
  weightKg: [25, 300] as const,
  heightCm: [100, 250] as const,
  age: [13, 100] as const,
  waistCm: [40, 200] as const,
  bodyFatPct: [3, 70] as const,
};

/* -------------------------------- energy --------------------------------- */

/**
 * Mifflin-St Jeor. The sex term is part of the published equation; there is
 * no third coefficient, which is why `sex: 'other'` is handled as a range
 * rather than an invented offset.
 * @source MSJ_1990
 */
export const MSJ = {
  perKg: 10,
  perCm: 6.25,
  perYear: -5,
  maleOffset: 5,
  femaleOffset: -161,
} as const;

/**
 * Cunningham: BMR from fat-free mass. Used only when body fat is known.
 *
 * This matters more than it looks. Comparing Indian and Australian adults,
 * BMR differences disappeared once adjusted for fat-free mass, and the authors
 * concluded FFM rather than body weight should be used to predict BMR across
 * groups of differing body size and composition. So when Mango knows body fat,
 * the right move is not to correct a weight-based equation — it is to stop
 * using one.
 * @source CUNNINGHAM_1980, SOAR_1993
 */
export const CUNNINGHAM = { intercept: 500, perKgFFM: 22 } as const;

/**
 * Physical activity levels.
 *
 * FAO/WHO/UNU put the range sustainable by free-living adults at 1.40–2.40,
 * with sedentary/light 1.40–1.69, active 1.70–1.99 and vigorous 2.00–2.40.
 * The values Mango shipped before this (1.2 for sedentary) sat below that
 * entire range — 1.2 describes bed rest, not a desk job — and the error then
 * compounded with the deficit applied on top.
 * @source FAO_2004
 */
export const PAL = {
  sedentary: 1.45,
  light: 1.55,
  walking: 1.65,
  cycling: 1.75,
  gym: 1.75,
  running: 1.85,
  sports: 1.95,
  very_active: 2.1,
} as const;

/** The band each level sits in, shown to the user. @source FAO_2004 */
export const PAL_BAND: Record<keyof typeof PAL, [number, number]> = {
  sedentary: [1.4, 1.69],
  light: [1.4, 1.69],
  walking: [1.4, 1.69],
  cycling: [1.7, 1.99],
  gym: [1.7, 1.99],
  running: [1.7, 1.99],
  sports: [1.7, 1.99],
  very_active: [2.0, 2.4],
};

/** The floor of the FAO range — the part of a PAL that is not exercise. */
export const PAL_FLOOR = 1.4;

/**
 * Reported scatter of the best-performing equation in a South Asian cohort
 * (bias −170 ± 102 kcal/day). Used as the published uncertainty on a
 * population BMR estimate rather than a statistic computed here.
 * @source WIJESINGHE_2021
 */
export const BMR_SD_KCAL = 102;

/* ------------------------------ weight change ---------------------------- */

/**
 * Deficit bounds. The middle one is the one that matters: a 50 kg person and
 * a 95 kg person should not both be asked for 500 kcal.
 *
 * NICE removed its own 600 kcal/day deficit recommendation on the grounds that
 * it was "an arbitrarily specific number", which is exactly what a flat cap is.
 * @source NICE_2025, PRODUCT_JUDGEMENT
 */
export const DEFICIT = {
  fractionOfTdee: 0.2,
  /** kcal/day per kg of body weight — about 0.25% of body weight per week */
  kcalPerKgPerDay: 25 / 7,
  absoluteCap: 750,
} as const;

/** Surplus for muscle gain. A range, because the evidence does not support a point. */
export const SURPLUS = { minFraction: 0.1, maxFraction: 0.2, absoluteCap: 400 } as const;

/**
 * The safety floor, relative to the person rather than fixed.
 *
 * The old fixed floors (male 1500 / female 1200 / other 1300) had no source,
 * and 1,200 in particular is not a safety floor at all: NICE classifies
 * 800–1,200 kcal/day as a low-calorie diet requiring specialist dietetic
 * supervision and a 12-week maximum. Mango was landing unsupervised users on
 * that number and calling it the safe option.
 * @source NICE_2025
 */
export const FLOOR = {
  /** never below this multiple of the person's own BMR */
  bmrMultiple: 1.1,
  /** and never below this in absolute terms, which sits clear of NICE's band */
  absolute: 1400,
} as const;

/**
 * Above this the equations are extrapolating far past where they were
 * validated. A guard, not a finding.
 * @source PRODUCT_JUDGEMENT
 */
export const CEILING_KCAL = 5000;

/* --------------------------------- macros -------------------------------- */

/**
 * ISSN: 1.4–2.0 g/kg/day is sufficient for most exercising individuals;
 * hypocaloric conditions are discussed at 1.6 g/kg (2× RDA) and 2.4 g/kg
 * (3× RDA); the per-dose recommendation is 0.25 g/kg or 20–40 g absolute.
 * @source ISSN_PROTEIN
 */
export const PROTEIN = {
  wellness: 1.3,
  performance: 1.6,
  fatLoss: 1.8,
  muscleGain: 2.0,
  /** ISSN per-meal dose */
  perMealGPerKg: 0.25,
  perMealMinG: 20,
  perMealMaxG: 40,
  /** guards, not targets */
  absoluteMinG: 40,
  absoluteMaxG: 220,
  /** above this BMI, g/kg is taken on adjusted body weight */
  adjustAboveBmi: 30,
  adjustFactor: 0.4,
} as const;

/**
 * Dietary fat as a floor rather than a share of energy.
 *
 * The previous rule took 27% of the calorie target. In a deficit that is a
 * percentage of a deliberately suppressed number, and dietary fat has an
 * absolute requirement that does not shrink because someone is dieting.
 * @source PRODUCT_JUDGEMENT
 */
export const FAT = { gPerKgFloor: 0.8, fractionFloor: 0.2 } as const;

/** Carbohydrate is the remainder, with a floor to keep the brain fuelled. */
export const CARB_MIN_G = 100;

/**
 * 14 g per 1,000 kcal is the IOM/NASEM Adequate Intake, derived from evidence
 * on protection against coronary heart disease — roughly 25 g/day for women
 * and 38 g/day for men. The coefficient is correct and unchanged; what changed
 * is that it is now applied to maintenance rather than to the deficit target,
 * so the fibre goal does not fall exactly when satiety matters most.
 * @source IOM_FIBRE
 */
export const FIBRE_G_PER_1000_KCAL = 14;

/** Macro energy densities. Arithmetic, not a finding. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Macros must reconcile with the calorie target to within this. */
export const MACRO_RECONCILE_TOLERANCE_KCAL = 20;

/* -------------------------------- exercise ------------------------------- */

/** Compendium-consistent MET values for the activity logger. */
export const MET: Record<string, number> = {
  walking: 3.5, running: 9.8, cycling: 7.5, gym: 6.0, yoga: 3.0,
  sports: 7.0, other: 4.0, sedentary: 1.5, light: 2.5, very_active: 8.0,
};

/**
 * MET values are population averages applied to one person, so a burn figure
 * is a range. ±30% is a rule of thumb, labelled as such — not a confidence
 * interval, because no interval was computed.
 * @source PRODUCT_JUDGEMENT
 */
export const BURN_RELATIVE_ERROR = 0.3;

/**
 * Share of genuinely-extra burn credited back. Half, because burn estimates
 * run high in a known direction; capped, because one long session should not
 * licence a second dinner.
 * @source PRODUCT_JUDGEMENT
 */
export const EXERCISE_CREDIT = { fraction: 0.5, capKcal: 400 } as const;

/* ---------------------------------- BMI ---------------------------------- */

/**
 * India's obesity definition was revised in 2024 into a staged framework.
 * The important property is that Stage 2 requires functional impairment or
 * comorbidity in addition to BMI — BMI alone does not diagnose obesity, which
 * is why this app prints a band and never a diagnosis.
 * @source INDIA_OBESITY_2024
 */
export const BMI_BANDS = [
  { max: 18.5, label: 'Below the healthy range' },
  { max: 23, label: 'Healthy range' },
  { max: 25, label: 'Raised — grade I' },
  { max: 27.6, label: 'Raised — grade II' },
  { max: 32.5, label: 'Raised — grade III' },
  { max: Infinity, label: 'Raised — grade IV' },
] as const;

/** Abdominal adiposity cut-offs. @source INDIA_OBESITY_2024 */
export const WAIST = {
  maleCm: 90,
  femaleCm: 80,
  waistToHeight: 0.5,
} as const;

/* -------------------------------- adaptive ------------------------------- */

/**
 * Learning maintenance from the user's own data.
 *
 * ENERGY_PER_KG is deliberately NOT 7,700. That figure is the 3,500 kcal/lb
 * rule in metric dress, and that rule "grossly overestimates actual weight
 * loss" because it treats weight change as linear and ignores adaptation. It
 * is used here only as a bounded prior, with the observed data given more
 * weight as it accumulates.
 * @source HALL_2013, PRODUCT_JUDGEMENT
 */
export const ADAPTIVE = {
  minDays: 14,
  minLoggedDays: 10,
  minWeighIns: 4,
  /** EWMA half-life in days for the weight trend */
  trendHalfLifeDays: 10,
  energyPerKgPrior: 7700,
  /** days of data at which the observed estimate fully outweighs the equation */
  fullWeightAtDays: 56,
  /** the observed estimate never takes more than this share */
  maxObservedWeight: 0.8,
  /** a recalibration may not move the estimate by more than this fraction */
  maxMovePerRecalibration: 0.1,
  /** minimum days between recalibrations */
  recalibrationIntervalDays: 14,
  /** early in a deficit, glycogen and water dominate the scale */
  suppressFirstDaysOfDeficit: 14,
} as const;
