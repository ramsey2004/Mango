import { IFCT_ROWS, type IfctRow } from './ifct.generated';
import { SUPPLEMENTARY } from './supplementary';
import type { Provenance } from './provenance';

/* ============================================================
   Turning a recipe word into a measured food.

   Recipes are written the way a kitchen writes them — "toor
   dal", "atta", "oil". The composition table names the same
   things differently — "Red gram, dal", "Wheat flour, atta",
   "Sunflower oil". This is the join between the two, and it is
   deliberately strict: a name that resolves to nothing stops
   the build rather than quietly contributing zero calories to a
   dish.
   ============================================================ */

/** Kitchen word -> the exact IFCT food name it should be costed against.
 *  Where the table offers several, the choice is the ordinary domestic one
 *  and is stated here rather than buried in a recipe. */
export const KITCHEN_NAMES: Record<string, string> = {
  // grains and flours
  'rice': 'Rice, raw, milled',
  'brown rice': 'Rice, raw, brown',
  'parboiled rice': 'Rice, parboiled, milled',
  'atta': 'Wheat flour, atta',
  'wheat flour': 'Wheat flour, atta',
  'maida': 'Wheat flour, refined',
  'refined flour': 'Wheat flour, refined',
  'suji': 'Wheat, semolina',
  'rava': 'Wheat, semolina',
  'semolina': 'Wheat, semolina',
  'poha': 'Rice flakes',
  'flattened rice': 'Rice flakes',
  'puffed rice': 'Rice puffed',
  'murmura': 'Rice puffed',
  'vermicelli': 'Wheat, vermicelli, roasted',
  'sevai': 'Wheat, vermicelli, roasted',
  'ragi flour': 'Ragi',
  'bajra flour': 'Bajra',
  'jowar flour': 'Jowar',
  'besan': 'Bengal gram, dal',        // gram flour is milled bengal gram dal
  'gram flour': 'Bengal gram, dal',

  // pulses
  'toor dal': 'Red gram, dal',
  'arhar dal': 'Red gram, dal',
  'tur dal': 'Red gram, dal',
  'moong dal': 'Green gram, dal',
  'green gram dal': 'Green gram, dal',
  'whole moong': 'Green gram, whole',
  'masoor dal': 'Lentil dal',
  'urad dal': 'Black gram, dal',
  'chana dal': 'Bengal gram, dal',
  'kabuli chana': 'Bengal gram, whole',
  'chole': 'Bengal gram, whole',
  'chickpeas': 'Bengal gram, whole',
  'kala chana': 'Bengal gram, whole',
  'rajma': 'Rajmah, red',
  'lobia': 'Cowpea, brown',
  'soya bean': 'Soya bean, white',
  'dried peas': 'Peas, dry',

  // dairy, egg
  'milk': 'Milk, whole, Cow',
  'buffalo milk': 'Milk, whole, Buffalo',
  'paneer': 'Paneer',
  'khoa': 'Khoa',
  'egg': 'Egg, poultry, whole, raw',
  'boiled egg': 'Egg, poultry, whole, boiled',
  'egg white': 'Egg, poultry, white, raw',
  'egg yolk': 'Egg, poultry, yolk, raw',

  // fats
  'oil': 'Sunflower oil',
  'sunflower oil': 'Sunflower oil',
  'mustard oil': 'Mustard oil',
  'coconut oil': 'Coconut oil',
  'groundnut oil': 'Groundnut oil',
  'ghee': 'Ghee',

  // aromatics and spices
  'onion': 'Onion, big',
  'garlic': 'Garlic, big clove',
  'ginger': 'Ginger, fresh',
  'green chilli': 'Chillies, green - all varieties',
  'red chilli powder': 'Chillies, red',
  'coriander leaves': 'Coriander leaves',
  'curry leaves': 'Curry leaves',
  'mint': 'Mint leaves',
  'turmeric': 'Turmeric powder',
  'cumin': 'Cumin seeds',
  'jeera': 'Cumin seeds',
  'coriander powder': 'Coriander seeds',
  'mustard seeds': 'Mustard seeds',
  'black pepper': 'Pepper, black',
  'asafoetida': 'Asafoetida',
  'hing': 'Asafoetida',
  'fenugreek seeds': 'Fenugreek seeds',
  'cardamom': 'Cardamom, green',
  'cloves': 'Cloves',

  // vegetables
  'potato': 'Potato, brown skin, big',
  'tomato': 'Tomato, ripe, local',
  'cauliflower': 'Cauliflower',
  'cabbage': 'Cabbage, green',
  'carrot': 'Carrot, orange',
  'peas': 'Peas, fresh',
  'green peas': 'Peas, fresh',
  'capsicum': 'Capsicum, green',
  'brinjal': 'Brinjal - all varieties',
  'spinach': 'Spinach',
  'palak': 'Spinach',
  'methi': 'Fenugreek leaves',
  'bottle gourd': 'Bottle gourd, elongate, pale green',
  'lauki': 'Bottle gourd, elongate, pale green',
  'bhindi': 'Ladies finger',
  'okra': 'Ladies finger',
  'pumpkin': 'Pumpkin, orange, round',
  'drumstick': 'Drumstick',
  'beans': 'French beans, country',
  'french beans': 'French beans, country',
  'cluster beans': 'Cluster beans',
  'broad beans': 'Broad beans',
  'radish': 'Radish, elongate, white skin',
  'beetroot': 'Beet root',
  'cucumber': 'Cucumber, green, elongate',
  'mushroom': 'Button mushroom, fresh',

  /* Meat and fish. The chicken choice is deliberate: IFCT's skinless-leg
     row states an energy figure roughly double what its own protein and fat
     imply, so it is left alone and flagged rather than used. Breast is the
     row whose numbers reconcile. */
  'chicken': 'Chicken, poultry, breast, skinless',
  'chicken breast': 'Chicken, poultry, breast, skinless',
  'chicken thigh': 'Chicken, poultry, thigh, skinless',
  'mutton': 'Goat, shoulder, meat',
  'goat meat': 'Goat, shoulder, meat',
  'lamb': 'Sheep, shoulder',
  'beef': 'Beef, shoulder',
  'pork': 'Pork, shoulder',
  'fish': 'Rohu',
  'rohu': 'Rohu',
  'pomfret': 'Pomfret, white',
  'mackerel': 'Mackerel',
  'sardine': 'Sardine',
  'prawns': 'Prawns, big',
  'lettuce': 'Lettuce',

  // nuts, seeds, sugar
  'peanuts': 'Ground nut',
  'groundnut': 'Ground nut',
  'cashew': 'Cashew nut',
  'almonds': 'Almond',
  'walnut': 'Walnut',
  'coconut': 'Coconut, kernel, fresh',
  'sesame seeds': 'Gingelly seeds, white',
  'til': 'Gingelly seeds, white',
  'jaggery': 'Jaggery, cane',
  'gur': 'Jaggery, cane',

  // fruit
  'banana': 'Banana, ripe, robusta',
  'lemon juice': 'Lemon, juice',
  'tamarind': 'Tamarind, pulp',
  'apple': 'Apple, big',
  'papaya': 'Papaya, ripe',
  'mango': 'Mango, ripe, banganapalli',
  'orange': 'Orange, pulp',
  'grapes': 'Grapes, seedless, round, green',
  'guava': 'Guava, white flesh',
  'pomegranate': 'Pomegranate, maroon seeds',
  'watermelon': 'Water melon, pale green',
};

