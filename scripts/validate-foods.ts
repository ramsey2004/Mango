import { CATALOGUE, DUPLICATES, countsByProvenance, DISHES, canonical } from '../src/data/catalogue';
import { searchCatalogue } from '../src/data/search';
import { IFCT_ROWS } from '../src/data/ifct.generated';
import { SUPPLEMENTARY } from '../src/data/supplementary';

/* ============================================================
   The food catalogue's own test.

   The headline assertion is the one that matters: if the build
   produces fewer than a thousand distinct, loggable, complete
   records, this exits non-zero and the build fails. Everything
   else exists so that the thousand are worth having.
   ============================================================ */

const REQUIRED = 1000;

let failures = 0;
const fail = (msg: string) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg: string) => console.log(`  ok    ${msg}`);
const group = (name: string) => console.log(`\n${name}`);

/* ------------------------------- counts ---------------------------------- */

group('Counts');

const counts = countsByProvenance();
const total = CATALOGUE.length;

console.log(`  catalogue entries          ${total}`);
console.log(`    measured (IFCT 2017)     ${counts.verified}`);
console.log(`    calculated from recipes  ${counts.computed}`);
console.log(`    estimated                ${counts.estimated}`);
console.log(`  dishes computed            ${DISHES.length}`);
console.log(`  duplicate entries dropped  ${DUPLICATES.length}`);
console.log(`  IFCT rows vendored         ${IFCT_ROWS.length}`);
console.log(`  supplementary ingredients  ${SUPPLEMENTARY.length}`);

const byCategory = CATALOGUE.reduce<Record<string, number>>((a, f) => ({ ...a, [f.category]: (a[f.category] ?? 0) + 1 }), {});
console.log(`  by category                ${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}`);

const indian = CATALOGUE.filter((f) => f.cuisine !== 'Continental').length;
const drinks = CATALOGUE.filter((f) => f.tags.includes('drink')).length;
const snacks = CATALOGUE.filter((f) => f.category === 'snack').length;
console.log(`  Indian-cuisine entries     ${indian}`);
console.log(`  beverages                  ${drinks}`);
console.log(`  snacks                     ${snacks}`);

if (total >= REQUIRED) pass(`at least ${REQUIRED} entries (${total})`);
else fail(`only ${total} entries, ${REQUIRED} required`);

/* ---------------------------- completeness -------------------------------- */

group('Completeness');

const missing = {
  name: CATALOGUE.filter((f) => !f.name?.trim()),
  kcal: CATALOGUE.filter((f) => typeof f.kcal !== 'number' || Number.isNaN(f.kcal)),
  protein: CATALOGUE.filter((f) => typeof f.protein !== 'number' || Number.isNaN(f.protein)),
  serving: CATALOGUE.filter((f) => !f.servingLabel?.trim()),
  provenance: CATALOGUE.filter((f) => !f.provenance),
};
for (const [field, rows] of Object.entries(missing)) {
  if (rows.length === 0) pass(`every entry has ${field}`);
  else fail(`${rows.length} entries missing ${field} — e.g. ${rows.slice(0, 3).map((r) => r.id).join(', ')}`);
}

/* Serving weight is allowed to be zero only for the legacy recipes, which
   state a serving without a weight. Everything else must carry grams. */
const noGrams = CATALOGUE.filter((f) => !f.servingGrams && !f.id.startsWith('r_'));
if (noGrams.length === 0) pass('every non-recipe entry has a serving weight');
else fail(`${noGrams.length} entries have no serving weight — e.g. ${noGrams.slice(0, 3).map((r) => r.id).join(', ')}`);

/* ------------------------------ duplicates -------------------------------- */

group('Duplicates');

const ids = new Set<string>();
const dupIds = CATALOGUE.filter((f) => (ids.has(f.id) ? true : (ids.add(f.id), false)));
if (dupIds.length === 0) pass('no repeated ids');
else fail(`${dupIds.length} repeated ids`);

const names = new Map<string, string>();
const dupNames: string[] = [];
for (const f of CATALOGUE) {
  const k = canonical(f.name);
  if (names.has(k)) dupNames.push(`${f.name} (${f.id} vs ${names.get(k)})`);
  else names.set(k, f.id);
}
if (dupNames.length === 0) pass('no two entries normalise to the same name');
else fail(`${dupNames.length} duplicate names — e.g. ${dupNames.slice(0, 3).join('; ')}`);

/* --------------------------- nutrition sanity ----------------------------- */

group('Nutrition');

const negative = CATALOGUE.filter(
  (f) => f.kcal < 0 || f.protein < 0 || f.carbs < 0 || f.fat < 0 || f.fibre < 0,
);
if (negative.length === 0) pass('no negative values');
else fail(`${negative.length} entries with a negative value`);

/* Density, not total. A thali really can be a thousand calories; what cannot
   happen is a food carrying more energy per gram than pure fat. */
