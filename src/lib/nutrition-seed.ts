import type { NutritionState, NutritionProfile, FoodLogEntry } from './nutrition-types';
import { uid, now, todayISO, toISODate, addDays } from './util';
import { FOODS } from './food-db';
import { RECIPES } from './recipe-db';
import { buildDayPlan } from '../engine/mealRecommender';
import { kcalBurned } from '../engine/calories';

export const emptyNutrition = (): NutritionState => ({
  enabled: true,
  profile: null,
  customFoods: [],
  customRecipes: [],
  logs: [],
  water: [],
  exercise: [],
  weights: [],
  plans: [],
  feedback: [],
  grocery: [],
  coach: [],
  pantry: [],
  waterGoalMl: 2500,
  rejected: [],
  saved: [],
  dataConsent: { wearable: true, grocery: true, activity: true, health: true },
  plan: 'free',
  integrations: [
    { id: 'i_applehealth', name: 'Apple Health', kind: 'wearable', connected: false },
    { id: 'i_googlefit', name: 'Google Fit', kind: 'wearable', connected: false },
    { id: 'i_noise', name: 'Noise', kind: 'wearable', connected: false },
    { id: 'i_boat', name: 'boAt', kind: 'wearable', connected: false },
    { id: 'i_bigbasket', name: 'BigBasket', kind: 'grocery', connected: false },
    { id: 'i_blinkit', name: 'Blinkit', kind: 'grocery', connected: false },
    { id: 'i_zepto', name: 'Zepto', kind: 'grocery', connected: false },
    { id: 'i_labs', name: 'Health app records', kind: 'health', connected: false },
  ],
});

/* The demo profile from the brief: 24, 72 kg, 175 cm, fat loss, vegetarian,
   gym four times a week, ₹250 a day, under twenty minutes of cooking. */
export const DEMO_PROFILE: NutritionProfile = {
  name: '',
  age: 24,
  sex: 'male',
  heightCm: 175,
  weightKg: 72,
  intents: ['consistency'],
  diet: 'vegetarian',
  cuisines: ['North Indian', 'South Indian', 'Punjabi'],
  likes: ['paneer', 'curd'],
  dislikes: ['oats'],
  allergies: [],
  restrictions: [],
  occupation: 'student',
  cooksPerWeek: 5,
  cookingSkill: 2,
  typicalCookMins: 20,
  eatsOutPerWeek: 3,
  kitchen: 'hostel',
  wakeTime: '07:00',
  sleepTime: '23:30',
  budgetPerDay: 250,
  activity: 'gym',
  workoutsPerWeek: 4,
  track: 'fat_loss',
  disclaimerAccepted: true,
  onboardedAt: now(),
};

const food = (name: string) => FOODS.find((f) => f.name.toLowerCase().includes(name.toLowerCase()));

function logOf(date: string, slot: FoodLogEntry['slot'], name: string, servings = 1): FoodLogEntry | null {
  const f = food(name);
  if (!f) return null;
  return {
    id: uid(), date, slot, sourceId: f.id, sourceKind: 'food', name: f.name, servings,
    kcal: Math.round(f.kcal * servings), protein: Math.round(f.protein * servings),
    carbs: Math.round(f.carbs * servings), fat: Math.round(f.fat * servings), fibre: Math.round(f.fibre * servings),
    loggedAt: now(),
  };
}

