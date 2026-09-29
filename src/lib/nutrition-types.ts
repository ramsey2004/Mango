/* ============================================================
   Nutrition domain.

   Deliberately separate from the productivity model: a meal is
   not a task. They meet in two places only — the shared local
   database, and the coach, which can see both.
   ============================================================ */

import type { ID, ISODate, ISOStamp } from './types';

export type Sex = 'male' | 'female' | 'other';

/**
 * Recipe tag vocabulary. Recipes are tagged with the goals they suit; this is
 * not what the user picks. The user picks a track (below) and, optionally,
 * some secondary intents.
 */
export type GoalKey =
  | 'fat_loss' | 'muscle_gain' | 'maintenance' | 'wellness'
  | 'energy' | 'consistency' | 'performance';

/**
 * What else the user is after, beyond the track. These shape recommendations
 * and the language the coach uses, but they never move the calorie target —
 * one number, one reason for it.
 */
export type Intent = 'energy' | 'consistency' | 'performance' | 'maintain_weight';

export type DietKey = 'vegetarian' | 'vegan' | 'eggetarian' | 'nonveg' | 'jain';

export type ActivityKey =
  | 'sedentary' | 'light' | 'walking' | 'running' | 'cycling'
  | 'gym' | 'sports' | 'very_active';

export type Cuisine =
  | 'North Indian' | 'South Indian' | 'Bengali' | 'Gujarati' | 'Maharashtrian'
  | 'Punjabi' | 'Mughlai' | 'Continental' | 'Pan-Indian';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export type Kitchen = 'home' | 'hostel' | 'office' | 'pg';

/**
 * Goal tracks, per section 14 of the marketing plan, which rejects a
 * condition-specific clinical architecture in favour of three goal-based
 * tracks. Mango is not a medical product and does not manage conditions.
 */
export type GoalTrack = 'wellness' | 'fat_loss' | 'muscle_gain';

/** @deprecated old condition-track values, migrated on load. */
export type LegacyTrack = 'none' | 'diabetes' | 'weight' | 'fitness';

export interface NutritionProfile {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  /**
   * Optional. Waist carries information BMI cannot — BMI famously cannot tell
   * muscle from fat, and a tape measure largely can. Indian cut-offs are
   * published (90 cm men / 80 cm women, or waist-to-height above 0.5).
   */
  waistCm?: number;
  /**
   * Optional. When this is known the engine switches to a fat-free-mass
   * equation, which needs no sex coefficient at all — so it also resolves the
   * "prefer not to say" case properly rather than by approximation.
   */
  bodyFatPct?: number;

  /** Secondary intents. Optional, and never used to change the calorie target. */
  intents: Intent[];

  diet: DietKey;
  cuisines: Cuisine[];
  likes: string[];
  dislikes: string[];
  allergies: string[];
  restrictions: string[];

  occupation: 'student' | 'professional' | 'other';
  cooksPerWeek: number;
  cookingSkill: 1 | 2 | 3;
  typicalCookMins: number;
  eatsOutPerWeek: number;
  kitchen: Kitchen;
  wakeTime: string;
  sleepTime: string;

  budgetPerDay: number;
  activity: ActivityKey;
  workoutsPerWeek: number;

