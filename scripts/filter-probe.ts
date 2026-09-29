/* ============================================================
   Hard-filter probe.

   Allergies, dietary type and stated restrictions are the only
   promises in this app that must never bend. They are enforced in
   one place (isEligible), but there are several routes to a
   recommendation — the day planner, the scorer, pantry matching,
   the eat-now engine and the coach's offers — and a filter is only
   as good as its least careful caller. This walks every route.
   ============================================================ */

import { recommend, isEligible, fromPantry, buildDayPlan } from '../src/engine/mealRecommender';
import { eatNow } from '../src/engine/eatNow';
import { coachReply } from '../src/engine/nutritionCoach';
import { seedNutritionDemo, emptyNutrition, DEMO_PROFILE } from '../src/lib/nutrition-seed';
import { RECIPES, recipeById } from '../src/lib/recipe-db';

const base = seedNutritionDemo({ ...emptyNutrition(), profile: DEMO_PROFILE });

function violates(ids: string[], banned: string[], custom: any[] = []): string[] {
  const bad: string[] = [];
  for (const id of ids) {
    const r = recipeById(id, custom);
    if (!r) continue;
    // Ingredients and the dish name only. Tags like "no-onion-garlic" contain
    // the very words being searched for, and matching those is how a checker
    // reports a leak that is not there.
    const text = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
    for (const b of banned) if (b && text.includes(b.toLowerCase())) bad.push(`${r.name} contains ${b}`);
  }
  return bad;
}

const profiles: Array<[string, any, string[]]> = [
  ['peanut allergy', { ...DEMO_PROFILE, allergies: ['peanut'] }, ['peanut']],
  ['dairy + nut allergy', { ...DEMO_PROFILE, allergies: ['curd', 'almond', 'peanut'] }, ['curd', 'almond', 'peanut']],
  ['vegan', { ...DEMO_PROFILE, diet: 'vegan', allergies: [] }, ['paneer', 'curd', 'ghee', 'milk', 'egg', 'chicken', 'fish']],
  ['jain', { ...DEMO_PROFILE, diet: 'jain', allergies: [] }, ['onion', 'garlic', 'potato']],
  ['avoids soya', { ...DEMO_PROFILE, restrictions: ['soya'] }, ['soya']],
];

let problems = 0;
for (const [label, profile, banned] of profiles) {
  const n = { ...base, profile, rejected: [] as string[] };
  const paths: Array<[string, string[]]> = [];

  paths.push(['plan', buildDayPlan({ profile, pantry: [], trainedToday: false, recentRecipeIds: [], feedback: [], rejected: [] }).meals.map((m) => m.recipeId)]);

  const ctx = { profile, slot: 'lunch' as const, remaining: { kcal: 900, protein: 60, carbs: 100, fat: 30, fibre: 12 }, slotShare: 0.4, budgetLeft: 250, minutesAvailable: 30, pantry: [], trainedToday: false, recentRecipeIds: [], feedback: [], rejected: [] };
  paths.push(['recommend', recommend(ctx, RECIPES, 20).map((s) => s.recipe.id)]);

  paths.push(['fromPantry', fromPantry(profile, ['paneer', 'peanuts', 'curd', 'onion', 'soya chunks', 'almonds', 'potato'], RECIPES).map((m) => m.recipe.id)]);

  for (const where of ['kitchen', 'no-kitchen', 'eating-out'] as const) {
    const a = eatNow(n, { minutes: 45, where, hunger: 'hungry' });
    const ids = [a.best, ...a.alternatives].filter(Boolean).map((p: any) => p.suggestion.recipe.id);
    paths.push([`eatNow/${where}`, ids]);
  }

  for (const q of ['what should i eat now', 'i am hungry', 'give me a high protein meal', 'i dont have any ingredients']) {
    const r = coachReply(q, n);
    paths.push([`coach:"${q.slice(0, 18)}"`, (r.offers ?? []).map((o: any) => o.recipe.id)]);
  }

  console.log(`\n== ${label}`);
  for (const [path, ids] of paths) {
    const bad = violates(ids, banned);
    if (bad.length) { problems += bad.length; console.log(`  LEAK  ${path.padEnd(26)} ${bad.join('; ')}`); }
  }
  const anyLeak = paths.some(([, ids]) => violates(ids, banned).length);
  if (!anyLeak) console.log('  clean across every path');
}
console.log(`\n${problems} leaks`);
if (problems) process.exitCode = 1;
