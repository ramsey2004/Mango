import type {
  Recipe, NutritionProfile, NutritionState, MealSlot, Nutrients, DayPlan, PlannedMeal, MealFeedback, GoalKey,
} from '../lib/nutrition-types';
import { TRACK_LABEL } from '../lib/nutrition-types';
import { RECIPES } from '../lib/recipe-db';
import { sameIngredient, resolveIngredient, ingredientCost } from '../lib/ingredient-db';
import { formatMins } from '../lib/util';
import { targetsFor } from './calories';
import { uid, now, todayISO, clamp } from '../lib/util';

/* ============================================================
   The contextual recommender — the part the whole product turns on.

   A generic app maps goal → diet plan and leaves execution to the
   user. This maps

     goal → macros left → time → budget → pantry → activity →
     taste history → what was rejected → what was eaten recently

   into one ranked list, and can explain every position in it.
   Hard constraints filter; everything else is a weighted score.
   ============================================================ */

export interface Ctx {
  profile: NutritionProfile;
  slot: MealSlot;
  /** what is left of the day's targets at the moment of asking */
  remaining: Nutrients;
  /** share of the day this meal should carry, 0–1 */
  slotShare: number;
  budgetLeft: number;
  minutesAvailable: number;
  pantry: string[];
  /** kitchen items dated to go off within a few days — worth cooking first */
  useSoon?: string[];
  trainedToday: boolean;
  recentRecipeIds: string[];
  feedback: MealFeedback[];
  rejected: string[];
  /** >1 when protein is lagging behind calories for the day. Set by the caller. */
  proteinUrgency?: number;
}

export interface Reason { label: string; delta: number }
export interface Suggestion {
  recipe: Recipe;
  score: number;
  reasons: Reason[];
  /** ingredients from the pantry this uses */
  usesFromPantry: string[];
}

const norm = (s: string) => s.toLowerCase().trim();

/** Hard constraints. A recommendation that breaks one of these is not a recommendation. */
export function isEligible(r: Recipe, p: NutritionProfile): { ok: boolean; why?: string } {
  if (p.diet === 'vegan' && !r.vegan) return { ok: false, why: 'not vegan' };
  if (p.diet === 'vegetarian' && (!r.veg || r.egg)) return { ok: false, why: 'not vegetarian' };
  if (p.diet === 'eggetarian' && !r.veg && !r.egg) return { ok: false, why: 'contains meat' };
  if (p.diet === 'jain' && !r.jainSafe) return { ok: false, why: 'not Jain-friendly' };

  const text = norm([r.name, ...r.ingredients.map((i) => i.name), ...r.tags].join(' '));
  for (const a of p.allergies) {
    if (a.trim() && text.includes(norm(a))) return { ok: false, why: `contains ${a}` };
  }
  for (const rs of p.restrictions) {
    if (rs.trim() && text.includes(norm(rs))) return { ok: false, why: `you avoid ${rs}` };
  }

  // Where you cook is a hard constraint, not a preference. Recommending a
  // forty-minute saag to someone in a hostel room with a kettle is not a
  // recommendation, it is a list.
  if (!r.kitchens.includes(p.kitchen)) {
    const where = p.kitchen === 'hostel' ? 'a hostel kitchen'
      : p.kitchen === 'office' ? 'an office'
      : p.kitchen === 'pg' ? 'a PG kitchen'
      : 'your kitchen';
    return { ok: false, why: `needs more than ${where} can do` };
  }
  return { ok: true };
}

