import { FAT, CARB_MIN_G, KCAL_PER_G, FIBRE_G_PER_1000_KCAL, MACRO_RECONCILE_TOLERANCE_KCAL } from './constants';

/* ============================================================
   Macros.

   The old sequence was protein, then fat at a flat 27% of the
   calorie target, then carbohydrate as the remainder. In a
   deficit that makes fat a percentage of a number being
   deliberately suppressed, and dietary fat has a requirement
   that does not shrink because someone is dieting. So fat is now
   a floor — the greater of 0.8 g/kg and 20% of energy.

   Fibre keeps the coefficient it had, because 14 g per 1,000
   kcal is the IOM Adequate Intake and it is correct. What
   changed is what it scales to: maintenance rather than the
   deficit target, so the fibre goal does not fall at exactly the
   moment satiety matters most.
   ============================================================ */

export interface MacroSplit {
  protein: number;
  fat: number;
  carbs: number;
  fibre: number;
  /** |4P + 4C + 9F − kcal|, which must stay inside tolerance */
  reconcileError: number;
  notes: string[];
}

export function macrosFor(args: {
  kcal: number;
  maintenanceKcal: number;
  proteinG: number;
  weightKg: number;
}): MacroSplit {
  const notes: string[] = [];
  const protein = Math.round(args.proteinG);

  const fatFloorFromWeight = args.weightKg * FAT.gPerKgFloor;
  const fatFloorFromEnergy = (args.kcal * FAT.fractionFloor) / KCAL_PER_G.fat;
  let fat = Math.round(Math.max(fatFloorFromWeight, fatFloorFromEnergy));
  if (fatFloorFromWeight > fatFloorFromEnergy) {
    notes.push(`Fat held at ${fat} g — 0.8 g per kg — rather than a share of the target, so a deficit does not push it below what the body needs to absorb fat-soluble vitamins.`);
  }

  let carbs = Math.round((args.kcal - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs);

  /* A hard floor on carbohydrate can only be honoured by taking energy from
     somewhere. Fat above its own floor is the only place left, and if there
     is nothing to take, the shortfall is reported rather than hidden. */
  if (carbs < CARB_MIN_G) {
    const shortfallKcal = (CARB_MIN_G - carbs) * KCAL_PER_G.carbs;
    const fatFloorG = Math.ceil(Math.max(fatFloorFromWeight, (args.kcal * 0.15) / KCAL_PER_G.fat));
    const canTakeG = Math.max(0, fat - fatFloorG);
    const takeG = Math.min(canTakeG, Math.ceil(shortfallKcal / KCAL_PER_G.fat));
    if (takeG > 0) {
      fat -= takeG;
      carbs = Math.round((args.kcal - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs);
      notes.push(`Carbohydrate was below ${CARB_MIN_G} g, so some of the fat allowance was moved across.`);
    }
    if (carbs < CARB_MIN_G) {
      carbs = CARB_MIN_G;
      notes.push(`At this calorie level the three macros cannot all be met. Carbohydrate is held at ${CARB_MIN_G} g and the totals will not add up exactly — worth raising the target, or talking to a dietitian.`);
    }
  }

  /* Fibre scales with maintenance, not with the target. */
  const fibre = Math.round((Math.max(args.maintenanceKcal, args.kcal) / 1000) * FIBRE_G_PER_1000_KCAL);

  const reconcileError = Math.abs(
    protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat - args.kcal,
  );

  return { protein, fat, carbs, fibre, reconcileError, notes };
}

export const macrosReconcile = (m: MacroSplit): boolean =>
  m.reconcileError <= MACRO_RECONCILE_TOLERANCE_KCAL;
