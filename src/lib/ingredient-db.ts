import type { GroceryGroup } from './nutrition-types';

/* ============================================================
   Ingredients: names, the other names people use for them, and
   what they cost.

   Two problems this fixes.

   First, matching. The pantry used to compare strings, so "curd"
   never matched "dahi" or "yogurt" and a user who typed one word
   silently lost the benefit of having the thing.

   Second, price. Recipe cost used to be divided evenly across a
   recipe's ingredients, which made every item in a meal cost the
   same and turned "₹38 to finish this" into arithmetic dressed
   as a price. Costs are now summed from a per-unit table.

   PROVENANCE: these are typical Indian retail prices for a metro
   in 2026, rounded, entered by hand as seed data. They are not a
   live price feed and the UI says "about ₹x" everywhere for that
   reason. Replacing this table with a retailer API changes
   nothing else in the app.
   ============================================================ */

export type Unit = 'kg' | 'l' | 'piece' | 'bunch';

export interface Ingredient {
  /** canonical name, matching the recipe tables */
  name: string;
  group: GroceryGroup;
  /** other names for the same thing, lower case */
  aliases: string[];
  /** price per base unit, in rupees */
  price: number;
  unit: Unit;
  /** grams in one purchased unit, where the unit is countable */
  gramsEach?: number;
  /**
   * Grams in one of the thing as a recipe counts it, when that differs from
   * what you buy. "8 curry leaves" is not eight bunches, and "10 almonds"
   * is not ten kilos.
   */
  countGrams?: number;
  /** true for spices and staples nearly every kitchen already has */
  staple?: boolean;
}

const I = (
  name: string, group: GroceryGroup, price: number, unit: Unit,
  aliases: string[] = [], extra: Partial<Ingredient> = {},
): Ingredient => ({ name, group, price, unit, aliases, ...extra });