export function scoreRecipe(r: Recipe, c: Ctx): Suggestion | null {
  if (!isEligible(r, c.profile).ok) return null;
  if (!r.slots.includes(c.slot)) return null;

  const reasons: Reason[] = [];
  let score = 50;

  /* ---- energy fit: how close to what this slot should carry ---- */
  const wantKcal = Math.max(150, c.remaining.kcal * c.slotShare);
  const kcalGap = Math.abs(r.kcal - wantKcal) / Math.max(1, wantKcal);
  const kcalDelta = Math.round((1 - clamp(kcalGap, 0, 1)) * 26 - 6);
  score += kcalDelta;
  reasons.push({
    label:
      kcalGap < 0.15 ? `Lands close to the ${Math.round(wantKcal)} kcal this meal should carry`
      : r.kcal > wantKcal ? 'Heavier than this slot needs'
      : 'Lighter than this slot needs',
    delta: kcalDelta,
  });

  /* ---- protein: the macro people actually fall short on ---- */
  const proteinNeed = Math.max(0, c.remaining.protein * c.slotShare);
  const urgency = clamp(c.proteinUrgency ?? 1, 0.6, 2.2);
  if (proteinNeed > 0) {
    const cover = clamp(r.protein / proteinNeed, 0, 1.4);
    const d = Math.round(cover * 22 * urgency - 6 * urgency);
    score += d;
    if (d > 8) {
      reasons.push({
        label:
          urgency > 1.25
            ? `${r.protein} g protein — and protein is the thing lagging today`
            : `${r.protein} g protein — covers most of what this meal should carry`,
        delta: d,
      });
    } else if (d < 0) {
      reasons.push({ label: 'Light on protein for what you still need', delta: d });
    }
  }

  /* ---- fibre, quietly, because nobody hits it ---- */
  if (c.remaining.fibre > 10 && r.fibre >= 8) {
    score += 5;
    reasons.push({ label: `${r.fibre} g fibre`, delta: 5 });
  }

  /* ---- time available: the single biggest reason plans fail ---- */
  if (r.prepMins <= c.minutesAvailable) {
    const spare = c.minutesAvailable - r.prepMins;
    const d = spare > 15 ? 12 : 8;
    score += d;
    reasons.push({ label: `${r.prepMins} min — fits the ${c.minutesAvailable} you have`, delta: d });
  } else {
    const over = r.prepMins - c.minutesAvailable;
    const d = -Math.min(30, 6 + over);
    score += d;
    reasons.push({ label: `Needs ${r.prepMins} min, ${over} more than you have`, delta: d });
  }

  /* ---- budget ---- */
  if (r.costRupees <= c.budgetLeft) {
    const d = r.costRupees <= c.budgetLeft * 0.6 ? 10 : 6;
    score += d;
    reasons.push({ label: `₹${r.costRupees} against ₹${Math.round(c.budgetLeft)} left today`, delta: d });
  } else {
    const d = -Math.min(28, 8 + Math.round((r.costRupees - c.budgetLeft) / 10));
    score += d;
    reasons.push({ label: `₹${r.costRupees} is over the ₹${Math.round(c.budgetLeft)} you have left`, delta: d });
  }

  /* ---- what is already in the kitchen ---- */
  const pantry = c.pantry.map((p) => p.trim()).filter(Boolean);
  const usesFromPantry = r.ingredients
    .filter((i) => pantry.some((p) => sameIngredient(p, i.name)))
    .map((i) => i.name);
  if (pantry.length && usesFromPantry.length) {
    const share = usesFromPantry.length / r.ingredients.length;
    const d = Math.round(share * 26);
    score += d;
    reasons.push({ label: `Uses ${usesFromPantry.join(', ')} — already in your kitchen`, delta: d });
  }

  /* ---- things about to go off ----
     Cooking what is about to spoil is the cheapest possible win, so it is
     weighted above ordinary pantry overlap. */
  const soon = (c.useSoon ?? []).map((p) => p.trim()).filter(Boolean);
  const usesSoon = soon.length
    ? r.ingredients.filter((i) => soon.some((p) => sameIngredient(p, i.name))).map((i) => i.name)
    : [];
  if (usesSoon.length) {
    const d = Math.min(30, 16 + usesSoon.length * 7);
    score += d;
    reasons.push({ label: `Uses ${usesSoon.join(', ')} before it goes off`, delta: d });
  }

  /* ---- goal alignment ---- */
  if (r.goalTags.includes(c.profile.track as GoalKey)) {
    score += 9;
    reasons.push({ label: `Suits ${TRACK_LABEL[c.profile.track]}`, delta: 9 });
  }

  /* ---- cuisine and taste ---- */
  if (c.profile.cuisines.includes(r.cuisine)) {
    score += 7;
    reasons.push({ label: `${r.cuisine}, which you said you like`, delta: 7 });
  }
  const nameAndTags = norm([r.name, ...r.tags, ...r.tasteTags, ...r.ingredients.map((i) => i.name)].join(' '));
  for (const like of c.profile.likes) {
    if (like.trim() && nameAndTags.includes(norm(like))) {
      score += 6;
      reasons.push({ label: `Has ${like}`, delta: 6 });
      break;
    }
  }
  for (const dis of c.profile.dislikes) {
    if (dis.trim() && nameAndTags.includes(norm(dis))) {
      score -= 30;
      reasons.push({ label: `Contains ${dis}, which you do not like`, delta: -30 });
      break;
    }
  }

  /* ---- training load ---- */
  if (c.trainedToday) {
    if (r.protein >= 25) {
      score += 8;
      reasons.push({ label: 'Protein-forward, and you trained today', delta: 8 });
    }
    if (r.tags.includes('post-workout')) score += 3;
  }

  /* ---- learned behaviour: the feedback loop ---- */
  const fb = c.feedback.filter((f) => f.recipeId === r.id);
  const loved = fb.filter((f) => f.verdict === 'loved').length;
  const disliked = fb.filter((f) => f.verdict === 'disliked').length;
  if (loved) {
    const d = Math.min(18, loved * 9);
    score += d;
    reasons.push({ label: `You have rated this well ${loved} time${loved > 1 ? 's' : ''}`, delta: d });
  }
  if (disliked) {
    const d = -Math.min(45, disliked * 22);
    score += d;
    reasons.push({ label: 'You have turned this down before', delta: d });
  }
  if (c.rejected.includes(r.id)) {
    score -= 25;
    reasons.push({ label: 'You swapped away from this recently', delta: -25 });
  }

  /* ---- ingredient-level learning: dislike the thing, not just the dish ---- */
  const dislikedIngredients = new Map<string, number>();
  for (const f of c.feedback.filter((x) => x.verdict === 'disliked')) {
    const src = RECIPES.find((x) => x.id === f.recipeId);
    src?.ingredients.forEach((i) => dislikedIngredients.set(norm(i.name), (dislikedIngredients.get(norm(i.name)) ?? 0) + 1));
  }
  const repeatedlyRejected = [...dislikedIngredients.entries()].filter(([, n]) => n >= 2).map(([k]) => k);
  const hit = r.ingredients.find((i) => repeatedlyRejected.includes(norm(i.name)));
  if (hit) {
    score -= 14;
    reasons.push({ label: `You keep turning down meals with ${hit.name}`, delta: -14 });
  }

  /* ---- variety ---- */
  const recentIdx = c.recentRecipeIds.indexOf(r.id);
  if (recentIdx >= 0) {
    const d = -Math.max(8, 26 - recentIdx * 4);
    score += d;
    reasons.push({ label: 'You have eaten this in the last few days', delta: d });
  }

  /* ---- goal track ----
     Three tracks, not conditions. Each weights the same recipe differently
     because the same meal is a good idea for one goal and a poor one for
     another. Nothing here is a medical judgement. */
  if (c.profile.track === 'fat_loss') {
    // Protein per calorie is what keeps a deficit tolerable.
    const density = r.kcal > 0 ? (r.protein * 4) / r.kcal : 0;
    if (density >= 0.28) {
      score += 14;
      reasons.push({ label: 'High protein for its calories — keeps a deficit liveable', delta: 14 });
    } else if (density < 0.12 && r.kcal > 420) {
      score -= 12;
      reasons.push({ label: 'Calorie-heavy without much protein', delta: -12 });
    }
    if (r.fibre >= 7) {
      score += 8;
      reasons.push({ label: `Filling — ${Math.round(r.fibre)}g fibre`, delta: 8 });
    }
  } else if (c.profile.track === 'muscle_gain') {
    if (r.protein >= 25) {
      score += 15;
      reasons.push({ label: `${Math.round(r.protein)}g protein in one meal`, delta: 15 });
    } else if (r.protein < 12) {
      score -= 10;
      reasons.push({ label: 'Light on protein for a muscle-gain week', delta: -10 });
    }
  } else {
    // Wellness: steady energy and fibre, no aggressive macro shaping.
    if (r.fibre >= 6) {
      score += 8;
      reasons.push({ label: `Good fibre — ${Math.round(r.fibre)}g`, delta: 8 });
    }
    if (r.gi !== undefined && r.gi >= 75) {
      score -= 8;
      reasons.push({ label: 'Digests fast, so energy dips sooner', delta: -8 });
    }
  }

  /* ---- how filling it is ----
     A fat-loss day is won or lost on whether you are hungry an hour later. */
  if (c.profile.track === 'fat_loss' && r.satiety === 3) {
    score += 8;
    reasons.push({ label: 'Filling enough to hold you to the next meal', delta: 8 });
  }

  /* ---- where you will actually eat it ---- */
  if ((c.profile.kitchen === 'office' || c.profile.occupation === 'professional') && c.slot === 'lunch' && r.portable) {
    score += 7;
    reasons.push({ label: 'Travels in a box without going soggy', delta: 7 });
  }

  /* ---- cooking skill ---- */
  if (r.difficulty > c.profile.cookingSkill) {
    const d = -8 * (r.difficulty - c.profile.cookingSkill);
    score += d;
    reasons.push({ label: 'Harder than the cooking you said you are comfortable with', delta: d });
  }

  return {
    recipe: r,
    score: Math.round(score),
    reasons: reasons.filter((x) => x.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    usesFromPantry,
  };
}

export function recommend(c: Ctx, pool: Recipe[] = RECIPES, limit = 8): Suggestion[] {
  return pool
    .map((r) => scoreRecipe(r, c))
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* --------------------------- building a whole day ------------------------- */

export const SLOT_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.12,
  dinner: 0.28,
};

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export interface PlanInputs {
  profile: NutritionProfile;
  /** calories logged from exercise today, so the plan can use the day's real target */
  burnedToday?: number;
  /** what has already been eaten today — the plan covers only what is left */
  consumed?: Nutrients;
  pantry: string[];
  useSoon?: string[];
  /** money already spent on meals eaten today */
  spent?: number;
  /**
   * Only rebuild this slot and the ones after it. Re-planning breakfast at
   * eight in the evening is not a recommendation, it is a rewrite of history.
   */
  replanFrom?: MealSlot;
  trainedToday: boolean;
  recentRecipeIds: string[];
  feedback: MealFeedback[];
  rejected: string[];
  pool?: Recipe[];
  keep?: PlannedMeal[];
}

export function buildDayPlan(inp: PlanInputs, date = todayISO()): DayPlan {
  const t = targetsFor(inp.profile, inp.burnedToday ?? 0);
  const pool = inp.pool ?? RECIPES;
  const chosen: PlannedMeal[] = [];
  const used = new Set<string>();

  // The plan must cover what is LEFT of the day, not the whole day. Ignoring
  // breakfast that has already been eaten is how apps end up recommending
  // 2,000 kcal on top of 600 already consumed.
  let kcalLeft = t.kcal - (inp.consumed?.kcal ?? 0);
  let proteinLeft = t.protein - (inp.consumed?.protein ?? 0);
  let budgetLeft = inp.profile.budgetPerDay - (inp.spent ?? 0);
  const skipped: MealSlot[] = [];

  const fromIndex = inp.replanFrom ? SLOT_ORDER.indexOf(inp.replanFrom) : 0;

  for (const slot of SLOT_ORDER) {
    // Slots already behind you are settled. Whatever happened at breakfast is
    // either in `consumed` or it simply did not happen; either way it is not
    // something to spend this evening's calories on.
    if (SLOT_ORDER.indexOf(slot) < fromIndex) {
      const past = inp.keep?.find((m) => m.slot === slot);
      if (past) {
        chosen.push(past);
        used.add(past.recipeId);
      }
      continue;
    }

    // Anything the caller asked to keep is kept — a meal you have already
    // eaten must never be quietly rewritten underneath you.
    const kept = inp.keep?.find((m) => m.slot === slot);
    if (kept) {
      chosen.push(kept);
      used.add(kept.recipeId);
      const r = pool.find((x) => x.id === kept.recipeId);
      // An eaten meal is already inside `consumed`; only a locked, uneaten one
      // still has to be paid for out of what is left.
      if (r && !kept.eaten) {
        kcalLeft -= r.kcal;
        proteinLeft -= r.protein;
        budgetLeft -= r.costRupees;
      }
      continue;
    }

    // No room left is a real answer. Inventing a 500 kcal dinner for someone
    // with 80 kcal of headroom is worse than saying so. The test is this
    // slot's share of what is left, not the raw total, so a tight day drops
    // the snack rather than the dinner.
    const slotRoom = Math.max(0, kcalLeft) * (SLOT_SHARE[slot] / remainingShare(slot));
    if (slotRoom < 150) {
      skipped.push(slot);
      continue;
    }

    // Protein routinely lags calories on an Indian vegetarian diet. When it does,
    // the engine should chase it rather than just filling the calorie gap.
    const proteinUrgency = clamp(
      Math.max(0, proteinLeft) / Math.max(1, t.protein) / Math.max(0.15, Math.max(0, kcalLeft) / Math.max(1, t.kcal)),
      0.6,
      2.2,
    );

    const ctx: Ctx = {
      profile: inp.profile,
      slot,
      proteinUrgency,
      remaining: { kcal: Math.max(0, kcalLeft), protein: Math.max(0, proteinLeft), carbs: t.carbs, fat: t.fat, fibre: t.fibre },
      slotShare: SLOT_SHARE[slot] / remainingShare(slot),
      // Share the money out across the meals still to come, the same way calories
      // are shared. Spending it greedily on breakfast is how dinner ends up as
      // plain rice on a tight budget.
      budgetLeft: Math.max(25, budgetLeft * (SLOT_SHARE[slot] / remainingShare(slot))),
      minutesAvailable: slot === 'snack' ? Math.min(15, inp.profile.typicalCookMins) : inp.profile.typicalCookMins,
      pantry: inp.pantry,
      useSoon: inp.useSoon,
      trainedToday: inp.trainedToday,
      recentRecipeIds: inp.recentRecipeIds,
      feedback: inp.feedback,
      rejected: inp.rejected,
    };

    const ranked = recommend(ctx, pool.filter((r) => !used.has(r.id)), 5);
    const pick = ranked[0];
    if (pick) {
      chosen.push({ slot, recipeId: pick.recipe.id });
      used.add(pick.recipe.id);
      kcalLeft -= pick.recipe.kcal;
      proteinLeft -= pick.recipe.protein;
      budgetLeft -= pick.recipe.costRupees;
    }
  }

  const totalProtein = chosen.reduce((sum, m) => sum + (pool.find((r) => r.id === m.recipeId)?.protein ?? 0), 0);
  const proteinNeeded = Math.max(0, t.protein - (inp.consumed?.protein ?? 0));

  return {
    date,
    meals: chosen,
    skippedSlots: skipped,
    proteinShortfall: Math.max(0, Math.round(proteinNeeded - totalProtein)),
    generatedAt: now(),
    context: {
      kcalTarget: t.kcal,
      budget: inp.profile.budgetPerDay,
      maxPrepMins: inp.profile.typicalCookMins,
      pantry: inp.pantry,
      useSoon: inp.useSoon,
      trainedToday: inp.trainedToday,
    },
  };
}

/** How much of the day is still ahead once we reach a given slot. */
function remainingShare(from: MealSlot): number {
  const idx = SLOT_ORDER.indexOf(from);
  return SLOT_ORDER.slice(idx).reduce((s, k) => s + SLOT_SHARE[k], 0);
}

/** Alternatives for one slot, excluding what is already planned. */
export function swapOptions(c: Ctx, exclude: string[], pool: Recipe[] = RECIPES, limit = 5): Suggestion[] {
  return recommend(c, pool.filter((r) => !exclude.includes(r.id)), limit);
}

/** Meals you can make from what is in the kitchen right now. */
export function fromPantry(profile: NutritionProfile, pantry: string[], pool: Recipe[] = RECIPES) {
  const p = pantry.map((x) => x.trim()).filter(Boolean);
  if (!p.length) return [];
  return pool
    .filter((r) => isEligible(r, profile).ok)
    .map((r) => {
      const have = r.ingredients.filter((i) => p.some((x) => sameIngredient(x, i.name)));
      const missing = r.ingredients.filter((i) => !have.includes(i));
      // Spices in a jar are not a shopping trip, so they do not count against
      // "you are one ingredient away".
      const realMissing = missing.filter((i) => !resolveIngredient(i.name)?.staple);
      return {
        recipe: r,
        have: have.map((i) => i.name),
        missing: missing.map((i) => i.name),
        /** what is missing that you would actually have to go and buy */
        needToBuy: realMissing.map((i) => i.name),
        /** what finishing this meal would cost you */
        missingCost: realMissing.reduce((sum, i) => sum + ingredientCost(i.name, i.qty), 0),
        coverage: have.length / r.ingredients.length,
      };
    })
    .filter((x) => x.coverage > 0)
    .sort((a, b) => a.needToBuy.length - b.needToBuy.length || b.coverage - a.coverage)
    .slice(0, 10);
}

/* ============================================================
   Context, in words.

   The scoring table is honest but it reads like a debug view.
   These are the same facts, expressed as the checks a person
   would actually make before deciding what to cook.
   ============================================================ */

export interface ContextCheck {
  key: string;
  /** the thing being checked, e.g. "Time" */
  label: string;
  /** what the app knows, e.g. "15 min, and you have about 20" */
  detail: string;
  ok: boolean;
  /** true when the check could not be made because the data is missing */
  unknown?: boolean;
}

export function contextChecks(r: Recipe, c: Ctx): ContextCheck[] {
  const share = Math.max(0.15, c.slotShare);
  const slotKcal = Math.round(Math.max(150, c.remaining.kcal) * share);
  const slotProtein = Math.round(Math.max(10, c.remaining.protein) * share);
  const budget = Math.round(c.budgetLeft);
  const usesFromPantry = c.pantry.length
    ? r.ingredients.filter((i) => c.pantry.some((p) => sameIngredient(p, i.name))).map((i) => i.name)
    : [];
  const recentIdx = c.recentRecipeIds.indexOf(r.id);

  return [
    {
      key: 'time',
      label: 'Time',
      detail: `${formatMins(r.prepMins)} to cook, and you said you have about ${formatMins(c.minutesAvailable)}`,
      ok: r.prepMins <= c.minutesAvailable,
    },
    {
      key: 'budget',
      label: 'Budget',
      detail: budget > 0
        ? `About ₹${r.costRupees}, against ₹${budget} left in today's food budget`
        : `About ₹${r.costRupees}`,
      ok: budget <= 0 || r.costRupees <= budget,
      unknown: budget <= 0,
    },
    {
      key: 'protein',
      label: 'Protein',
      detail: `${r.protein} g here, and this meal needs to carry about ${slotProtein} g of what is left today`,
      ok: r.protein >= slotProtein * 0.8,
    },
    {
      key: 'calories',
      label: 'Calories',
      detail: `${r.kcal} kcal, against roughly ${slotKcal} kcal of room for this meal`,
      ok: r.kcal <= slotKcal * 1.25,
    },
    {
      key: 'kitchen',
      label: 'Your kitchen',
      detail: usesFromPantry.length
        ? `Uses ${usesFromPantry.join(', ')} you already have`
        : c.pantry.length
          ? 'Nothing from your kitchen list, so this one needs a shop'
          : 'You have not told us what is in your kitchen',
      ok: usesFromPantry.length > 0,
      unknown: c.pantry.length === 0,
    },
    {
      key: 'variety',
      label: 'Variety',
      detail: recentIdx >= 0
        ? `You had this ${recentIdx === 0 ? 'today' : recentIdx === 1 ? 'yesterday' : `${recentIdx} days ago`}`
        : 'You have not had this in the last few days',
      ok: recentIdx < 0,
    },
    {
      key: 'diet',
      label: 'What you eat',
      detail: isEligible(r, c.profile).ok
        ? `Fits ${c.profile.diet === 'nonveg' ? 'your diet' : c.profile.diet}, your allergies and everything you asked us to avoid`
        : isEligible(r, c.profile).why ?? 'Does not fit your restrictions',
      ok: isEligible(r, c.profile).ok,
    },
  ];
}

/** How well the pick actually fits, in words rather than a raw score. */
export function fitLabel(checks: ContextCheck[]): { label: string; tone: 'good' | 'warning' | 'info' } {
  const answerable = checks.filter((c) => !c.unknown);
  const passed = answerable.filter((c) => c.ok).length;
  const ratio = answerable.length ? passed / answerable.length : 0;
  if (ratio >= 0.85) return { label: 'Strong fit', tone: 'good' };
  if (ratio >= 0.6) return { label: 'Good fit, with a trade-off', tone: 'info' };
  return { label: 'The best available today, not a perfect fit', tone: 'warning' };
}

/** One sentence a person would actually say about why this came up. */
export function whySentence(r: Recipe, c: Ctx, checks: ContextCheck[]): string {
  const bits: string[] = [];
  const get = (k: string) => checks.find((x) => x.key === k);
  if (c.remaining.protein > 30 && r.protein >= 20) bits.push(`you are ${Math.round(c.remaining.protein)} g short on protein`);
  if (get('time')?.ok && r.prepMins <= 20) bits.push('it is quick');
  if (get('kitchen')?.ok) bits.push('you already have most of it');
  if (get('budget')?.ok && c.budgetLeft > 0 && r.costRupees <= c.budgetLeft * 0.5) bits.push('it is well inside your budget');
  if (get('variety')?.ok) bits.push('you have not had it recently');
  if (!bits.length) return 'This was the closest fit to today out of everything you can eat.';
  const last = bits.pop()!;
  return `Because ${bits.length ? `${bits.join(', ')} and ${last}` : last}.`;
}
