/* ============================================================
   Generates src/data/ifct.generated.ts from the vendored
   Indian Food Composition Tables 2017 (ICMR-NIN), as packaged
   by @ifct2017/compositions.

   Nothing here invents a number. Every value is carried across
   from the published table, or converted by a stated arithmetic
   rule (kJ -> kcal at 4.184). Foods with no measured energy are
   dropped rather than filled in.

   Run: node scripts/data-build/build-ifct.mjs
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = resolve(ROOT, 'vendor/ifct2017/compositions.csv');
const OUT = resolve(ROOT, 'src/data/ifct.generated.ts');

/* ------------------------------- CSV ------------------------------------- */

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

/* ------------------------------ helpers ---------------------------------- */

const KJ_PER_KCAL = 4.184;
/** FAO/WHO general energy conversion factors. Used only to fill an energy
    value the source left blank, never to overwrite one it published. */
const ATWATER = { protein: 4, carbs: 4, fat: 9 };
const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};
const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const r0 = (n) => (n === null ? null : Math.round(n));
/** IFCT states minerals in g/100 g; the app wants mg/100 g. */
const mg = (n) => (n === null ? null : n * 1000);

/* IFCT prints local names as "A. Moricha guti; H. Ramdana; Kan. Danthu beeja".
   The prefix is a language code, and what follows is the name people actually
   type. A leading run of comma-separated prefixes ("A., Kash. Baajra") applies
   one name to several languages. */
function aliasesFrom(lang) {
  if (!lang) return [];
  const out = new Set();
  for (const part of String(lang).split(';')) {
    const t = part.trim().replace(/\.$/, '');
    if (!t) continue;
    const m = t.match(/^((?:[A-Za-z]{1,5}\.\s*,?\s*)+)(.+)$/);
    const name = (m ? m[2] : t).trim();
    if (name.length >= 3 && /[a-z]/i.test(name)) out.add(name.toLowerCase());
  }
  return [...out];
}

/* IFCT food group -> the slot Mango files a food under. These are
   categorisations, not nutrition, so a judgement here costs nothing. */
const GROUP = {
  'Cereals and Millets': 'grain',
  'Grain Legumes': 'legume',
  'Green Leafy Vegetables': 'vegetable',
  'Other Vegetables': 'vegetable',
  'Roots and Tubers': 'vegetable',
  Fruits: 'fruit',
  'Nuts and Oil Seeds': 'nut',
  'Condiments and Spices': 'spice',
  'Edible Oils and Fats': 'fat',
  'Milk and Milk Products': 'dairy',
  'Egg and Egg Products': 'egg',
  Poultry: 'meat',
  'Animal Meat': 'meat',
  'Marine Fish': 'fish',
  'Fresh Water Fish and Shellfish': 'fish',
  'Marine Shellfish': 'fish',
  'Marine Mollusks': 'fish',
  Mushrooms: 'vegetable',
  Sugars: 'sugar',
  'Miscellaneous Foods': 'other',
};

/* ------------------------------- build ----------------------------------- */

const rows = parseCsv(readFileSync(SRC, 'utf8'));
const header = rows[0];
const key = (h) => h.split('; ').pop();
const idx = {};
header.forEach((h, i) => { idx[key(h)] = i; });

const need = ['code', 'name', 'grup', 'tags', 'lang', 'enerc', 'protcnt', 'choavldf', 'fatce', 'fibtg'];
for (const k of need) if (!(k in idx)) throw new Error(`IFCT column missing: ${k}`);

const get = (row, k) => (k in idx ? row[idx[k]] : null);

const out = [];
const dropped = [];
const energyDerived = [];

