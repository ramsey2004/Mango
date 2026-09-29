import type { FoodItem } from '../lib/nutrition-types';
import { FOODS } from '../lib/food-db';
import { RECIPES } from '../lib/recipe-db';
import { IFCT_FOODS } from './ifct-foods';
import { computeDishes } from './compute-dishes';
import type { Provenance } from './provenance';
import * as breakfast from './dishes/breakfast';
import * as mains from './dishes/mains';
import * as breadsSnacks from './dishes/breads-snacks';
import * as nonveg from './dishes/nonveg';
import * as sweetsDrinks from './dishes/sweets-drinks';
import * as international from './dishes/international';
import * as regional from './dishes/regional';
import * as extras from './dishes/extras';
import type { DishSpec } from './dish-types';

/* ============================================================
   One catalogue, four kinds of entry.

   Measured foods from the composition table, dishes calculated
   from those ingredients, the original seed foods and recipes,
   and whatever the user adds themselves. They arrive in that
   order deliberately: where two entries are the same food, the
   better-evidenced one wins and the other is dropped rather
   than sitting beside it as a second answer to the same
   question.

   Nothing here is loaded lazily, because nothing here is large:
   the whole catalogue is a few hundred kilobytes of numbers and
   it is needed the moment someone opens the log screen. The
   shape is what matters for scale — if this ever becomes tens
   of thousands of rows it moves behind an index without any
   component changing, because components only ever see
   FoodItem.
   ============================================================ */

const DISH_SPECS: DishSpec[] = [
  ...Object.values(breakfast),
  ...Object.values(mains),
  ...Object.values(breadsSnacks),
  ...Object.values(nonveg),
  ...Object.values(sweetsDrinks),
  ...Object.values(international),
  ...Object.values(regional),
  ...Object.values(extras),
].flat() as DishSpec[];

export const DISHES = computeDishes(DISH_SPECS);

/* -------------------------- the seed layers ------------------------------ */

/* The original food rows: honest guidance figures, never traced to a
   source, so they are labelled estimated rather than quietly promoted. */
const SEED_FOODS: FoodItem[] = FOODS.map((f) => ({ ...f, provenance: 'estimated' as Provenance }));

/* Recipes were previously invisible to the food log — searchFoods only ever
   looked at FOODS, so a hundred-odd recipes could be planned but not logged.
   They join the catalogue here. */
const RECIPE_FOODS: FoodItem[] = RECIPES.map((r) => ({
  id: r.id,
  name: r.name,
  category: r.slots[0] ?? 'lunch',
  servingLabel: '1 serving',
  servingGrams: 0,
  kcal: r.kcal,
  protein: r.protein,
  carbs: r.carbs,
  fat: r.fat,
  fibre: r.fibre,
  cuisine: r.cuisine,
  veg: r.veg,
  vegan: r.vegan,
  egg: r.egg ?? false,
  jainSafe: r.jainSafe ?? false,
  ingredients: r.ingredients.map((i) => i.name),
  prepMins: r.prepMins,
  costRupees: r.costRupees,
  tags: r.tags,
  provenance: 'estimated' as Provenance,
}));

/* ---------------------------- normalisation ------------------------------ */

/** Two names are the same food if they survive this identically. */
export const canonical = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(\d+\s*)?(pieces?|pcs?|nos?|slices?|servings?)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface CatalogueEntry extends FoodItem {
  provenance: Provenance;
}

/* -------------------------- assembling the index -------------------------- */

const order: { rows: FoodItem[]; provenance: Provenance }[] = [
  { rows: IFCT_FOODS, provenance: 'verified' },
  { rows: DISHES, provenance: 'computed' },
  { rows: SEED_FOODS, provenance: 'estimated' },
  { rows: RECIPE_FOODS, provenance: 'estimated' },
];

const byId = new Map<string, CatalogueEntry>();
const byCanonicalName = new Map<string, CatalogueEntry>();

export interface DuplicateReport {
  kept: string;
  dropped: string;
  name: string;
}

const duplicates: DuplicateReport[] = [];

for (const layer of order) {
  for (const row of layer.rows) {
    const entry = { ...row, provenance: (row.provenance ?? layer.provenance) as Provenance };
    if (byId.has(entry.id)) {
      duplicates.push({ kept: byId.get(entry.id)!.id, dropped: entry.id, name: entry.name });
      continue;
    }
    const key = canonical(entry.name);
    const existing = byCanonicalName.get(key);
    if (existing) {
      /* Same food, weaker evidence — dropped, and recorded so the count
         reported at the end is the count of distinct foods, not of rows. */
      duplicates.push({ kept: existing.id, dropped: entry.id, name: entry.name });
      continue;
    }
    byId.set(entry.id, entry);
    byCanonicalName.set(key, entry);
  }
}

export const CATALOGUE: CatalogueEntry[] = [...byId.values()];
export const DUPLICATES = duplicates;

export const catalogueById = (id: string, extra: FoodItem[] = []): FoodItem | undefined =>
  byId.get(id) ?? extra.find((f) => f.id === id);

export const countsByProvenance = (): Record<Provenance, number> =>
  CATALOGUE.reduce(
    (acc, f) => ({ ...acc, [f.provenance]: (acc[f.provenance] ?? 0) + 1 }),
    { verified: 0, computed: 0, estimated: 0, user: 0 } as Record<Provenance, number>,
  );
