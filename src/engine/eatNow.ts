import type { NutritionState, Recipe, MealSlot } from '../lib/nutrition-types';
import { RECIPES } from '../lib/recipe-db';
import {
  recommend, isEligible, contextChecks, fitLabel, whySentence, SLOT_SHARE,
  type Ctx, type Suggestion, type ContextCheck,
} from './mealRecommender';
import {
  targets, remainingOn, budgetLeft, pantryFor, expiringSoon, trainedOn,
  recentRecipeIds, currentSlot,
} from './nutritionSelectors';

/* ============================================================
   "What should I eat now?"

   The rest of the app answers "what is the plan for today".
   This answers the question people actually ask, at the moment
   they ask it, with whatever is true right then — how long they
   have, what money is left, whether they are at home.

   It returns one answer and two named alternatives, because a
   single suggestion you cannot take is a dead end, and ten
   suggestions is a menu, which is the thing the product exists
   to replace.
   ============================================================ */

export interface EatNowInput {
  /** minutes the user says they have, right now */
  minutes: number;
  /** rupees they are willing to spend on this meal; 0 means "use my budget" */
  budget?: number;
  /** where they are, which may not be their usual kitchen */
  where: 'kitchen' | 'no-kitchen' | 'eating-out';
  /** how hungry, which decides whether a snack or a meal is the honest answer */
  hunger: 'peckish' | 'hungry' | 'very-hungry';
  /** override the slot the clock implies */
  slot?: MealSlot;
}

export interface EatNowPick {
  suggestion: Suggestion;
  checks: ContextCheck[];
  fit: ReturnType<typeof fitLabel>;
  why: string;
  /** what this option is for, when it is an alternative rather than the answer */
  role?: 'faster' | 'cheaper';
  /** one line saying what you trade away by taking it */
  tradeOff?: string;
}

export interface EatNowAnswer {
  slot: MealSlot;
  best?: EatNowPick;
  alternatives: EatNowPick[];
  /** shown when nothing fits, with the reason rather than an empty state */
  nothingFits?: string;
  context: {
    minutes: number;
    budget: number;
    kcalLeft: number;
    proteinLeft: number;
    pantryCount: number;
    useSoon: string[];
  };
}

const HUNGER_SHARE: Record<EatNowInput['hunger'], number> = {
  peckish: 0.55,
  hungry: 1,
  'very-hungry': 1.3,
};

/** Builds the scoring context from the live state plus what the user just said. */
function ctxFor(n: NutritionState, inp: EatNowInput, slot: MealSlot): Ctx {
  const t = targets(n)!;
  const left = remainingOn(n);
  const share = Math.min(1, SLOT_SHARE[slot] * HUNGER_SHARE[inp.hunger] * 1.6);
  const proteinUrgency =
    Math.max(0, left.protein) / Math.max(1, t.protein) /
    Math.max(0.15, Math.max(0, left.kcal) / Math.max(1, t.kcal));

  return {
    profile: n.profile!,
    slot,
    proteinUrgency: Math.min(2.2, Math.max(0.6, proteinUrgency)),
    remaining: left,
    slotShare: share,
    budgetLeft: inp.budget && inp.budget > 0 ? inp.budget : budgetLeft(n),
    minutesAvailable: inp.minutes,
    // Standing in a canteen queue, what is in your kitchen is irrelevant.
    pantry: inp.where === 'kitchen' ? pantryFor(n) : [],
    useSoon: inp.where === 'kitchen' ? expiringSoon(n, 3).map((p) => p.name) : [],
    trainedToday: trainedOn(n),
    recentRecipeIds: recentRecipeIds(n),
    feedback: n.feedback,
    rejected: n.rejected,
  };
}

const wrap = (s: Suggestion, ctx: Ctx): EatNowPick => {
  const checks = contextChecks(s.recipe, ctx);
  return { suggestion: s, checks, fit: fitLabel(checks), why: whySentence(s.recipe, ctx, checks) };
};

/**
 * The pool you can actually eat from right now — which is not the same as the
 * pool you could eat from in principle.
 */
function poolFor(n: NutritionState, inp: EatNowInput): Recipe[] {
  const all = [...RECIPES, ...n.customRecipes];
  return all.filter((r) => {
    if (!n.profile) return false;
    if (inp.where === 'eating-out') return r.tags.includes('eat-out');
    if (r.tags.includes('eat-out')) return false;
    if (inp.where === 'no-kitchen' && !r.noCook) return false;
    // Diet, allergies and kitchen are hard constraints; where the user is now
    // overrides the kitchen they usually cook in.
    const profile = inp.where === 'no-kitchen' ? { ...n.profile, kitchen: 'office' as const } : n.profile;
    return isEligible(r, profile).ok;
  });
}

