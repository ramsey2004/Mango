import type { NutritionProfile, Nutrients } from '../../lib/nutrition-types';
import { DEFICIT, SURPLUS, FLOOR, CEILING_KCAL } from './constants';
import { gate, type Gate } from './safety';
import { bmrEstimate, tdeeEstimate } from './energy';
import { proteinEstimate, perMealProtein } from './protein';
import { macrosFor } from './macros';
import { exerciseCredit } from './exercise';
import { shift, bound, type Estimate } from './uncertainty';

export * from './constants';
export * from './uncertainty';
export * from './methodology';
export * from './energy';
export * from './bmi';
export * from './protein';
export * from './macros';
export * from './exercise';
export * from './safety';
export * from './adaptive';

/* ============================================================
   The day's targets.

   Order matters and is fixed: the gate runs first and can stop
   everything; energy is estimated with its band; the deficit is
   bounded three ways; the floor is applied relative to the
   person; macros are derived last and must reconcile.

   The visible change from the old engine is that `kcal` is still
   a plain number — the interface needs something to put on a
   ring — but every number now also arrives as an Estimate, so
   the band is one tap away rather than absent.
   ============================================================ */

export interface HealthTargets extends Nutrients {
  /* ---- the plain numbers the existing UI consumes ---- */
  bmr: number;
  tdee: number;
  adjustment: number;
  note: string;
  floored: boolean;
  capped: boolean;
  activityCredit: number;
  restDayKcal: number;
  activityNote?: string;
  usable: boolean;
  missing: Array<'weight' | 'height' | 'age'>;
  clamped: string[];
  minor: boolean;

  /* ---- the honest versions ---- */
  bmrEstimate: Estimate;
  tdeeEstimate: Estimate;
  kcalEstimate: Estimate;
  proteinEstimate: Estimate;
  perMealProteinG: number;
  perMealProteinWhy: string;
  gate: Gate;
  macroNotes: string[];
  reconcileError: number;
  /** why the deficit is the size it is, in words */
  deficitWhy?: string;
}

export function healthTargets(raw: NutritionProfile, burnedToday = 0): HealthTargets {
  const g = gate(raw);
  const p = g.safe;

  const bmrE = bmrEstimate(p);
  const tdeeE = tdeeEstimate(p);
  const maintenance = tdeeE.value;

  /* ------------------------------ adjustment ----------------------------- */

  let adjustment = 0;
  let note = 'Holding at maintenance.';
  let deficitWhy: string | undefined;

  if (g.noDeficit) {
    adjustment = 0;
    note = g.reason ?? 'Held at maintenance.';
  } else if (p.track === 'fat_loss') {
    const byFraction = maintenance * DEFICIT.fractionOfTdee;
    const byBodyWeight = p.weightKg * DEFICIT.kcalPerKgPerDay;
    const chosen = Math.min(byFraction, byBodyWeight, DEFICIT.absoluteCap);
    adjustment = -Math.round(chosen);

    const binding =
      chosen === byBodyWeight ? 'your body weight'
        : chosen === byFraction ? 'a fifth of your maintenance'
          : 'the absolute cap';
    deficitWhy = `A deficit of ${Math.round(chosen)} kcal, set by ${binding}. Mango bounds it three ways — a share of maintenance, a rate relative to your body weight, and a hard ceiling — because a flat number asks far more of a 50 kg person than a 95 kg one.`;
    note = 'A moderate deficit. Mango will tell you your actual rate of change once it has a few weeks of your weight data, rather than predicting one now.';
  } else if (p.track === 'muscle_gain') {
    const lo = maintenance * SURPLUS.minFraction;
    const hi = Math.min(maintenance * SURPLUS.maxFraction, SURPLUS.absoluteCap);
    adjustment = Math.round(Math.min(hi, Math.max(lo, maintenance * 0.12)));
    deficitWhy = `A surplus of ${adjustment} kcal, inside a ${Math.round(lo)}–${Math.round(hi)} range. A bigger surplus is not faster muscle, it is faster fat — how much of a gain is lean depends on training, not on the size of the surplus.`;
    note = 'A small surplus, enough to build without unnecessary fat gain.';
  } else {
    note = 'Maintenance, with the emphasis on protein and fibre rather than the number.';
  }

  const restDayKcal = maintenance + adjustment;

  /* ------------------------------- exercise ------------------------------ */

  const credit = exerciseCredit(p, burnedToday);
  let kcal = restDayKcal + credit.credit;

  /* --------------------------- floor and ceiling ------------------------- */

  const floor = Math.max(FLOOR.absolute, Math.round(bmrE.value * FLOOR.bmrMultiple));
  const floored = kcal < floor;
  if (floored) {
    kcal = floor;
    note = `Held at ${floor} kcal. That floor is ${FLOOR.bmrMultiple}× your own resting estimate, never below ${FLOOR.absolute} — below roughly this level a diet stops being something to run unsupervised, and Mango will not take you there.`;
  }
  const capped = kcal > CEILING_KCAL;
  if (capped) {
    kcal = CEILING_KCAL;
    note = `Held at ${CEILING_KCAL} kcal. Above this the estimate is extrapolating well past where these equations were validated — worth confirming with a dietitian rather than trusting an app.`;
  }

  if (g.verdict === 'estimate' && g.reason) note = `${note} ${g.reason}`;

  /* -------------------------------- macros ------------------------------- */

  const proteinE = proteinEstimate(p);
  const perMeal = perMealProtein(p);
  const m = macrosFor({
    kcal,
    maintenanceKcal: maintenance,
    proteinG: proteinE.value,
    weightKg: p.weightKg,
  });

  /* ------------------------------ the bands ------------------------------ */

  const kcalE = bound(
    shift(
      tdeeE,
      adjustment + credit.credit,
      adjustment === 0
        ? 'Your maintenance estimate, unchanged.'
        : `Your maintenance estimate ${adjustment < 0 ? 'minus' : 'plus'} ${Math.abs(adjustment)} kcal for your goal.`,
    ),
    floor,
    CEILING_KCAL,
  );

  return {
    kcal: Math.round(kcal),
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    fibre: m.fibre,

    bmr: bmrE.value,
    tdee: maintenance,
    adjustment,
    note,
    floored,
    capped,
    activityCredit: credit.credit,
    restDayKcal: Math.round(restDayKcal),
    activityNote: credit.note,
    usable: g.verdict !== 'ask',
    missing: g.missing,
    clamped: g.clamped,
    minor: g.minor,

    bmrEstimate: bmrE,
    tdeeEstimate: tdeeE,
    kcalEstimate: g.wideBand
      ? { ...kcalE, band: [Math.round(kcalE.band[0] * 0.92), Math.round(kcalE.band[1] * 1.08)], confidence: 'low' }
      : kcalE,
    proteinEstimate: proteinE,
    perMealProteinG: perMeal.grams,
    perMealProteinWhy: perMeal.why,
    gate: g,
    macroNotes: m.notes,
    reconcileError: m.reconcileError,
    deficitWhy,
  };
}