  track: GoalTrack;
  /** Whether the user accepted the medical disclaimer. */
  disclaimerAccepted: boolean;
  onboardedAt?: ISOStamp;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface FoodItem extends Nutrients {
  id: ID;
  name: string;
  category: MealSlot | 'staple' | 'drink';
  servingLabel: string;
  servingGrams: number;
  cuisine: Cuisine;
  veg: boolean;
  vegan: boolean;
  egg?: boolean;
  jainSafe?: boolean;
  ingredients: string[];
  prepMins: number;
  costRupees: number;
  /** Glycaemic index where a reliable figure exists. */
  gi?: number;
  tags: string[];
  /** Where the nutrition figures came from. Absent means the seed data,
   *  which is estimated — see src/data/provenance.ts. */
  provenance?: import('../data/provenance').Provenance;
  /** Other names people type for this food, including transliterations. */
  aliases?: string[];
  /** Alternative serving weights, each carrying the rule it came from. */
  altPortions?: import('../data/portions').Portion[];
  /** Measured standard error on energy, where the source publishes one. */
  kcalSe?: number;
  sodiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
}

export type Equipment = 'none' | 'stove' | 'microwave' | 'kettle' | 'blender' | 'oven';

export type Occasion =
  | 'everyday' | 'office-lunch' | 'post-workout' | 'travel' | 'social' | 'festival' | 'fasting';

export interface Recipe extends Nutrients {
  id: ID;
  name: string;
  cuisine: Cuisine;
  slots: MealSlot[];
  /** where this can actually be made */
  kitchens: Kitchen[];
  equipment: Equipment[];
  /** no heat needed at all */
  noCook?: boolean;
  occasions: Occasion[];
  /** how filling it is for its calories, 1 light to 3 heavy */
  satiety: 1 | 2 | 3;
  /** survives a tiffin box */
  portable?: boolean;
  /** worth cooking a double batch of */
  batchFriendly?: boolean;
  prepMins: number;
  difficulty: 1 | 2 | 3;
  costRupees: number;
  servings: number;
  ingredients: Array<{ name: string; qty: string; group: GroceryGroup }>;
  steps: string[];
  veg: boolean;
  vegan: boolean;
  egg?: boolean;
  jainSafe?: boolean;
  gi?: number;
  goalTags: GoalKey[];
  tasteTags: string[];
  tags: string[];
  emoji: string;
}

export type GroceryGroup = 'Vegetables' | 'Fruit' | 'Dairy' | 'Protein' | 'Grains' | 'Pantry' | 'Other';

export interface FoodLogEntry {
  id: ID;
  date: ISODate;
  slot: MealSlot;
  /** Either a database item or a free-typed one. */
  sourceId?: ID;
  sourceKind?: 'food' | 'recipe' | 'quick' | 'manual';
  name: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  loggedAt: ISOStamp;
}

export interface WaterLogEntry {
  id: ID;
  date: ISODate;
  ml: number;
  at: ISOStamp;
}

export interface ExerciseEntry {
  id: ID;
  date: ISODate;
  kind: ActivityKey | 'yoga' | 'other';
  label: string;
  minutes: number;
  kcalBurned: number;
  /** true when it came from the simulated wearable rather than the user */
  simulated?: boolean;
  at: ISOStamp;
}

export interface WeightEntry {
  id: ID;
  date: ISODate;
  kg: number;
}

export interface PlannedMeal {
  slot: MealSlot;
  recipeId: ID;
  /** slots the user has locked so regeneration leaves them alone */
  locked?: boolean;
  eaten?: boolean;
}

export interface DayPlan {
  date: ISODate;
  meals: PlannedMeal[];
  /** slots left empty because there was no room left in the day */
  skippedSlots?: MealSlot[];
  /** grams of protein the plan could not reach within the day's constraints */
  proteinShortfall?: number;
  generatedAt: ISOStamp;
  /** what the engine knew when it built this — shown in the "why" panel */
  context: {
    kcalTarget: number;
    budget: number;
    maxPrepMins: number;
    pantry: string[];
    useSoon?: string[];
    trainedToday: boolean;
  };
}

export type FeedbackVerdict = 'loved' | 'ok' | 'disliked';
export type FeedbackReason =
  | 'expensive' | 'difficult' | 'taste' | 'slow' | 'ingredients' | 'preference' | 'repetitive';

export interface MealFeedback {
  id: ID;
  recipeId: ID;
  verdict: FeedbackVerdict;
  reason?: FeedbackReason;
  at: ISOStamp;
}

/**
 * A thing in your kitchen. Quantity and expiry are optional on purpose —
 * nobody maintains an inventory, and the app must be useful to someone who
 * types four words and stops.
 */
export interface PantryItem {
  id: ID;
  name: string;
  /** free text, because "half a packet" is how people actually think */
  qty?: string;
  expiresOn?: ISODate;
  addedAt: ISOStamp;
}

export interface GroceryItem {
  id: ID;
  name: string;
  qty: string;
  group: GroceryGroup;
  checked: boolean;
  estCost: number;
  manual?: boolean;
}

export interface CoachTurn {
  id: ID;
  role: 'you' | 'coach';
  text: string;
  at: ISOStamp;
  /** recipe ids offered with this reply, so the user can act on them */
  offers?: ID[];
  /** true when the safety layer intercepted */
  safety?: boolean;
}

export interface SimIntegration {
  id: string;
  name: string;
  kind: 'wearable' | 'grocery' | 'delivery' | 'health';
  connected: boolean;
}

export interface NutritionState {
  enabled: boolean;
  profile: NutritionProfile | null;
  /** user-added foods live alongside the seeded database */
  customFoods: FoodItem[];
  customRecipes: Recipe[];
  logs: FoodLogEntry[];
  water: WaterLogEntry[];
  exercise: ExerciseEntry[];
  weights: WeightEntry[];
  plans: DayPlan[];
  feedback: MealFeedback[];
  grocery: GroceryItem[];
  coach: CoachTurn[];
  pantry: PantryItem[];
  integrations: SimIntegration[];
  waterGoalMl: number;
  /** recipes the user swapped away from, so the engine stops offering them */
  rejected: ID[];
  /** recipes the user chose to keep */
  saved: ID[];
  /**
   * What changed the last time the day was re-planned after something was
   * logged. Transient: it exists so the change can be shown, then dismissed.
   */
  lastReplan?: {
    at: ISOStamp;
    trigger: string;
    changes: Array<{ slot: MealSlot; fromName?: string; toName?: string }>;
  };
  /** granular consent, per the trust centre. Off means the engine ignores it. */
  dataConsent: { wearable: boolean; grocery: boolean; activity: boolean; health: boolean };
  plan: 'free' | 'premium';
  /**
   * Per-day counters for the free tier's allowances, keyed by ISO date.
   * Kept small: anything older than a week is dropped on write.
   */
  usage?: Record<string, { recommendations?: number; swaps?: number }>;
  /**
   * Set to 'pending' on upgrade for users whose targets were computed with the
   * old activity factors, cleared once they have seen why the number moved.
   */
  energyMethodNotice?: 'pending' | 'seen';
}

/** Plain labels for the three tracks, used wherever one is shown. */
export const TRACK_LABEL: Record<GoalTrack, string> = {
  wellness: 'wellness',
  fat_loss: 'fat loss',
  muscle_gain: 'muscle gain',
};

export const INTENT_LABEL: Record<Intent, string> = {
  energy: 'better energy',
  consistency: 'eating consistently',
  performance: 'training performance',
  maintain_weight: 'holding weight steady',
};
