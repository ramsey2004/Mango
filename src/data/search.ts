import type { FoodItem } from '../lib/nutrition-types';
import { CATALOGUE, canonical } from './catalogue';
import { PROVENANCE_RANK, type Provenance } from './provenance';

/* ============================================================
   Search across a thousand-odd foods.

   The old search scanned sixty rows for a substring. At this
   size that stops working for two reasons: a substring scan
   ranks "Amaranth leaves, red and green mix" above "Rice" for
   the query "ri", and it cannot find a food whose name nobody
   types — nobody searches for "Ladies finger" when they mean
   bhindi.

   So this builds an index once, at module load, over names and
   over every alias the composition table publishes — including
   its Hindi, Tamil, Telugu, Bengali, Kannada, Malayalam and
   Marathi names, which is where transliterated queries get
   their answers from rather than from a hand-written synonym
   list.

   Spelling tolerance is bounded on purpose: one edit for a
   short word, two for a long one, and only when nothing matched
   properly. Fuzzy matching that fires too eagerly is worse than
   no fuzzy matching, because it buries the exact answer.
   ============================================================ */

interface IndexRow {
  food: FoodItem;
  /** canonical name first, then every alias */
  keys: string[];
  /** index into keys at which aliases begin — matches after it score lower,
   *  because a food's own name is better evidence of what was meant than a
   *  regional alias that happens to collide with a common word */
  aliasFrom: number;
  name: string;
  provenance: Provenance;
}

/* Hand-written only where the composition table has no alias of its own:
   cooking words, English names for Indian foods, and the handful of
   spellings people reliably use. */
const EXTRA_ALIASES: Record<string, string[]> = {
  roti: ['chapati', 'chapatti', 'phulka', 'fulka'],
  curd: ['dahi', 'yogurt', 'yoghurt'],
  rice: ['chawal', 'bhat', 'anna'],
  egg: ['anda', 'ande'],
  dal: ['daal', 'dhal', 'dal'],
  paneer: ['panir', 'cottage cheese'],
  brinjal: ['baingan', 'eggplant', 'aubergine', 'vangi'],
  'ladies finger': ['bhindi', 'okra'],
  'bottle gourd': ['lauki', 'dudhi', 'ghiya'],
  'bitter gourd': ['karela'],
  'fenugreek leaves': ['methi'],
  spinach: ['palak'],
  cauliflower: ['gobi', 'gobhi'],
  potato: ['aloo', 'alu', 'batata'],
  onion: ['pyaz', 'kanda'],
  'green gram': ['moong', 'mung'],
  'red gram': ['toor', 'tur', 'arhar'],
  'black gram': ['urad', 'udad'],
  'bengal gram': ['chana', 'channa', 'chole', 'chickpea'],
  lentil: ['masoor'],
  jaggery: ['gur', 'gud'],
  ghee: ['clarified butter'],
  chai: ['tea'],
  'wheat flour': ['atta', 'gehu'],
};

/* Common misspellings worth resolving before anything else, because an edit
   distance will not get you from "parantha" to "paratha" cheaply. */
const RESPELL: Record<string, string> = {
  parantha: 'paratha',
  paranthe: 'paratha',
  paratta: 'paratha',
  biriyani: 'biryani',
  briyani: 'biryani',
  biriyani_: 'biryani',
  chapathi: 'chapati',
  dhokhla: 'dhokla',
  idly: 'idli',
  dosai: 'dosa',
  sambhar: 'sambar',
  rajmah: 'rajma',
  panner: 'paneer',
  panneer: 'paneer',
  channa: 'chana',
  kheema: 'keema',
  khichadi: 'khichdi',
  khichri: 'khichdi',
  upoma: 'upma',
  poori: 'puri',
  bhaji: 'bhaji',
  pakoda: 'pakora',
  jilebi: 'jalebi',
  laddu: 'ladoo',
  laddoo: 'ladoo',
  gajjar: 'gajar',
  lassy: 'lassi',
};

const words = (s: string) => canonical(s).split(' ').filter(Boolean);

/** Does any word in this key begin with the query? Cheaper than a regex and
 *  it is the rule that stops short queries matching mid-word. */
const wordStarts = (key: string, q: string): boolean =>
  key.split(' ').some((w) => w.startsWith(q));

const INDEX: IndexRow[] = CATALOGUE.map((food) => {
  const keys = new Set<string>();
  const n = canonical(food.name);
  keys.add(n);
  for (const a of food.aliases ?? []) keys.add(canonical(a));
  for (const [base, extra] of Object.entries(EXTRA_ALIASES)) {
    if (n.includes(base)) for (const e of extra) keys.add(canonical(e));
  }
  keys.delete(n);
  return { food, keys: [n, ...keys], aliasFrom: 1, name: n, provenance: food.provenance ?? 'estimated' };
});