export function seedNutritionDemo(base: NutritionState): NutritionState {
  const profile = { ...DEMO_PROFILE };
  const logs: FoodLogEntry[] = [];
  const water: NutritionState['water'] = [];
  const exercise: NutritionState['exercise'] = [];
  const weights: NutritionState['weights'] = [];

  // Fourteen days of history, deliberately imperfect — a demo where every day is
  // a perfect 100% teaches the viewer nothing about how the app behaves.
  // i = 0 is today, and today is seeded separately below so the plan still has room in it.
  for (let i = 13; i >= 1; i--) {
    const d = toISODate(addDays(new Date(), -i));
    const skip = i === 9 || i === 4;
    if (!skip) {
      const breakfast = i % 3 === 0 ? 'Poha' : i % 3 === 1 ? 'Besan chilla' : 'Idli';
      logs.push(logOf(d, 'breakfast', breakfast)!);
      logs.push(logOf(d, 'lunch', 'Dal tadka')!, logOf(d, 'lunch', 'Roti', 3)!, logOf(d, 'lunch', 'Steamed rice')!);
      if (i % 3 !== 1) logs.push(logOf(d, 'lunch', 'Mixed vegetable sabzi')!);
      logs.push(logOf(d, 'snack', i % 2 === 0 ? 'Curd' : 'Roasted chana')!);
      if (i % 2 === 0) logs.push(logOf(d, 'snack', 'Banana')!);
      if (i % 3 !== 0) logs.push(logOf(d, 'snack', 'Roasted peanuts')!);
      {
        logs.push(logOf(d, 'dinner', i % 4 === 0 ? 'Palak paneer' : 'Soya chunk curry')!, logOf(d, 'dinner', 'Roti', 3)!);
        logs.push(logOf(d, 'dinner', 'Milk')!);
        if (i % 3 === 0) logs.push(logOf(d, 'dinner', 'Curd')!);
      }
    }
    {
      water.push({ id: uid(), date: d, ml: i % 2 === 0 || i % 3 === 0 ? 2200 : 1400, at: now() });
    }
    if ([1, 2, 4, 6, 8, 9, 11, 13].includes(i)) {
      exercise.push({
        id: uid(), date: d, kind: 'gym', label: 'Gym — resistance training',
        minutes: 60, kcalBurned: kcalBurned('gym', 60, 72), at: now(),
      });
    }
    if (i % 3 === 0) {
      weights.push({ id: uid(), date: d, kg: Math.round((73.4 - (13 - i) * 0.085) * 10) / 10 });
    }
  }

  // Today: breakfast and a snack in, lunch and dinner still open.
  const today = todayISO();
  logs.push(
    logOf(today, 'breakfast', 'Besan chilla')!,
    logOf(today, 'breakfast', 'Chai with sugar')!,
    logOf(today, 'snack', 'Curd')!,
  );
  water.push({ id: uid(), date: today, ml: 1250, at: now() });
  exercise.push({
    id: uid(), date: today, kind: 'gym', label: 'Gym — resistance training',
    minutes: 55, kcalBurned: kcalBurned('gym', 55, 72), at: now(),
  });

  // A realistic kitchen: two things dated, the rest just named.
  const pantryNames = ['paneer', 'tomato', 'onion', 'capsicum', 'atta', 'curd'];
  const pantryItems: NutritionState['pantry'] = [
    { id: uid(), name: 'paneer', qty: '200 g', expiresOn: toISODate(addDays(new Date(), 2)), addedAt: now() },
    { id: uid(), name: 'curd', qty: '400 g', expiresOn: toISODate(addDays(new Date(), 1)), addedAt: now() },
    { id: uid(), name: 'tomato', qty: '6', addedAt: now() },
    { id: uid(), name: 'onion', qty: '1 kg', addedAt: now() },
    { id: uid(), name: 'capsicum', qty: '3', addedAt: now() },
    { id: uid(), name: 'atta', qty: '2 kg', addedAt: now() },
  ];

  const plan = buildDayPlan({
    profile, pantry: pantryNames, trainedToday: true, recentRecipeIds: [], feedback: [], rejected: [],
  });

  const feedback: NutritionState['feedback'] = [
    { id: uid(), recipeId: 'r_masala_oats', verdict: 'disliked', reason: 'taste', at: now() },
    { id: uid(), recipeId: 'r_paneer_wrap', verdict: 'loved', at: now() },
    { id: uid(), recipeId: 'r_moong_chilla', verdict: 'ok', at: now() },
  ];

  const groceryFrom = plan.meals
    .map((m) => RECIPES.find((r) => r.id === m.recipeId))
    .filter(Boolean)
    .flatMap((r) => r!.ingredients.map((i) => ({ ...i, cost: Math.round(r!.costRupees / r!.ingredients.length) })));

  const grocery: NutritionState['grocery'] = [];
  for (const g of groceryFrom) {
    if (grocery.some((x) => x.name.toLowerCase() === g.name.toLowerCase())) continue;
    grocery.push({ id: uid(), name: g.name, qty: g.qty, group: g.group, checked: false, estCost: g.cost });
  }

  return {
    ...base,
    profile,
    logs: logs.filter(Boolean),
    water,
    exercise,
    weights,
    plans: [plan],
    feedback,
    grocery,
    pantry: pantryItems,
    rejected: [],
    // A meal you loved is one you would have saved.
    saved: ['r_paneer_wrap', 'r_moong_chilla'],
    integrations: base.integrations.map((i) => (i.id === 'i_noise' ? { ...i, connected: true } : i)),
  };
}