/* ---------------------------------------------------------------- index */

const byName = new Map<string, IfctRow>();
const byAlias = new Map<string, IfctRow>();

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

for (const row of IFCT_ROWS) {
  byName.set(norm(row[1]), row);
  for (const a of row[14].split('|')) {
    const k = norm(a);
    /* First alias wins. A later food claiming the same folk name does not
       get to overwrite an earlier one silently. */
    if (k && !byAlias.has(k)) byAlias.set(k, row);
  }
}

/* Foods IFCT does not cover, kept separate so their weaker provenance
   travels with them into every dish that uses them. */
const bySupplementary = new Map<string, (typeof SUPPLEMENTARY)[number]>();
for (const r of SUPPLEMENTARY) {
  bySupplementary.set(norm(r.name), r);
  for (const a of r.aliases ?? []) if (!bySupplementary.has(norm(a))) bySupplementary.set(norm(a), r);
}

export class UnknownIngredient extends Error {}

export interface ResolvedIngredient {
  /** the name of the food actually costed against, not the recipe's word */
  name: string;
  /** the food class, used to work out whether a dish is vegetarian */
  group: string;
  /** per 100 g */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  provenance: Extract<Provenance, 'verified' | 'estimated'>;
}

const fromIfct = (r: IfctRow): ResolvedIngredient => ({
  name: r[1], group: r[2], kcal: r[3], protein: r[5], carbs: r[6], fat: r[7], fibre: r[8], provenance: 'verified',
});

/** Strict: an unresolvable name throws, so a recipe cannot quietly cost nothing. */
export function resolveIfct(name: string): IfctRow {
  const n = norm(name);
  const mapped = KITCHEN_NAMES[n];
  if (mapped) {
    const row = byName.get(norm(mapped));
    if (!row) throw new UnknownIngredient(`KITCHEN_NAMES maps "${name}" to "${mapped}", which is not in IFCT`);
    return row;
  }
  const direct = byName.get(n) ?? byAlias.get(n);
  if (direct) return direct;
  throw new UnknownIngredient(`No measured ingredient for "${name}"`);
}

/**
 * Resolve a recipe word to something costable, measured or otherwise.
 *
 * IFCT is tried first and a supplementary estimate second, so a food that
 * exists in both is always costed against the measured figure.
 */
export function resolveIngredient(name: string): ResolvedIngredient {
  const n = norm(name);
  const mapped = KITCHEN_NAMES[n];
  if (mapped) {
    const row = byName.get(norm(mapped));
    if (row) return fromIfct(row);
    const sup = bySupplementary.get(norm(mapped));
    if (sup) return { ...sup, provenance: 'estimated' };
    throw new UnknownIngredient(`KITCHEN_NAMES maps "${name}" to "${mapped}", which is in neither table`);
  }
  const direct = byName.get(n) ?? byAlias.get(n);
  if (direct) return fromIfct(direct);
  const sup = bySupplementary.get(n);
  if (sup) return { ...sup, provenance: 'estimated' };
  throw new UnknownIngredient(`No ingredient data for "${name}"`);
}

export const ifctNames = (): string[] => IFCT_ROWS.map((r) => r[1]);