/* -------------------------- spelling tolerance ---------------------------- */

/** Bounded Levenshtein: stops as soon as it knows the distance exceeds max. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const editBudget = (w: string) => (w.length <= 4 ? 0 : w.length <= 7 ? 1 : 2);

const respell = (w: string) => RESPELL[w] ?? w;

/* ------------------------------- scoring ---------------------------------- */

/* Relevance first, evidence second. A measured food and a guessed one that
   match a query equally well are not equally useful, but a measured food
   that barely matches should never outrank an exact hit. */
function score(row: IndexRow, q: string, qWords: string[]): number {
  let best = 0;
  for (let i = 0; i < row.keys.length; i++) {
    const key = row.keys[i];
    let s = 0;
    if (key === q) s = 100;
    /* A whole word beats a prefix, and is checked first. "dal" prefixes
       "dalma" more tightly than "dal fry", so a length-penalised prefix
       score put an Odia vegetable dish above every actual dal. */
    else if (key.split(' ').includes(q)) {
      /* Where the word sits matters. "Chicken curry" and "Poultry, chicken,
         liver" both contain the word; only one is what someone logging
         dinner meant. A word at the front of a name is the subject of that
         name, so it gets the higher score. */
      s = key.split(' ')[0] === q ? 90 : 78;
    }
    else if (key.startsWith(q)) s = 80 - Math.min(20, key.length - q.length);
    else if (wordStarts(key, q)) s = 60;
    /* A bare substring is only allowed to match for a query long enough for
       the coincidence to be unlikely. Without this, "dal" matches "Kadali"
       and a real dal ends up below a banana variety. */
    else if (q.length > 4 && key.includes(q)) s = 50;
    /* An alias hit is a real hit, just a weaker one. IFCT lists ten regional
       names per food, and short common words collide with them constantly. */
    if (s > 0 && i >= row.aliasFrom) s -= 25;
    best = Math.max(best, s);
  }
  if (best === 0 && qWords.length) {
    /* every query word has to land somewhere, or it is not a match */
    const keyWords = row.keys.flatMap((k) => k.split(' '));
    const hit = qWords.every((w) =>
      keyWords.some((kw) => kw === w || kw.startsWith(w) || (w.length > 3 && kw.includes(w))),
    );
    if (hit) best = 40;
  }
  if (best === 0) {
    const keyWords = row.keys.flatMap((k) => k.split(' '));
    const fuzzy = qWords.every((w) =>
      keyWords.some((kw) => withinEdits(w, kw, editBudget(w))),
    );
    if (fuzzy) best = 20;
  }
  if (best === 0) {
    if (row.food.tags.some((t) => canonical(t) === q)) best = 15;
    else if (row.food.ingredients.some((i) => canonical(i).includes(q))) best = 10;
  }
  return best === 0 ? 0 : best * 10 + PROVENANCE_RANK[row.provenance];
}

/* ------------------------------- the API ---------------------------------- */

export interface SearchOptions {
  limit?: number;
  /** foods the user created, searched alongside the catalogue */
  custom?: FoodItem[];
  category?: FoodItem['category'];
  vegOnly?: boolean;
}

export function searchCatalogue(query: string, opts: SearchOptions = {}): FoodItem[] {
  const { limit = 30, custom = [], category, vegOnly } = opts;

  const pool: IndexRow[] = custom.length
    ? [
        ...custom.map((food) => ({
          food,
          keys: [canonical(food.name), ...(food.aliases ?? []).map(canonical)],
          aliasFrom: 1,
          name: canonical(food.name),
          provenance: 'user' as Provenance,
        })),
        ...INDEX,
      ]
    : INDEX;

  const filtered = pool.filter(
    (r) => (!category || r.food.category === category) && (!vegOnly || r.food.veg),
  );

  const raw = canonical(query);
  if (!raw) {
    /* An empty query is a browse, not a search: show the best-evidenced
       everyday foods rather than whatever happens to sort first. */
    return filtered
      .slice()
      .sort((a, b) => PROVENANCE_RANK[b.provenance] - PROVENANCE_RANK[a.provenance])
      .slice(0, limit)
      .map((r) => r.food);
  }

  const qWords = words(raw).map(respell);
  const q = qWords.join(' ');

  const scored: { row: IndexRow; s: number }[] = [];
  for (const row of filtered) {
    const s = score(row, q, qWords);
    if (s > 0) scored.push({ row, s });
  }

  return scored
    .sort((a, b) => b.s - a.s || a.row.name.length - b.row.name.length)
    .slice(0, limit)
    .map((x) => x.row.food);
}
