import { RECIPES } from '../src/lib/recipe-db';
import { resolveIngredient } from '../src/lib/ingredient-db';

/* Sanity checks on the seed recipe set. Not a taste test — an arithmetic and
   consistency test, which is the part a reader can actually verify. */

let problems = 0;
const flag = (id: string, msg: string) => {
  problems++;
  console.log(`  ${id.padEnd(28)} ${msg}`);
};

const ids = new Set<string>();
const unresolved = new Set<string>();

console.log('ISSUES');
for (const r of RECIPES) {
  if (ids.has(r.id)) flag(r.id, 'duplicate id');
  ids.add(r.id);

  // Macros must roughly reconstruct the stated calories.
  const fromMacros = r.protein * 4 + r.carbs * 4 + r.fat * 9;
  const drift = Math.round(((fromMacros - r.kcal) / r.kcal) * 100);
  if (Math.abs(drift) > 18) flag(r.id, `macros imply ${Math.round(fromMacros)} kcal but says ${r.kcal} (${drift}%)`);

  // Diet flags must be internally consistent.
  if (r.vegan && !r.veg) flag(r.id, 'vegan but not marked veg');
  if (r.egg && r.veg) flag(r.id, 'contains egg but marked veg');
  // Peanut butter is not dairy, so it must not trip this check.
  if (r.vegan && r.ingredients.some((i) => /paneer|curd|\bmilk\b|ghee|(?<!peanut )\bbutter\b|cheese|yogurt|cream/i.test(i.name))) {
    flag(r.id, 'marked vegan but has a dairy ingredient');
  }
  if (!r.veg && !r.ingredients.some((i) => /chicken|fish|prawn|mutton|egg|rohu|basa/i.test(i.name))) {
    flag(r.id, 'marked non-veg but has no animal ingredient');
  }

  // Every ingredient must be priceable, or the cost is a guess.
  for (const i of r.ingredients) if (!resolveIngredient(i.name)) unresolved.add(`${r.id}: ${i.name}`);

  if (r.costRupees < 5) flag(r.id, `cost came out at ₹${r.costRupees}`);
  if (r.prepMins < 0 || r.prepMins > 90) flag(r.id, `prep time ${r.prepMins} min`);
  if (!r.steps.length) flag(r.id, 'no steps');
  if (r.noCook && r.prepMins > 12) flag(r.id, `marked no-cook but takes ${r.prepMins} min`);
  if (r.kitchens.includes('hostel') && !r.noCook && !r.equipment.some((e) => ['kettle', 'microwave', 'stove'].includes(e))) {
    flag(r.id, 'hostel-compatible but needs equipment it does not declare');
  }
}

if (unresolved.size) {
  console.log('\nUNPRICED INGREDIENTS');
  for (const u of unresolved) console.log('  ' + u);
  problems += unresolved.size;
}

/* Coverage: the point of a bigger set is that no slot runs out of options. */
console.log('\nCOVERAGE');
const slots = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
for (const s of slots) {
  const all = RECIPES.filter((r) => r.slots.includes(s));
  const veg = all.filter((r) => r.veg);
  const vegan = all.filter((r) => r.vegan);
  const quick = all.filter((r) => r.prepMins <= 15);
  const hostel = all.filter((r) => r.kitchens.includes('hostel'));
  const cheap = all.filter((r) => r.costRupees <= 50);
  const highP = all.filter((r) => r.protein >= 20);
  console.log(
    `  ${s.padEnd(10)} total ${String(all.length).padStart(3)} | veg ${String(veg.length).padStart(3)} | vegan ${String(vegan.length).padStart(3)} | <=15min ${String(quick.length).padStart(3)} | hostel ${String(hostel.length).padStart(3)} | <=Rs50 ${String(cheap.length).padStart(3)} | >=20g P ${String(highP.length).padStart(3)}`,
  );
}

const cuisines = new Map<string, number>();
for (const r of RECIPES) cuisines.set(r.cuisine, (cuisines.get(r.cuisine) ?? 0) + 1);
console.log('\n  cuisines: ' + [...cuisines].map(([c, n]) => `${c} ${n}`).join(', '));
console.log(`\n${RECIPES.length} recipes, ${problems} problems`);
if (problems) process.exitCode = 1;
