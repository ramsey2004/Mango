import type { NutritionState, Nutrients, MealSlot, DayPlan } from '../lib/nutrition-types';
import { RECIPES, recipeById } from '../lib/recipe-db';
import { targetsFor, sumNutrients, roundN, type Targets } from './calories';
import { todayISO, toISODate, addDays, clamp } from '../lib/util';

/* ============================================================
   Derived reads over nutrition state. One place, so the coach,
   the dashboard and the charts can never disagree with each other.
   ============================================================ */

export const EMPTY: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };

export const consumedOn = (n: NutritionState, date = todayISO()): Nutrients =>
  roundN(sumNutrients(n.logs.filter((l) => l.date === date)));

export const burnedOn = (n: NutritionState, date = todayISO()): number =>
  allowedExercise(n).filter((e) => e.date === date).reduce((s, e) => s + e.kcalBurned, 0);

export const waterOn = (n: NutritionState, date = todayISO()): number =>
  n.water.filter((w) => w.date === date).reduce((s, w) => s + w.ml, 0);

/** Exercise rows the user has actually consented to the engine using. */
export const allowedExercise = (n: NutritionState) =>
  n.exercise.filter((e) => (e.simulated ? n.dataConsent.wearable : n.dataConsent.activity));

export const trainedOn = (n: NutritionState, date = todayISO()): boolean =>
  allowedExercise(n).some((e) => e.date === date && e.minutes >= 20 && e.kind !== 'sedentary');

/** The kitchen list, or nothing at all when the user has switched that off. */
export const pantryFor = (n: NutritionState): string[] =>
  n.dataConsent.grocery ? n.pantry.map((p) => p.name) : [];

/** Kitchen items with an expiry inside the next `days` days, soonest first. */
export function expiringSoon(n: NutritionState, days = 3) {
  if (!n.dataConsent.grocery) return [];
  const limit = toISODate(addDays(new Date(), days));
  const today = todayISO();
  return n.pantry
    .filter((p) => p.expiresOn && p.expiresOn <= limit)
    .sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1))
    .map((p) => ({ ...p, expired: p.expiresOn! < today }));
}

/**
 * The day's targets, including any credit for training actually logged.
 * Everything downstream — remaining macros, the plan, the coach — reads this,
 * so a hard session moves the whole day rather than just a label.
 */
export function targets(n: NutritionState, date = todayISO()): Targets | null {
  if (!n.profile) return null;
  return targetsFor(n.profile, burnedOn(n, date));
}

/** The same numbers with training ignored, for showing the two side by side. */
export const restDayTargets = (n: NutritionState): Targets | null =>
  n.profile ? targetsFor(n.profile) : null;

export function remainingOn(n: NutritionState, date = todayISO()): Nutrients {
  const t = targets(n, date);
  if (!t) return EMPTY;
  const c = consumedOn(n, date);
  return {
    kcal: Math.round(t.kcal - c.kcal),
    protein: Math.round(t.protein - c.protein),
    carbs: Math.round(t.carbs - c.carbs),
    fat: Math.round(t.fat - c.fat),
    fibre: Math.round(t.fibre - c.fibre),
  };
}

export const planFor = (n: NutritionState, date = todayISO()): DayPlan | undefined =>
  n.plans.find((p) => p.date === date);

export function spentOn(n: NutritionState, date = todayISO()): number {
  const plan = planFor(n, date);
  if (!plan) return 0;
  return plan.meals.reduce((s, m) => s + (recipeById(m.recipeId, n.customRecipes)?.costRupees ?? 0), 0);
}

export function budgetLeft(n: NutritionState, date = todayISO()): number {
  if (!n.profile) return 0;
  const eatenPlanned = planFor(n, date)?.meals.filter((m) => m.eaten) ?? [];
  const spent = eatenPlanned.reduce((s, m) => s + (recipeById(m.recipeId, n.customRecipes)?.costRupees ?? 0), 0);
  return Math.max(0, n.profile.budgetPerDay - spent);
}