export const INGREDIENTS: Ingredient[] = [
  /* ---------------------------- protein ---------------------------- */
  I('Paneer', 'Protein', 420, 'kg', ['cottage cheese', 'panir']),
  I('Tofu', 'Protein', 320, 'kg', ['bean curd', 'soy paneer']),
  I('Soya chunks', 'Protein', 180, 'kg', ['soy chunks', 'nutrela', 'meal maker', 'textured soy']),
  I('Eggs', 'Protein', 8, 'piece', ['egg', 'anda'], { gramsEach: 50 }),
  I('Chicken', 'Protein', 280, 'kg', ['murgh']),
  I('Chicken breast', 'Protein', 380, 'kg', ['chicken fillet', 'boneless chicken']),
  I('Rohu or basa', 'Protein', 300, 'kg', ['fish', 'rohu', 'basa', 'machli']),
  I('Moong dal', 'Protein', 140, 'kg', ['yellow moong', 'green gram dal', 'moong']),
  I('Toor dal', 'Protein', 160, 'kg', ['arhar dal', 'pigeon pea', 'tur dal']),
  I('Rajma', 'Protein', 150, 'kg', ['kidney beans']),
  I('Boiled chickpeas', 'Protein', 120, 'kg', ['chana', 'chole', 'chickpeas', 'kabuli chana', 'garbanzo']),
  I('Roasted chana', 'Protein', 200, 'kg', ['bhuna chana', 'roasted gram']),
  I('Moong sprouts', 'Protein', 120, 'kg', ['sprouts', 'sprouted moong']),
  I('Peanuts', 'Protein', 160, 'kg', ['groundnut', 'moongphali']),
  I('Almonds', 'Protein', 800, 'kg', ['badam'], { countGrams: 1.2 }),

  /* ----------------------------- dairy ----------------------------- */
  I('Curd', 'Dairy', 90, 'kg', ['dahi', 'yogurt', 'yoghurt', 'plain curd']),
  I('Greek yogurt', 'Dairy', 320, 'kg', ['hung curd', 'greek curd']),
  I('Curd dip', 'Dairy', 100, 'kg', ['raita', 'dahi dip']),
  I('Butter', 'Dairy', 560, 'kg', ['makkhan']),
  I('Ghee', 'Dairy', 700, 'kg', ['clarified butter']),
  I('Cream', 'Dairy', 300, 'l', ['malai', 'fresh cream']),

  /* ---------------------------- grains ----------------------------- */
  I('Rice', 'Grains', 60, 'kg', ['chawal', 'white rice']),
  I('Cooked rice', 'Grains', 60, 'kg', ['leftover rice', 'steamed rice']),
  I('Basmati rice', 'Grains', 130, 'kg', ['long grain rice']),
  I('Brown rice', 'Grains', 110, 'kg', ['whole grain rice']),
  I('Wheat flour', 'Grains', 45, 'kg', ['atta', 'gehun ka atta', 'whole wheat flour']),
  I('Wheat tortilla or roti', 'Grains', 8, 'piece', ['roti', 'chapati', 'phulka', 'tortilla', 'wrap'], { gramsEach: 40 }),
  I('Brown bread', 'Grains', 5, 'piece', ['bread', 'whole wheat bread', 'slice'], { gramsEach: 30 }),
  I('Oats', 'Grains', 180, 'kg', ['rolled oats', 'jai']),
  I('Poha', 'Grains', 60, 'kg', ['flattened rice', 'chivda', 'aval']),
  I('Semolina', 'Grains', 55, 'kg', ['suji', 'rava', 'sooji']),
  I('Gram flour', 'Grains', 110, 'kg', ['besan', 'chickpea flour']),
  I('Bajra', 'Grains', 55, 'kg', ['pearl millet', 'bajra flour']),
  I('Rajgira flour', 'Grains', 220, 'kg', ['amaranth flour', 'ramdana']),
  I('Sabudana', 'Grains', 90, 'kg', ['sago', 'tapioca pearls']),
  I('Idli batter', 'Grains', 90, 'kg', ['idly batter']),
  I('Dosa batter', 'Grains', 90, 'kg', ['dosai batter']),

  /* --------------------------- vegetables -------------------------- */
  I('Onion', 'Vegetables', 40, 'kg', ['pyaz', 'kanda'], { countGrams: 100 }),
  I('Tomato', 'Vegetables', 40, 'kg', ['tamatar'], { countGrams: 100 }),
  I('Onion & tomato', 'Vegetables', 40, 'kg', ['onion tomato']),
  I('Potato', 'Vegetables', 30, 'kg', ['aloo'], { countGrams: 100 }),
  I('Capsicum', 'Vegetables', 80, 'kg', ['bell pepper', 'shimla mirch'], { countGrams: 100 }),
  I('Spinach', 'Vegetables', 50, 'kg', ['palak']),
  I('Fenugreek leaves', 'Vegetables', 60, 'kg', ['methi', 'methi leaves']),
  I('Cucumber', 'Vegetables', 40, 'kg', ['kheera'], { countGrams: 150 }),
  I('Carrot & peas', 'Vegetables', 60, 'kg', ['carrot', 'peas', 'gajar matar']),
  I('Peas & carrot', 'Vegetables', 60, 'kg', ['matar gajar']),
  I('Mixed vegetables', 'Vegetables', 55, 'kg', ['veggies', 'mixed veg']),
  I('Seasonal vegetable', 'Vegetables', 50, 'kg', ['sabzi', 'vegetable']),
  I('Salad vegetables', 'Vegetables', 60, 'kg', ['salad']),
  I('Broccoli or beans', 'Vegetables', 120, 'kg', ['broccoli', 'french beans', 'beans']),
  I('Drumstick & vegetables', 'Vegetables', 70, 'kg', ['drumstick', 'sahjan']),
  I('Coriander', 'Vegetables', 15, 'bunch', ['dhania', 'cilantro'], { gramsEach: 60, countGrams: 2 }),
  I('Green chilli', 'Vegetables', 80, 'kg', ['hari mirch', 'chilli'], { countGrams: 5 }),
  I('Ginger', 'Vegetables', 120, 'kg', ['adrak']),
  I('Ginger-garlic', 'Vegetables', 140, 'kg', ['ginger garlic paste', 'adrak lehsun']),
  I('Curry leaves', 'Vegetables', 10, 'bunch', ['kadi patta'], { gramsEach: 20, countGrams: 0.3, staple: true }),
  I('Fried onion', 'Vegetables', 300, 'kg', ['birista']),
  I('Lemon', 'Fruit', 5, 'piece', ['nimbu', 'lime'], { gramsEach: 50 }),
  I('Seasonal fruit', 'Fruit', 90, 'kg', ['fruit', 'banana', 'apple']),
  I('Coconut', 'Fruit', 45, 'piece', ['nariyal', 'grated coconut'], { gramsEach: 300, countGrams: 300 }),

  /* ---------------------------- pantry ----------------------------- */
  I('Cumin', 'Pantry', 400, 'kg', ['jeera'], { staple: true }),
  I('Turmeric', 'Pantry', 300, 'kg', ['haldi'], { staple: true }),
  I('Mustard seeds', 'Pantry', 200, 'kg', ['rai', 'sarson'], { staple: true }),
  I('Mustard paste', 'Pantry', 260, 'kg', ['sarson paste'], { staple: true }),
  I('Garam masala', 'Pantry', 700, 'kg', [], { staple: true }),
  I('Chaat masala', 'Pantry', 600, 'kg', [], { staple: true }),
  I('Sambar powder', 'Pantry', 500, 'kg', [], { staple: true }),
  I('Biryani masala', 'Pantry', 700, 'kg', [], { staple: true }),
  I('Tandoori masala', 'Pantry', 700, 'kg', [], { staple: true }),
  I('Tikka masala', 'Pantry', 700, 'kg', [], { staple: true }),
  I('Rock salt', 'Pantry', 60, 'kg', ['sendha namak', 'salt'], { staple: true }),
  I('Soy sauce', 'Pantry', 200, 'l', [], { staple: true }),
  /* ------------------- added with the wider recipe set ------------------ */
  I('Milk', 'Dairy', 60, 'l', ['doodh', 'toned milk']),
  I('Cheese', 'Dairy', 500, 'kg', ['cheese slice', 'processed cheese']),
  I('Buttermilk', 'Dairy', 40, 'l', ['chaas', 'chhachh']),
  I('Whey protein', 'Protein', 2200, 'kg', ['protein powder', 'whey']),
  I('Chana dal', 'Protein', 130, 'kg', ['bengal gram dal', 'split chana']),
  I('Masoor dal', 'Protein', 120, 'kg', ['red lentil', 'masur']),
  I('Urad dal', 'Protein', 150, 'kg', ['black gram dal']),
  I('Lobia', 'Protein', 140, 'kg', ['black eyed peas', 'chawli']),
  I('Green moong', 'Protein', 130, 'kg', ['whole moong', 'sabut moong']),
  I('Fish fillet', 'Protein', 400, 'kg', ['surmai', 'pomfret', 'tilapia']),
  I('Prawns', 'Protein', 550, 'kg', ['jhinga', 'shrimp']),
  I('Mutton', 'Protein', 800, 'kg', ['lamb', 'goat meat']),
  I('Egg whites', 'Protein', 8, 'piece', ['egg white'], { gramsEach: 33, countGrams: 33 }),
  I('Walnuts', 'Protein', 1200, 'kg', ['akhrot'], { countGrams: 4 }),
  I('Cashews', 'Protein', 900, 'kg', ['kaju'], { countGrams: 1.5 }),
  I('Pumpkin seeds', 'Protein', 700, 'kg', ['seeds', 'mixed seeds']),
  I('Chia seeds', 'Protein', 900, 'kg', ['chia']),
  I('Peanut butter', 'Protein', 450, 'kg', ['pb']),
  I('Quinoa', 'Grains', 400, 'kg', []),
  I('Ragi flour', 'Grains', 70, 'kg', ['finger millet', 'nachni']),
  I('Jowar', 'Grains', 55, 'kg', ['sorghum', 'jowar flour']),
  I('Vermicelli', 'Grains', 90, 'kg', ['seviyan', 'semiya']),
  I('Bread', 'Grains', 5, 'piece', ['pav', 'bun'], { gramsEach: 30, countGrams: 30 }),
  I('Corn flakes', 'Grains', 300, 'kg', ['cornflakes', 'cereal']),
  I('Muesli', 'Grains', 450, 'kg', ['granola']),
  I('Puffed rice', 'Grains', 70, 'kg', ['murmura', 'kurmura']),
  I('Besan sev', 'Grains', 220, 'kg', ['sev', 'namkeen']),
  I('Cauliflower', 'Vegetables', 45, 'kg', ['gobi'], { countGrams: 500 }),
  I('Cabbage', 'Vegetables', 35, 'kg', ['patta gobi'], { countGrams: 700 }),
  I('Bottle gourd', 'Vegetables', 35, 'kg', ['lauki', 'dudhi'], { countGrams: 700 }),
  I('Pumpkin', 'Vegetables', 35, 'kg', ['kaddu', 'sitaphal']),
  I('Brinjal', 'Vegetables', 50, 'kg', ['baingan', 'aubergine'], { countGrams: 150 }),
  I('Okra', 'Vegetables', 60, 'kg', ['bhindi', 'ladies finger']),
  I('Beetroot', 'Vegetables', 45, 'kg', ['chukandar'], { countGrams: 150 }),
  I('Mushroom', 'Vegetables', 180, 'kg', ['button mushroom', 'khumb']),
  I('Sweet potato', 'Vegetables', 60, 'kg', ['shakarkandi']),
  I('Sweet corn', 'Vegetables', 90, 'kg', ['corn', 'makai']),
  I('Garlic', 'Vegetables', 200, 'kg', ['lehsun'], { countGrams: 3 }),
  I('Mint', 'Vegetables', 10, 'bunch', ['pudina'], { gramsEach: 40, countGrams: 2 }),
  I('Banana', 'Fruit', 60, 'kg', ['kela'], { countGrams: 120 }),
  I('Apple', 'Fruit', 140, 'kg', ['seb'], { countGrams: 180 }),
  I('Papaya', 'Fruit', 50, 'kg', ['papita']),
  I('Dates', 'Fruit', 300, 'kg', ['khajoor'], { countGrams: 8 }),
  I('Jaggery', 'Pantry', 70, 'kg', ['gur'], { staple: true }),
  I('Sugar', 'Pantry', 45, 'kg', ['cheeni'], { staple: true }),
  I('Honey', 'Pantry', 500, 'kg', ['shahad'], { staple: true }),
  I('Oil', 'Pantry', 140, 'l', ['cooking oil', 'refined oil', 'mustard oil'], { staple: true }),
  I('Red chilli powder', 'Pantry', 350, 'kg', ['lal mirch', 'mirchi powder'], { staple: true }),
  I('Coriander powder', 'Pantry', 320, 'kg', ['dhania powder'], { staple: true }),
  I('Pav bhaji masala', 'Pantry', 650, 'kg', [], { staple: true }),
  I('Tamarind', 'Pantry', 220, 'kg', ['imli'], { staple: true }),
  I('Coconut milk', 'Pantry', 220, 'l', ['nariyal doodh']),
  I('Tomato ketchup', 'Pantry', 160, 'kg', ['ketchup'], { staple: true }),
  I('Vinegar', 'Pantry', 120, 'l', [], { staple: true }),
  I('Poppy seeds', 'Pantry', 900, 'kg', ['khus khus'], { staple: true }),
  I('Kasuri methi', 'Pantry', 600, 'kg', ['dried fenugreek'], { staple: true }),
];