export function eatNow(n: NutritionState, inp: EatNowInput): EatNowAnswer {
  const slot = inp.slot ?? currentSlot();
  const left = remainingOn(n);
  const soon = expiringSoon(n, 3).map((p) => p.name);
  const context = {
    minutes: inp.minutes,
    budget: inp.budget && inp.budget > 0 ? inp.budget : Math.round(budgetLeft(n)),
    kcalLeft: Math.max(0, left.kcal),
    proteinLeft: Math.max(0, left.protein),
    pantryCount: inp.where === 'kitchen' ? pantryFor(n).length : 0,
    useSoon: inp.where === 'kitchen' ? soon : [],
  };

  if (!n.profile) return { slot, alternatives: [], nothingFits: 'Set up your profile and this can answer properly.', context };

  const pool = poolFor(n, inp);
  if (!pool.length) {
    return {
      slot,
      alternatives: [],
      nothingFits:
        inp.where === 'no-kitchen'
          ? 'Nothing in the database works with no kitchen at all and your dietary settings. Widen the diet filter, or tell me you are eating out.'
          : 'Nothing matches your diet and where you are right now.',
      context,
    };
  }

  // Recipes are tagged by slot, but the question is not "what is breakfast".
  // If the clock's slot has nothing to offer — common when eating out, or when
  // someone is properly hungry at four in the afternoon — widen to the nearest
  // real meal rather than returning an empty answer on a technicality.
  const ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
  const fallbacks: MealSlot[] = [slot, ...ORDER.filter((x) => x !== slot)];
  let ctx = ctxFor(n, inp, slot);
  let ranked = recommend(ctx, pool, 12);
  let usedSlot = slot;
  for (const alt of fallbacks) {
    if (ranked.length) break;
    usedSlot = alt;
    ctx = ctxFor(n, inp, alt);
    ranked = recommend(ctx, pool, 12);
  }

  // An explicit budget is a limit the user just stated out loud, so it is a
  // hard cap here even though the day's budget is only a scored preference.
  if (inp.budget && inp.budget > 0) {
    const affordable = ranked.filter((s) => s.recipe.costRupees <= inp.budget!);
    if (affordable.length) {
      ranked = affordable;
    } else {
      const cheapest = [...ranked].sort((a, b) => a.recipe.costRupees - b.recipe.costRupees)[0];
      return {
        slot: usedSlot,
        alternatives: cheapest
          ? [{ ...wrap(cheapest, ctx), role: 'cheaper', tradeOff: `₹${cheapest.recipe.costRupees}, which is ₹${cheapest.recipe.costRupees - inp.budget!} over what you said.` }]
          : [],
        nothingFits: `Nothing comes in under ₹${inp.budget}. The cheapest option is below.`,
        context,
      };
    }
  }

  // Within the time you actually have. If nothing is, say so rather than
  // recommending something you cannot make and calling it a recommendation.
  const inTime = ranked.filter((s) => s.recipe.prepMins <= inp.minutes);
  if (!inTime.length) {
    const quickest = [...ranked].sort((a, b) => a.recipe.prepMins - b.recipe.prepMins)[0];
    return {
      slot: usedSlot,
      alternatives: quickest ? [{ ...wrap(quickest, ctx), role: 'faster', tradeOff: `Needs ${quickest.recipe.prepMins} minutes, which is ${quickest.recipe.prepMins - inp.minutes} more than you said you have.` }] : [],
      nothingFits: `Nothing here fits ${inp.minutes} minutes. The quickest thing you can eat is below — or tell me you are eating out and I will help you order.`,
      context,
    };
  }

  const best = wrap(inTime[0], ctx);
  const bestId = inTime[0].recipe.id;

  /* The two alternatives are not "next best". They answer the two reasons
     someone rejects a suggestion: it takes too long, or it costs too much. */
  const faster = inTime
    .filter((s) => s.recipe.id !== bestId && s.recipe.prepMins < inTime[0].recipe.prepMins)
    .sort((a, b) => a.recipe.prepMins - b.recipe.prepMins)[0];

  const cheaper = inTime
    .filter((s) => s.recipe.id !== bestId && s.recipe.id !== faster?.recipe.id && s.recipe.costRupees < inTime[0].recipe.costRupees)
    .sort((a, b) => a.recipe.costRupees - b.recipe.costRupees)[0];

  const alternatives: EatNowPick[] = [];
  if (faster) {
    const saved = inTime[0].recipe.prepMins - faster.recipe.prepMins;
    const lostProtein = inTime[0].recipe.protein - faster.recipe.protein;
    alternatives.push({
      ...wrap(faster, ctx),
      role: 'faster',
      tradeOff:
        lostProtein > 4
          ? `${saved} minutes quicker, but ${Math.round(lostProtein)} g less protein.`
          : `${saved} minutes quicker, for about the same protein.`,
    });
  }
  if (cheaper) {
    const saved = inTime[0].recipe.costRupees - cheaper.recipe.costRupees;
    const extraTime = cheaper.recipe.prepMins - inTime[0].recipe.prepMins;
    alternatives.push({
      ...wrap(cheaper, ctx),
      role: 'cheaper',
      tradeOff:
        extraTime > 3
          ? `₹${saved} cheaper, but ${extraTime} minutes longer.`
          : `₹${saved} cheaper, and no slower.`,
    });
  }

  return { slot: usedSlot, best, alternatives, context };
}
