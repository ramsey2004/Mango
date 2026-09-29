import type { FoodItem, MealSlot, Nutrients } from '../lib/nutrition-types';
import { FOODS } from '../lib/food-db';
import { CATALOGUE } from '../data/catalogue';
import { searchCatalogue } from '../data/search';

/* ============================================================
   Natural-language food logging.

   Rule-based, and labelled as such in the UI. It parses the
   sentence, shows what it understood, and waits for confirmation
   — it never writes a log entry on its own reading.
   ============================================================ */

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  half: 0.5, couple: 2, 'a couple of': 2, few: 3, dozen: 12,
  ek: 1, do: 2, teen: 3, char: 4,
};

const UNIT_HINTS = ['bowl', 'bowls', 'katori', 'katoris', 'glass', 'glasses', 'cup', 'cups', 'plate', 'plates', 'piece', 'pieces', 'slice', 'slices', 'scoop', 'scoops', 'serving', 'servings'];

/* Only spelling and language variants belong here. A synonym that rewrites
   one food into a different, more specific dish — "paneer" into "paneer
   bhurji" — was reasonable when there were sixty rows and only one paneer
   dish; with a full catalogue it hijacks the query. */
const SYNONYMS: Record<string, string> = {
  chapati: 'roti', chapatis: 'roti', rotis: 'roti', phulka: 'roti',
  dahi: 'curd', yoghurt: 'curd', yogurt: 'curd',
  bhat: 'rice', chawal: 'rice',
  anda: 'egg', ande: 'egg', eggs: 'egg',
  daal: 'dal', dhal: 'dal',
  chai: 'chai', tea: 'chai',
};

export interface ParsedItem {
  food: FoodItem;
  servings: number;
  matchedText: string;
  confident: boolean;
}

export interface ParseResult {
  items: ParsedItem[];
  unmatched: string[];
  totals: Nutrients;
  slot: MealSlot;
}

const clean = (s: string) =>
  s.toLowerCase().replace(/[^\w\s.]/g, ' ').replace(/\s+/g, ' ').trim();

function guessSlot(text: string): MealSlot {
  const t = text.toLowerCase();
  if (/breakfast|morning|nashta/.test(t)) return 'breakfast';
  if (/lunch|afternoon/.test(t)) return 'lunch';
  if (/dinner|night|evening meal/.test(t)) return 'dinner';
  if (/snack|evening|chai time/.test(t)) return 'snack';
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

/** Score a phrase against a food's name. Deliberately simple and predictable. */
function matchFood(phrase: string, pool: FoodItem[]): { food: FoodItem; score: number } | null {
  const p = clean(phrase);
  if (!p) return null;
  const words = p.split(' ').filter((w) => w.length > 2 && !UNIT_HINTS.includes(w) && !(w in WORD_NUM));
  const expanded = words.map((w) => SYNONYMS[w] ?? w);
  if (!expanded.length) return null;

  let best: { food: FoodItem; score: number } | null = null;
  for (const f of pool) {
    const name = clean(f.name);
    let score = 0;
    for (const w of expanded) {
      if (name === w) score += 10;
      /* A whole word beats a prefix. Without the split, "dal" scored the
         same against "Dal fry" as against "Dalma", and the shorter name won. */
      else if (name.split(' ').includes(w)) score += 8;
      else if (name.startsWith(w)) score += 6;
      else if (name.includes(w)) score += 3;
      else if (f.ingredients.some((i) => clean(i).includes(w))) score += 1;
    }
    /* On a tie the shorter name wins. Tried it the other way and the parser
       started preferring combination plates — "2 idli with sambar" matched
       an idli-sambar plate AND a sambar, and counted the sambar twice. */
    if (score > (best?.score ?? 0) || (best !== null && score === best.score && clean(f.name).length < clean(best.food.name).length))
      best = { food: f, score };
  }
  return best && best.score >= 3 ? best : null;
}

function quantityIn(phrase: string): number {
  const p = clean(phrase);
  const digit = p.match(/(\d+(?:\.\d+)?)/);
  if (digit) return Math.min(20, Number(digit[1]));
  for (const [w, n] of Object.entries(WORD_NUM)) {
    if (new RegExp(`\\b${w}\\b`).test(p)) return n;
  }
  return 1;
}

export function parseFoodText(text: string, extraFoods: FoodItem[] = []): ParseResult {
  /* The sentence parser reads the whole catalogue too. It used to see only
     the sixty seed rows, so "I had rajma and rice" matched nothing for rajma. */
  const pool = [...CATALOGUE, ...extraFoods];
  const stripped = text.replace(/^\s*(i\s+(had|ate|took)|had|ate|for\s+\w+\s+i\s+had)\s*/i, '');
  const chunks = stripped
    .split(/,|\band\b|\bwith\b|\+|\bplus\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const unmatched: string[] = [];

  for (const chunk of chunks) {
    const m = matchFood(chunk, pool);
    if (!m) {
      if (clean(chunk).length > 2) unmatched.push(chunk.trim());
      continue;
    }
    const qty = quantityIn(chunk);
    items.push({ food: m.food, servings: qty, matchedText: chunk.trim(), confident: m.score >= 6 });
  }

  const totals = items.reduce<Nutrients>(
    (a, i) => ({
      kcal: a.kcal + i.food.kcal * i.servings,
      protein: a.protein + i.food.protein * i.servings,
      carbs: a.carbs + i.food.carbs * i.servings,
      fat: a.fat + i.food.fat * i.servings,
      fibre: a.fibre + i.food.fibre * i.servings,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );

  return {
    items,
    unmatched,
    totals: {
      kcal: Math.round(totals.kcal),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
      fibre: Math.round(totals.fibre),
    },
    slot: guessSlot(text),
  };
}

export function searchFoods(q: string, extraFoods: FoodItem[] = [], limit = 30): FoodItem[] {
  /* Delegates to the catalogue index. The signature is unchanged so every
     existing call site keeps working, but the pool went from sixty rows to
     the whole catalogue, and matching now covers aliases, regional names
     and misspellings rather than substrings alone. */
  return searchCatalogue(q, { custom: extraFoods, limit });
}