/** Recipe ids eaten or planned in the last N days, most recent first. */
export function recentRecipeIds(n: NutritionState, days = 4): string[] {
  const out: string[] = [];
  const today = todayISO();
  for (let i = 0; i < days; i++) {
    const d = toISODate(addDays(new Date(), -i));
    // Today's own plan is not history. Counting it would make every meal the
    // engine just chose look like a repeat of itself.
    if (d !== today) {
      for (const m of planFor(n, d)?.meals ?? []) if (!out.includes(m.recipeId)) out.push(m.recipeId);
    } else {
      for (const m of planFor(n, d)?.meals ?? []) if (m.eaten && !out.includes(m.recipeId)) out.push(m.recipeId);
    }
    for (const l of n.logs.filter((x) => x.date === d && x.sourceKind === 'recipe')) {
      if (l.sourceId && !out.includes(l.sourceId)) out.push(l.sourceId);
    }
  }
  return out;
}

/* --------------------------- consistency score ---------------------------- */

export interface Consistency {
  score: number;
  parts: Array<{ label: string; value: number; max: number; detail: string }>;
  trend: Array<{ date: string; score: number }>;
  message: string;
}

/** Scores the last seven days on the behaviours that actually predict adherence. */
export function consistency(n: NutritionState): Consistency {
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(), -(6 - i))));
  const t = targets(n);

  const loggedDays = days.filter((d) => n.logs.some((l) => l.date === d)).length;
  const logging = Math.round((loggedDays / 7) * 30);

  const withinDays = t
    ? days.filter((d) => {
        const c = consumedOn(n, d).kcal;
        return c > 0 && Math.abs(c - t.kcal) <= t.kcal * 0.15;
      }).length
    : 0;
  const adherence = Math.round((withinDays / 7) * 25);

  const proteinDays = t ? days.filter((d) => consumedOn(n, d).protein >= t.protein * 0.8).length : 0;
  const protein = Math.round((proteinDays / 7) * 15);

  const ex = allowedExercise(n);
  const activeDays = days.filter((d) => ex.some((e) => e.date === d && e.minutes >= 20)).length;
  const activity = Math.round((activeDays / 7) * 15);

  const waterDays = days.filter((d) => waterOn(n, d) >= n.waterGoalMl * 0.8).length;
  const water = Math.round((waterDays / 7) * 15);

  const score = clamp(logging + adherence + protein + activity + water, 0, 100);

  const trend = days.map((d, i) => {
    const upto = days.slice(0, i + 1);
    const l = upto.filter((x) => n.logs.some((g) => g.date === x)).length / upto.length;
    const a = upto.filter((x) => ex.some((e) => e.date === x && e.minutes >= 20)).length / upto.length;
    const w = upto.filter((x) => waterOn(n, x) >= n.waterGoalMl * 0.8).length / upto.length;
    return { date: d.slice(5), score: Math.round((l * 0.45 + a * 0.3 + w * 0.25) * 100) };
  });

  const message =
    score >= 80 ? 'This is a routine, not an effort. Keep it boring.'
    : score >= 60 ? 'You are building a strong routine. The gaps are small and fixable.'
    : score >= 35 ? 'The habit is forming but it is patchy. Logging every day is the cheapest way to lift this.'
    : loggedDays === 0 ? 'Nothing logged this week — the score fills in as you use the app.'
    : 'Early days. Pick one thing — logging, or water — and hold it for a week.';

  return {
    score,
    parts: [
      { label: 'Food logged', value: logging, max: 30, detail: `${loggedDays} of 7 days` },
      { label: 'Calories on target', value: adherence, max: 25, detail: `${withinDays} of 7 days within 15%` },
      { label: 'Protein hit', value: protein, max: 15, detail: `${proteinDays} of 7 days` },
      { label: 'Activity', value: activity, max: 15, detail: `${activeDays} of 7 days` },
      { label: 'Water', value: water, max: 15, detail: `${waterDays} of 7 days` },
    ],
    trend,
    message,
  };
}

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export const currentSlot = (): MealSlot => {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
};