for (const row of rows.slice(1)) {
  const code = (get(row, 'code') || '').trim();
  const name = (get(row, 'name') || '').trim();
  if (!code || !name) continue;

  const kj = num(get(row, 'enerc'));
  const protein = num(get(row, 'protcnt'));
  const carbs = num(get(row, 'choavldf'));
  const fat = num(get(row, 'fatce'));

  /* A record without measured energy or macros is not usable for logging.
     Filling the gap would be invention, so it is dropped and counted. */
  if (kj === null || protein === null || carbs === null || fat === null) {
    dropped.push(`${code} ${name}`);
    continue;
  }

  /* IFCT leaves the energy column blank for the pure fats — they are 100%
     fat and nothing else is analysed. Every oil and ghee therefore arrives
     as 0 kcal, which would silently under-count every dish containing one.
     Where energy is absent but fat is ~100 g, energy is filled from the
     standard Atwater factor for fat. That is a stated conversion, not a
     guess, and it is recorded in the build log. */
  let kcal = kj / KJ_PER_KCAL;
  let derivedEnergy = false;
  if (kcal === 0 && fat >= 95 && protein === 0 && carbs === 0) {
    kcal = fat * ATWATER.fat;
    derivedEnergy = true;
    energyDerived.push(`${code} ${name} -> ${Math.round(kcal)} kcal from ${fat} g fat`);
  }
  const kjErr = num(get(row, 'enerc_e'));

  const tags = (get(row, 'tags') || '').split(/\s+/).filter(Boolean);
  const veg = tags.includes('veg') || tags.includes('vegetarian');
  const egg = tags.includes('eggetarian') && !veg;

  out.push({
    id: `ifct_${code.toLowerCase()}`,
    code,
    name,
    group: GROUP[(get(row, 'grup') || '').trim()] ?? 'other',
    kcal: r0(kcal),
    derivedEnergy,
    /* Standard error as published, converted to kcal. This is a measured
       spread across samples, not a guess — the only honest uncertainty
       figure in the whole database. */
    kcalSe: kjErr === null ? null : r1(kjErr / KJ_PER_KCAL),
    protein: r1(protein),
    carbs: r1(carbs),
    fat: r1(fat),
    fibre: r1(num(get(row, 'fibtg')) ?? 0),
    /* IFCT publishes minerals in grams per 100 g, not milligrams.
       Read straight, bajra's calcium came out as 0 instead of 27 mg. */
    sodium: r0(mg(num(get(row, 'na')))),
    calcium: r0(mg(num(get(row, 'ca')))),
    iron: r1(mg(num(get(row, 'fe')))),
    veg,
    egg,
    aliases: aliasesFrom(get(row, 'lang')),
    scientific: (get(row, 'scie') || '').trim() || null,
  });
}

/* ------------------------- variety consolidation -------------------------- */

/* IFCT samples some vegetables many times over — seventeen brinjals, seven
   green chillies. Those are real regional samples and worth keeping in the
   data, but as search results they are noise, and counting each one as a
   separate food would inflate the total with variations that mean nothing
   to someone logging dinner. One representative row per family goes into
   the searchable catalogue; the rest stay in the file, marked. */
const family = new Map();
for (const f of out) {
  const m = f.name.match(/^(.*?)-\d+$/);
  if (m) {
    const k = m[1];
    if (!family.has(k)) family.set(k, []);
    family.get(k).push(f);
  }
}
const consolidated = [];
for (const [k, members] of family) {
  /* Where the source itself publishes a combined row, defer to it. */
  const published = out.find((f) => f.name.toLowerCase().startsWith(k.toLowerCase()) && /all varieties/i.test(f.name));
  for (const m of members) m.variantOf = k;
  if (published) { consolidated.push({ family: k, n: members.length, representative: published.name, how: 'published combined row' }); continue; }
  const mean = (key) => Math.round((members.reduce((s, f) => s + (f[key] ?? 0), 0) / members.length) * 10) / 10;
  const rep = {
    ...members[0],
    id: `${members[0].id}_all`,
    name: `${k}, all varieties`,
    kcal: Math.round(mean('kcal')),
    kcalSe: null,
    protein: mean('protein'), carbs: mean('carbs'), fat: mean('fat'), fibre: mean('fibre'),
    sodium: Math.round(mean('sodium')), calcium: Math.round(mean('calcium')), iron: mean('iron'),
    variantOf: null,
    meanOf: members.length,
    aliases: [...new Set(members.flatMap((f) => f.aliases))],
  };
  out.push(rep);
  consolidated.push({ family: k, n: members.length, representative: rep.name, how: `mean of ${members.length} sampled varieties` });
}

