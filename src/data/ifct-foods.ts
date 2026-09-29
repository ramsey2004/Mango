import type { FoodItem, MealSlot } from '../lib/nutrition-types';
import { IFCT_ROWS } from './ifct.generated';
import { portionsFor } from './portions';

/* ============================================================
   The measured layer: 542 Indian foods from IFCT 2017, turned
   into the shape the rest of the app already speaks.

   Everything here is per 100 g because that is what the source
   measured. No serving weight is invented; household measures
   are offered separately and labelled as estimates.

   Costs are not in the source, so they are left at zero rather
   than guessed — a price nobody measured should not quietly
   appear in a grocery total.
   ============================================================ */

/* Where a raw food lands when someone logs it. A categorisation, not a
   nutrition claim, so a sensible default costs nothing. */
const SLOT: Record<string, MealSlot | 'staple' | 'drink'> = {
  grain: 'staple',
  legume: 'staple',
  vegetable: 'lunch',
  fruit: 'snack',
  nut: 'snack',
  spice: 'staple',
  fat: 'staple',
  dairy: 'snack',
  egg: 'breakfast',
  meat: 'dinner',
  fish: 'dinner',
  sugar: 'staple',
  other: 'snack',
};

const TAGS: Record<string, string[]> = {
  grain: ['grain', 'raw', 'staple'],
  legume: ['pulse', 'raw', 'high-protein'],
  vegetable: ['vegetable', 'raw'],
  fruit: ['fruit', 'raw'],
  nut: ['nuts', 'raw', 'high-calorie'],
  spice: ['spice'],
  fat: ['fat', 'high-calorie'],
  dairy: ['dairy'],
  egg: ['egg', 'high-protein'],
  meat: ['meat', 'high-protein'],
  fish: ['fish', 'high-protein'],
  sugar: ['sugar'],
  other: [],
};

export const IFCT_FOODS: FoodItem[] = IFCT_ROWS.map(
  ([id, name, group, kcal, kcalSe, protein, carbs, fat, fibre, sodium, calcium, iron, veg, egg, aliases]) => ({
    id,
    name,
    category: SLOT[group] ?? 'snack',
    servingLabel: '100 g',
    servingGrams: 100,
    kcal,
    protein,
    carbs,
    fat,
    fibre,
    cuisine: 'Pan-Indian' as const,
    veg,
    /* IFCT tags a food vegetarian without distinguishing dairy, so vegan is
       only claimed where the food group makes it certain. */
    vegan: veg && group !== 'dairy' && group !== 'egg',
    egg,
    jainSafe: veg && !/onion|garlic|potato|radish|carrot|beet/i.test(name),
    ingredients: [name],
    prepMins: 0,
    costRupees: 0,
    gi: undefined,
    tags: TAGS[group] ?? [],
    provenance: 'verified' as const,
    aliases: aliases ? aliases.split('|') : [],
    altPortions: portionsFor(id, group),
    kcalSe: kcalSe ?? undefined,
    sodiumMg: sodium ?? undefined,
    calciumMg: calcium ?? undefined,
    ironMg: iron ?? undefined,
  }),
);
