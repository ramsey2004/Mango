import type { NutritionState } from '../lib/nutrition-types';
import { todayISO } from '../lib/util';

/* ============================================================
   What each tier actually gets.

   The plans screen used to describe a Premium tier that gated
   nothing: `plan` was stored, the toggle flipped it, and not one
   line of the app ever read it. So every claim on that screen was
   false in the only way that matters — the product did not behave
   as advertised.

   This module is the single place that decides. Every gate in the
   UI reads from here, so the feature list and the behaviour cannot
   drift apart again: the pricing screen is generated from the same
   table the gates use.
   ============================================================ */

export type Tier = 'free' | 'premium';

export interface Limits {
  /** recommendations the free tier may generate in a day */
  recommendationsPerDay: number;
  /** swaps the free tier may make in a day */
  swapsPerDay: number;
  /** saved meals the free tier may keep */
  savedMeals: number;
  /** days of history the free tier's charts reach back over */
  historyDays: number;
}

export const FREE_LIMITS: Limits = {
  recommendationsPerDay: 3,
  swapsPerDay: 2,
  savedMeals: 5,
  historyDays: 7,
};

export const PREMIUM_LIMITS: Limits = {
  recommendationsPerDay: Infinity,
  swapsPerDay: Infinity,
  savedMeals: Infinity,
  historyDays: 365,
};

/** Every gated capability, named once. */
export type Capability =
  | 'coach'
  | 'dayPlan'
  | 'pantryPlanning'
  | 'grocery'
  | 'activityAdjust'
  | 'eatOutMode'
  | 'festivalMode'
  | 'fullAnalytics'
  | 'consistencyScore'
  | 'goalTracks'
  | 'unlimitedSwaps';

/**
 * The feature table. This drives BOTH the pricing screen and the gates,
 * which is the only way to keep an advertised feature and a working one
 * in the same state.
 */
export const FEATURES: Array<{
  cap: Capability | null;
  label: string;
  tier: Tier;
  /** where this lives, so the pricing screen can link to it */
  view?: string;
}> = [
  { cap: null, label: 'Food logging and the full Indian food database', tier: 'free', view: 'nut_log' },
  { cap: null, label: 'Calorie and macro tracking', tier: 'free', view: 'nut_home' },
  { cap: null, label: 'Water tracking', tier: 'free', view: 'nut_home' },
  { cap: null, label: `Progress charts over the last ${FREE_LIMITS.historyDays} days`, tier: 'free', view: 'nut_progress' },
  { cap: null, label: `${FREE_LIMITS.recommendationsPerDay} meal recommendations a day`, tier: 'free', view: 'nut_now' },

  { cap: 'coach', label: 'The full contextual coach, reading your live state', tier: 'premium', view: 'nut_coach' },
  { cap: 'dayPlan', label: 'Daily plans built from budget, time and what is in your kitchen', tier: 'premium', view: 'nut_home' },
  { cap: 'unlimitedSwaps', label: 'Unlimited meal swaps and ingredient-aware recommendations', tier: 'premium', view: 'nut_meals' },
  { cap: 'grocery', label: 'Grocery generation and simulated cart hand-off', tier: 'premium', view: 'nut_grocery' },
  { cap: 'activityAdjust', label: 'Activity-linked adjustments', tier: 'premium', view: 'nut_home' },
  { cap: 'eatOutMode', label: 'Eat-Out Mode and Festival Mode', tier: 'premium', view: 'nut_meals' },
  { cap: 'fullAnalytics', label: 'Full progress analytics and the consistency score', tier: 'premium', view: 'nut_progress' },
  { cap: 'goalTracks', label: 'Goal tracks — wellness, fat loss, muscle gain', tier: 'premium', view: 'nut_trust' },
];

export const FREE_FEATURES = FEATURES.filter((f) => f.tier === 'free').map((f) => f.label);
export const PREMIUM_FEATURES = FEATURES.filter((f) => f.tier === 'premium').map((f) => f.label);

export interface Entitlements {
  tier: Tier;
  limits: Limits;
  can: (c: Capability) => boolean;
  /** how many of today's free allowance is left */
  recommendationsLeft: number;
  swapsLeft: number;
  savedLeft: number;
}

const usedToday = (n: NutritionState, kind: 'rec' | 'swap'): number => {
  const today = todayISO();
  const u = n.usage?.[today];
  if (!u) return 0;
  return kind === 'rec' ? (u.recommendations ?? 0) : (u.swaps ?? 0);
};

export function entitlements(n: NutritionState): Entitlements {
  const tier: Tier = n.plan === 'premium' ? 'premium' : 'free';
  const limits = tier === 'premium' ? PREMIUM_LIMITS : FREE_LIMITS;
  const premiumCaps = new Set(FEATURES.filter((f) => f.tier === 'premium' && f.cap).map((f) => f.cap as Capability));

  return {
    tier,
    limits,
    can: (c) => tier === 'premium' || !premiumCaps.has(c),
    recommendationsLeft: Math.max(0, limits.recommendationsPerDay - usedToday(n, 'rec')),
    swapsLeft: Math.max(0, limits.swapsPerDay - usedToday(n, 'swap')),
    savedLeft: Math.max(0, limits.savedMeals - n.saved.length),
  };
}

/** The sentence shown when something is locked. Never a bare padlock. */
export function lockReason(c: Capability): { title: string; body: string } {
  switch (c) {
    case 'coach':
      return {
        title: 'The full coach is a Premium feature',
        body: 'On the free tier the coach answers general questions. Reading your live state — what you have eaten, what is left, what you trained — is part of Premium.',
      };
    case 'dayPlan':
      return {
        title: 'Daily plans are a Premium feature',
        body: 'Free covers logging and tracking. Building a day around your budget, the time you have and what is in your kitchen is the part Premium pays for.',
      };
    case 'grocery':
      return {
        title: 'Grocery generation is a Premium feature',
        body: 'Turning a week of meals into a costed shopping list, and handing it to a cart, is part of Premium.',
      };
    case 'eatOutMode':
    case 'festivalMode':
      return {
        title: 'Eat-Out and Festival modes are Premium',
        body: 'Eating out and eating at a festival are the moments plans fall apart. Handling them properly is part of Premium.',
      };
    case 'fullAnalytics':
    case 'consistencyScore':
      return {
        title: 'Full analytics are a Premium feature',
        body: `Free shows the last ${FREE_LIMITS.historyDays} days. Longer trends, the consistency score and the breakdowns are part of Premium.`,
      };
    case 'activityAdjust':
      return {
        title: 'Activity-linked adjustments are Premium',
        body: 'Free keeps a fixed daily target. Moving it with what you actually did that day is part of Premium.',
      };
    case 'goalTracks':
      return {
        title: 'Goal tracks are a Premium feature',
        body: 'Free assumes general wellness. Switching the whole engine to fat loss or muscle gain is part of Premium.',
      };
    case 'unlimitedSwaps':
      return {
        title: 'You have used today’s free swaps',
        body: `The free tier allows ${FREE_LIMITS.swapsPerDay} swaps a day. Premium removes the limit.`,
      };
    case 'pantryPlanning':
      return {
        title: 'Planning around your kitchen is Premium',
        body: 'Free recommends from the whole database. Preferring what you already have is part of Premium.',
      };
    default:
      return { title: 'This is a Premium feature', body: 'Switch tier on the Plans screen to see it.' };
  }
}
