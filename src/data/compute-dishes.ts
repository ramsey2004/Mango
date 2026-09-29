import type { FoodItem } from '../lib/nutrition-types';
import type { DishSpec } from './dish-types';
import { resolveIngredient, type ResolvedIngredient } from './resolve-ingredient';
import type { Provenance } from './provenance';

/* ============================================================
   Turning a recipe into a food.

   The arithmetic is deliberately dull: add up the ingredients,
   divide by the number of servings. Nothing is scaled to hit a
   target, nothing is rounded to a satisfying number, and the
   energy is never forced to agree with the macros — it is the
   sum of what the ingredients actually contribute.

   Two things are assumptions rather than measurements, and both
   are stated on the dish: the recipe itself, and the yield
   factor that says how much weight a pot gains or loses in
   cooking. That is why a computed dish is labelled calculated
   and never measured.
   ============================================================ */

const NONVEG = new Set(['meat', 'fish']);

export interface ComputedDish extends FoodItem {
  provenance: Provenance;
  /** what the dish was costed against, ingredient by ingredient */
  breakdown: { ingredient: string; costedAs: string; grams: number; kcal: number }[];
}

export function computeDish(spec: DishSpec): ComputedDish {
  if (spec.serves <= 0) throw new Error(`${spec.id}: serves must be positive`);
  if (!spec.items.length) throw new Error(`${spec.id}: no ingredients`);

  let kcal = 0, protein = 0, carbs = 0, fat = 0, fibre = 0, rawGrams = 0;
  let anyEstimated = false;
  let veg = true, egg = false;
  const breakdown: ComputedDish['breakdown'] = [];

  for (const [word, grams] of spec.items) {
    if (!(grams > 0)) throw new Error(`${spec.id}: "${word}" has no weight`);
    const ing: ResolvedIngredient = resolveIngredient(word);
    const f = grams / 100;
    kcal += ing.kcal * f;
    protein += ing.protein * f;
    carbs += ing.carbs * f;
    fat += ing.fat * f;
    fibre += ing.fibre * f;
    rawGrams += grams;
    /* Only an ingredient that actually contributes something can weaken the
       dish's provenance. Salt and baking soda are estimates in the sense that
       nobody measured them, but they contribute nothing, so letting them
       demote every recipe in the book would make the label meaningless. */
    const contributes = ing.kcal > 0 || ing.protein > 0 || ing.carbs > 0 || ing.fat > 0;
    if (ing.provenance === 'estimated' && contributes) anyEstimated = true;
    if (NONVEG.has(ing.group)) veg = false;
    if (ing.group === 'egg') egg = true;
    breakdown.push({ ingredient: word, costedAs: ing.name, grams, kcal: Math.round(ing.kcal * f) });
  }

  const per = (n: number) => Math.round((n / spec.serves) * 10) / 10;
  const cookedGrams = Math.round((rawGrams * (spec.yield ?? 1)) / spec.serves);

  return {
    id: spec.id,
    name: spec.name,
    category: spec.slot,
    servingLabel: spec.servingLabel,
    servingGrams: cookedGrams,
    kcal: Math.round(kcal / spec.serves),
    protein: per(protein),
    carbs: per(carbs),
    fat: per(fat),
    fibre: per(fibre),
    cuisine: spec.cuisine,
    veg,
    /* Dairy and egg both disqualify vegan, and a dish is only claimed vegan
       when every ingredient's class says so. */
    vegan: veg && !egg && !spec.items.some(([w]) => {
      const g = resolveIngredient(w).group;
      return g === 'dairy' || g === 'egg';
    }),
    egg,
    jainSafe: veg && !spec.items.some(([w]) => /onion|garlic|potato|radish|beet|carrot/i.test(w)),
    ingredients: spec.items.map(([w]) => w),
    prepMins: spec.prepMins ?? 20,
    costRupees: 0,
    tags: spec.tags ?? [],
    /* Provenance travels with the weakest ingredient. One estimated item is
       enough to stop the whole dish claiming to be calculated from measured
       data, because it no longer is. */
    provenance: anyEstimated ? 'estimated' : 'computed',
    breakdown,
  };
}

export function computeDishes(specs: DishSpec[]): ComputedDish[] {
  const seen = new Set<string>();
  return specs.map((s) => {
    if (seen.has(s.id)) throw new Error(`duplicate dish id: ${s.id}`);
    seen.add(s.id);
    return computeDish(s);
  });
}
