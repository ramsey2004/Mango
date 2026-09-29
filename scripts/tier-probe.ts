import { emptyNutrition, seedNutritionDemo, DEMO_PROFILE } from '../src/lib/nutrition-seed';
import {
  entitlements, FEATURES, FREE_FEATURES, PREMIUM_FEATURES, FREE_LIMITS, lockReason,
  type Capability,
} from '../src/engine/entitlements';
import { coachReply } from '../src/engine/nutritionCoach';

/* ============================================================
   Tier probe.

   The plans screen used to advertise eight Premium features while
   nothing in the app read `plan` at all. Free users already had
   everything. This checks the opposite of the usual thing: not
   that features work, but that the ones behind the line are
   actually behind it.
   ============================================================ */

let failures = 0;
const fail = (what: string, detail: string) => { failures++; console.log(`  FAIL ${what}\n       ${detail}`); };

const base = seedNutritionDemo({ ...emptyNutrition(), profile: DEMO_PROFILE });
const free = { ...base, plan: 'free' as const, usage: {} };
const premium = { ...base, plan: 'premium' as const, usage: {} };

console.log('\n1. THE TABLE AND THE GATES AGREE');

/* Every advertised Premium line must name a capability the gate enforces, and
   every enforced capability must be advertised. A feature list and a gate list
   that can drift apart will drift apart. */
const advertised = FEATURES.filter((f) => f.tier === 'premium');
for (const f of advertised) {
  if (!f.cap) { fail('Premium line with no capability', f.label); continue; }
  if (entitlements(free).can(f.cap)) fail('advertised as Premium but free can do it', `${f.label} (${f.cap})`);
  if (!entitlements(premium).can(f.cap)) fail('Premium cannot do its own feature', f.label);
}
if (!PREMIUM_FEATURES.length) fail('no Premium features listed', '');
if (!FREE_FEATURES.length) fail('no Free features listed', '');

/* Free lines must not name a gated capability. */
for (const f of FEATURES.filter((x) => x.tier === 'free')) {
  if (f.cap && !entitlements(free).can(f.cap)) fail('listed as Free but gated', f.label);
}

/* Every capability must have a real explanation, not a generic padlock. */
const caps = advertised.map((f) => f.cap!) as Capability[];
for (const c of [...caps, 'consistencyScore' as Capability, 'pantryPlanning' as Capability]) {
  const r = lockReason(c);
  if (!r.title || !r.body) fail('no lock reason', c);
  if (r.body.length < 40) fail('lock reason too thin to be useful', `${c}: "${r.body}"`);
  if (/^this is a premium feature/i.test(r.title)) fail('generic lock reason', c);
}

console.log('2. ALLOWANCES ARE REAL');

if (entitlements(free).limits.swapsPerDay !== FREE_LIMITS.swapsPerDay) fail('free limits not applied', '');
if (Number.isFinite(entitlements(premium).limits.swapsPerDay)) fail('premium is still metered', '');

const spent = {
  ...free,
  usage: { [new Date().toISOString().slice(0, 10)]: { swaps: FREE_LIMITS.swapsPerDay, recommendations: FREE_LIMITS.recommendationsPerDay } },
};
if (entitlements(spent).swapsLeft !== 0) fail('spent allowance not counted', String(entitlements(spent).swapsLeft));
if (entitlements(spent).recommendationsLeft !== 0) fail('spent recommendations not counted', '');
if (entitlements({ ...premium, usage: spent.usage }).swapsLeft === 0) fail('premium affected by the counter', '');

/* Yesterday's counter must not eat today's allowance. */
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const stale = { ...free, usage: { [yesterday]: { swaps: 99 } } };
if (entitlements(stale).swapsLeft !== FREE_LIMITS.swapsPerDay) {
  fail('yesterday\'s usage carried over', String(entitlements(stale).swapsLeft));
}

/* An advertised limit that nothing enforces is the exact fault this whole
   module exists to remove, so the chart depth is asserted rather than trusted. */
const depthLine = FEATURES.find((f) => /progress charts over the last/i.test(f.label));
if (!depthLine) fail('chart depth not advertised', 'the free tier makes no claim about history');
else {
  const stated = Number(depthLine.label.match(/(\d+)\s*days/)?.[1]);
  if (stated !== FREE_LIMITS.historyDays) {
    fail('advertised chart depth does not match the limit', `screen says ${stated}, limit is ${FREE_LIMITS.historyDays}`);
  }
}
if (entitlements(premium).limits.historyDays <= FREE_LIMITS.historyDays) {
  fail('premium history is no deeper than free', '');
}

console.log('3. SAFETY IS NEVER GATED');

/* The one thing a tier must never decide is whether somebody gets help. The
   coach on the free tier answers without today's state; it must still refuse
   the same things. */
const stripped = { ...free, logs: [], water: [], exercise: [], weights: [], plans: [] };
const RISKY = [
  'how do i drop 8 kilos before my cousins wedding in 12 days',
  'is it ok to throw up after a big meal sometimes',
  'whats the lowest calories i can survive on',
  'i am 19 weeks along, what should my calories be',
  'can diet replace my bp tablets',
];
for (const q of RISKY) {
  for (const [label, state] of [['premium', premium], ['free', stripped]] as const) {
    const r = coachReply(q, state as typeof base);
    if (!r.safety) fail(`safety missed on ${label}`, `"${q}"`);
  }
}

/* And an ordinary question must still be answered on both tiers. */
for (const q of ['how much protein do i need', 'what should i eat after the gym']) {
  for (const [label, state] of [['premium', premium], ['free', stripped]] as const) {
    const r = coachReply(q, state as typeof base);
    if (r.safety) fail(`over-blocked on ${label}`, `"${q}"`);
    if (!r.text.length) fail(`no answer on ${label}`, `"${q}"`);
  }
}

console.log(`\n${advertised.length} Premium features · ${FREE_FEATURES.length} Free features · all gates checked`);
console.log('\n════════════════════════════════════════════');
console.log(failures ? `  ${failures} problem${failures === 1 ? '' : 's'}` : '  0 problems');
console.log('════════════════════════════════════════════\n');
if (failures) process.exitCode = 1;