/* ------------------------------ lookup ------------------------------- */

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

const INDEX = new Map<string, Ingredient>();
for (const ing of INGREDIENTS) {
  INDEX.set(norm(ing.name), ing);
  for (const a of ing.aliases) INDEX.set(norm(a), ing);
}

/**
 * Resolves a written name to a known ingredient. Exact and alias matches
 * first, then a containment check, so "fresh paneer cubes" still finds
 * paneer without "paneer" accidentally matching "paneer masala powder".
 */
export function resolveIngredient(name: string): Ingredient | undefined {
  const n = norm(name);
  const direct = INDEX.get(n);
  if (direct) return direct;
  let best: Ingredient | undefined;
  let bestLen = 0;
  for (const [key, ing] of INDEX) {
    if (key.length < 3) continue;
    if (n.includes(key) || key.includes(n)) {
      if (key.length > bestLen) { best = ing; bestLen = key.length; }
    }
  }
  return best;
}

/** True when two written names refer to the same thing. */
export function sameIngredient(a: string, b: string): boolean {
  const ra = resolveIngredient(a);
  const rb = resolveIngredient(b);
  if (ra && rb) return ra.name === rb.name;
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* ------------------------------ quantity ----------------------------- */

const CUP_GRAMS = 200;
const TBSP_GRAMS = 15;
const TSP_GRAMS = 5;

const FRACTIONS: Record<string, number> = { '1/2': 0.5, '1/4': 0.25, '3/4': 0.75, '1/3': 0.34, '2/3': 0.67 };

/**
 * Turns a written quantity into grams (or millilitres) plus a count, so a
 * price can be applied. Deliberately forgiving: an unparseable quantity
 * returns a small default rather than throwing away the recipe.
 */
export function parseQty(qty: string, ing?: Ingredient): { grams: number; pieces: number } {
  const q = norm(qty);
  if (!q || q === 'to taste' || q === 'handful') return { grams: q === 'handful' ? 20 : 3, pieces: 0 };

  const numMatch = q.match(/^(\d+(?:\.\d+)?)/);
  const fracMatch = q.match(/^(1\/2|1\/4|3\/4|1\/3|2\/3)/);
  const n = fracMatch ? FRACTIONS[fracMatch[1]] : numMatch ? Number(numMatch[1]) : 1;

  if (/\bg\b|gram/.test(q)) return { grams: n, pieces: 0 };
  if (/\bml\b/.test(q)) return { grams: n, pieces: 0 };
  if (/\bkg\b/.test(q)) return { grams: n * 1000, pieces: 0 };
  if (/cup/.test(q)) return { grams: n * CUP_GRAMS, pieces: 0 };
  if (/tbsp|tablespoon/.test(q)) return { grams: n * TBSP_GRAMS, pieces: 0 };
  if (/tsp|teaspoon/.test(q)) return { grams: n * TSP_GRAMS, pieces: 0 };
  if (/bowl|katori/.test(q)) return { grams: n * 150, pieces: 0 };
  if (/slice/.test(q)) return { grams: n * (ing?.gramsEach ?? 30), pieces: n };
  if (/bunch/.test(q)) return { grams: n * (ing?.gramsEach ?? 60), pieces: n };
  if (/inch/.test(q)) return { grams: n * 8, pieces: 0 };

  // A bare number is a count of the thing as a cook counts it.
  const each = ing?.countGrams ?? ing?.gramsEach ?? 50;
  return { grams: n * each, pieces: n };
}

/** What one line of a recipe's ingredient list actually costs, in rupees. */
export function ingredientCost(name: string, qty: string): number {
  const ing = resolveIngredient(name);
  if (!ing) return 8; // unknown item — a small placeholder rather than zero
  const { grams, pieces } = parseQty(qty, ing);
  if (ing.unit === 'piece' || ing.unit === 'bunch') {
    const per = ing.gramsEach ?? 50;
    // A bare count buys whole units; a weight or volume pro-rates one.
    const units = pieces ? pieces * ((ing.countGrams ?? per) / per) : grams / per;
    return Math.max(1, Math.round(ing.price * units));
  }
  // kg and l are both priced per 1000 base units
  const cost = (ing.price * grams) / 1000;
  // Spices come out of a jar you already own; charge a token amount.
  return Math.max(ing.staple ? 1 : 2, Math.round(cost));
}

/** Sum of a recipe's ingredient lines. */
export function recipeCost(ingredients: Array<{ name: string; qty: string }>): number {
  return ingredients.reduce((sum, i) => sum + ingredientCost(i.name, i.qty), 0);
}