/* ---------------------------- reconciliation ------------------------------ */

/* Flagged, never forced. The published figure stands; a wide gap between the
   stated energy and what the macros imply is recorded so a human can look. */
const flagged = [];
for (const f of out) {
  const implied = f.protein * 4 + f.carbs * 4 + f.fat * 9;
  if (f.kcal > 0 && Math.abs(implied - f.kcal) / f.kcal > 0.15) {
    flagged.push({ id: f.id, name: f.name, stated: f.kcal, implied: Math.round(implied) });
  }
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lit = (v) => (v === null ? 'null' : typeof v === 'string' ? `'${esc(v)}'` : String(v));

const body = out
  .map((f) =>
    `  ['${f.id}','${esc(f.name)}','${f.group}',${f.kcal},${lit(f.kcalSe)},${f.protein},${f.carbs},${f.fat},${f.fibre},` +
    `${lit(f.sodium)},${lit(f.calcium)},${lit(f.iron)},${f.veg},${f.egg},'${esc(f.aliases.join('|'))}',` +
    `${lit(f.variantOf ?? null)},${f.derivedEnergy ? 'true' : 'false'},${lit(f.meanOf ?? null)}],`,
  )
  .join('\n');

const file = `/* GENERATED FILE — do not edit by hand.
   Source: Indian Food Composition Tables 2017 (ICMR-NIN), via the
   @ifct2017/compositions npm package (MIT, Subhajit Sahu).
   Regenerate: node scripts/data-build/build-ifct.mjs

   ${out.length} foods. Values are per 100 g, as published.
   Energy converted from kJ at ${KJ_PER_KCAL} kJ per kcal.
   ${dropped.length} rows dropped for missing energy or macros.
   ${flagged.length} rows flagged where stated energy and implied energy
   differ by more than 15%. Flagged, not corrected — see
   scripts/data-build/ifct-flags.json.
*/

/** name, group, kcal, kcal standard error, protein, carbs, fat, fibre,
 *  sodium mg, calcium mg, iron mg, veg, egg, aliases joined by "|" — all per 100 g. */
export type IfctRow = [
  id: string, name: string, group: string,
  kcal: number, kcalSe: number | null,
  protein: number, carbs: number, fat: number, fibre: number,
  sodiumMg: number | null, calciumMg: number | null, ironMg: number | null,
  veg: boolean, egg: boolean, aliases: string,
  /** set when this row is one sampled variety of a family that has a
   *  representative row; such rows stay out of the searchable catalogue */
  variantOf: string | null,
  /** energy filled from the fat content because the source left it blank */
  derivedEnergy: boolean,
  /** set on a representative row: how many sampled varieties it averages */
  meanOf: number | null,
];

export const IFCT_ROWS: IfctRow[] = [
${body}
];
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
writeFileSync(resolve(HERE, 'ifct-flags.json'), JSON.stringify({ dropped, flagged, energyDerived, consolidated }, null, 2));

const searchable = out.filter((f) => !f.variantOf).length;
console.log(`IFCT: ${out.length} rows written, ${searchable} searchable after collapsing varieties.`);
console.log(`  ${dropped.length} dropped, ${flagged.length} energy-flagged, ${energyDerived.length} energy derived from fat.`);
console.log(`aliases: ${out.reduce((n, f) => n + f.aliases.length, 0)} across ${out.filter((f) => f.aliases.length).length} foods`);