const absurd = CATALOGUE.filter(
  (f) => f.kcal > 2000 || (f.servingGrams > 0 && f.kcal / f.servingGrams > 9.5),
);
if (absurd.length === 0) pass('no entry is denser than pure fat');
else fail(`${absurd.length} entries denser than pure fat — ${absurd.slice(0, 3).map((f) => `${f.name} ${f.kcal}kcal/${f.servingGrams}g`).join('; ')}`);

/* Reconciliation is REPORTED, never enforced. Composition tables use their
   own Atwater factors and a real food can legitimately disagree with the
   4/4/9 shorthand by a margin. Forcing agreement would destroy measured
   data to satisfy arithmetic. */
const recon = CATALOGUE
  .filter((f) => f.kcal > 20)
  .map((f) => ({ f, gap: (f.protein * 4 + f.carbs * 4 + f.fat * 9 - f.kcal) / f.kcal }))
  .filter((x) => Math.abs(x.gap) > 0.2);

console.log(`  entries where macros imply an energy value more than 20% from the stated one: ${recon.length}`);
for (const x of recon.slice(0, 10)) {
  console.log(`    ${x.f.name} — stated ${x.f.kcal}, macros imply ${Math.round(x.f.protein * 4 + x.f.carbs * 4 + x.f.fat * 9)} (${x.gap > 0 ? '+' : ''}${Math.round(x.gap * 100)}%)`);
}
console.log('  (flagged for review, not corrected — see section 15 of the brief)');

/* -------------------------------- search ---------------------------------- */

group('Search');

/* Each of these is a query a real person types, paired with something that
   must appear in the first few results. They cover exact names, English
   words for Indian foods, transliteration, misspelling and brand-free
   generic terms. */
const QUERIES: [query: string, mustFind: string][] = [
  ['paneer', 'paneer'],
  ['chicken', 'chicken'],
  ['dal', 'dal'],
  ['paratha', 'paratha'],
  ['rajma', 'rajma'],
  ['banana', 'banana'],
  ['coffee', 'coffee'],
  ['biryani', 'biryani'],
  ['aloo parantha', 'aloo paratha'],
  ['panner', 'paneer'],
  ['idly', 'idli'],
  ['biriyani', 'biryani'],
  ['chapati', 'roti'],
  ['bhindi', 'ladies finger'],
  ['palak', 'spinach'],
  ['baingan', 'brinjal'],
  ['anda', 'egg'],
  ['dahi', 'curd'],
  ['moong', 'moong dal'],
  ['lauki', 'bottle gourd'],
  ['chai', 'chai'],
  ['khichdi', 'khichdi'],
  ['samosa', 'samosa'],
  ['gulab jamun', 'gulab jamun'],
  ['lassi', 'lassi'],
  ['oats', 'oats'],
  ['egg', 'egg'],
  ['roti', 'roti'],
];

for (const [q, expect] of QUERIES) {
  const hits = searchCatalogue(q, { limit: 6 }).map((f) => f.name.toLowerCase());
  if (hits.some((h) => h.includes(expect))) pass(`"${q}" finds ${expect}`);
  else fail(`"${q}" did not find "${expect}" in the top 6 — got ${hits.slice(0, 4).join(', ') || 'nothing'}`);
}

const empty = searchCatalogue('', { limit: 10 });
if (empty.length === 10) pass('an empty query browses rather than returning nothing');
else fail('an empty query returned nothing');

const nonsense = searchCatalogue('qwertyzzz', { limit: 5 });
if (nonsense.length === 0) pass('a nonsense query returns nothing rather than guessing');
else fail(`a nonsense query returned ${nonsense.length} results — ${nonsense.map((f) => f.name).join(', ')}`);

/* Speed matters more than it looks: this runs on every keystroke. */
const t0 = Date.now();
for (let i = 0; i < 200; i++) searchCatalogue('pan', { limit: 20 });
const perQuery = (Date.now() - t0) / 200;
if (perQuery < 15) pass(`search takes ${perQuery.toFixed(1)} ms per query`);
else fail(`search takes ${perQuery.toFixed(1)} ms per query, too slow to run on every keystroke`);

/* ------------------------------ provenance -------------------------------- */

group('Provenance');

if (counts.verified > 400) pass(`${counts.verified} entries come from a published composition table`);
else fail(`only ${counts.verified} measured entries`);

const computedClaimingMeasured = DISHES.filter((d) => d.provenance === 'verified');
if (computedClaimingMeasured.length === 0) pass('no calculated dish claims to be measured');
else fail(`${computedClaimingMeasured.length} calculated dishes labelled measured`);

/* ------------------------------- summary ---------------------------------- */

console.log(`\n${failures === 0 ? 'Food catalogue: all checks passed.' : `Food catalogue: ${failures} check(s) failed.`}`);
console.log(`ACTUAL RECORDS IN THE CATALOGUE: ${total}`);

if (failures > 0) process.exit(1);
if (total < REQUIRED) process.exit(1);
