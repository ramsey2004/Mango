import type { NutritionProfile } from '../src/lib/nutrition-types';
import {
  healthTargets, gate, producesTarget, bmi, bmiBand, waistReading,
  bmrEstimate, tdeeEstimate, palFor, palBandFor, assumedExerciseBurn,
  proteinEstimate, referenceWeightKg, perMealProtein, distributeProtein,
  macrosFor, macrosReconcile, burnEstimate, exerciseCredit,
  adaptiveMaintenance, weightTrend, rateSentence,
  PAL, PAL_BAND, FLOOR, DEFICIT, FIBRE_G_PER_1000_KCAL, KCAL_PER_G,
  MACRO_RECONCILE_TOLERANCE_KCAL, SOURCES, ADAPTIVE,
  type DayRecord,
} from '../src/engine/health';

/* ============================================================
   Health engine probe.

   Same discipline as the nutrition safety probe: the properties
   that must hold are asserted, not reviewed. The ones that
   matter most are at the bottom — a target must never fall below
   the floor, the safety gate must be unbypassable, and nothing
   may reach the UI as NaN.
   ============================================================ */

let failures = 0;
const fail = (what: string, detail: string) => { failures++; console.log(`  FAIL ${what}\n       ${detail}`); };

const P = (over: Partial<NutritionProfile> = {}): NutritionProfile => ({
  age: 26, sex: 'male', heightCm: 175, weightKg: 70,
  activity: 'sedentary', track: 'wellness', intents: [],
  kitchen: 'full', diet: 'veg', allergies: [], dislikes: [],
  cuisines: [], kitchens: [], budgetPerDay: 300, cookMinutes: 30,
  ...over,
} as NutritionProfile);

/* ------------------------------------------------------------------
   1. Every constant is attributable
   ------------------------------------------------------------------ */
console.log('\n1. PROVENANCE');
{
  for (const [k, c] of Object.entries(SOURCES)) {
    if (!c.finding || c.finding.length < 40) fail('citation too thin', k);
    if (c.key !== k) fail('citation key mismatch', k);
    if (k !== 'PRODUCT_JUDGEMENT' && k !== 'CUNNINGHAM_1980' && !c.url) {
      fail('evidence citation with no url', k);
    }
  }
  // Every activity factor must sit inside the FAO band claimed for it.
  for (const key of Object.keys(PAL) as Array<keyof typeof PAL>) {
    const v = PAL[key];
    const [lo, hi] = PAL_BAND[key];
    if (v < lo || v > hi) fail('activity factor outside its stated band', `${key}: ${v} not in ${lo}-${hi}`);
    if (v < 1.4) fail('activity factor below the FAO floor for free-living adults', `${key}: ${v}`);
  }
}

/* ------------------------------------------------------------------
   2. Invariants — properties, not examples
   ------------------------------------------------------------------ */
console.log('2. INVARIANTS');
{
  // BMI rises with weight at fixed height.
  for (let w = 40; w <= 140; w += 10) {
    if (!(bmi(w + 1, 170) > bmi(w, 170))) fail('BMI not monotonic in weight', `at ${w} kg`);
  }
  // BMR rises with weight and height, falls with age.
  const b = (o: Partial<NutritionProfile>) => bmrEstimate(P(o)).value;
  if (!(b({ weightKg: 80 }) > b({ weightKg: 70 }))) fail('BMR not increasing in weight', '');
  if (!(b({ heightCm: 185 }) > b({ heightCm: 175 }))) fail('BMR not increasing in height', '');
  if (!(b({ age: 50 }) < b({ age: 26 }))) fail('BMR not decreasing in age', '');

  // TDEE rises with activity, across the whole ladder.
  const ladder: Array<NutritionProfile['activity']> = ['sedentary', 'light', 'walking', 'cycling', 'running', 'sports', 'very_active'];
  for (let i = 1; i < ladder.length; i++) {
    const lo = tdeeEstimate(P({ activity: ladder[i - 1] })).value;
    const hi = tdeeEstimate(P({ activity: ladder[i] })).value;
    if (!(hi >= lo)) fail('TDEE not monotonic in activity', `${ladder[i - 1]} ${lo} → ${ladder[i]} ${hi}`);
  }

  // A band always contains its own value.
  for (const e of [bmrEstimate(P()), tdeeEstimate(P()), proteinEstimate(P()), burnEstimate('running', 30, 70)]) {
    if (e.value < e.band[0] || e.value > e.band[1]) fail('estimate outside its own band', `${e.value} vs ${e.band}`);
  }
}

/* ------------------------------------------------------------------
   3. Nothing unusable ever reaches the UI
   ------------------------------------------------------------------ */
console.log('3. NO NaN, NO INFINITY');
{
  const nasty: Array<Partial<NutritionProfile>> = [
    {}, { weightKg: NaN }, { heightCm: NaN }, { age: NaN },
    { weightKg: 0 }, { heightCm: 0 }, { age: 0 },
    { weightKg: -70 }, { weightKg: 1e9 }, { heightCm: 1e9 }, { age: 500 },
    { weightKg: undefined as unknown as number },
    { sex: 'other' }, { sex: undefined as unknown as NutritionProfile['sex'] },
    { activity: 'nonsense' as NutritionProfile['activity'] },
    { track: 'nonsense' as NutritionProfile['track'] },
    { weightKg: 25, heightCm: 250, age: 13, track: 'fat_loss' },
    { weightKg: 300, heightCm: 100, age: 100, track: 'muscle_gain' },
    { bodyFatPct: NaN }, { bodyFatPct: 0 }, { bodyFatPct: 95 },
  ];
  for (const o of nasty) {
    let t;
    try { t = healthTargets(P(o), 0); }
    catch (e) { fail('threw', `${JSON.stringify(o)} → ${(e as Error).message}`); continue; }
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number' && !Number.isFinite(v)) fail('non-finite output', `${k} from ${JSON.stringify(o)}`);
    }
    for (const e of [t.kcalEstimate, t.bmrEstimate, t.tdeeEstimate, t.proteinEstimate]) {
      if (!Number.isFinite(e.value) || !Number.isFinite(e.band[0]) || !Number.isFinite(e.band[1])) {
        fail('non-finite estimate', JSON.stringify(o));
      }
    }
  }
  // And with absurd exercise input.
  for (const burn of [NaN, -500, 1e7]) {
    const t = healthTargets(P(), burn as number);
    if (!Number.isFinite(t.kcal)) fail('non-finite kcal from burn', String(burn));
  }
}

/* ------------------------------------------------------------------
   4. The floor holds, and it is the new one
   ------------------------------------------------------------------ */
console.log('4. THE FLOOR');
{
  // The case the old fixed floors got wrong: a small woman in a deficit.
  const small = P({ sex: 'female', weightKg: 45, heightCm: 150, age: 30, track: 'fat_loss' });
  const t = healthTargets(small);
  const expectedFloor = Math.max(FLOOR.absolute, Math.round(bmrEstimate(small).value * FLOOR.bmrMultiple));
  if (t.kcal < expectedFloor) fail('target below the floor', `${t.kcal} < ${expectedFloor}`);
  if (t.kcal < FLOOR.absolute) fail('target below the absolute floor', String(t.kcal));
  // NICE classes 800-1200 kcal/day as a supervised low-calorie diet. Nothing
  // this engine produces unsupervised may land in that band.
  for (const prof of [
    small,
    P({ sex: 'female', weightKg: 40, heightCm: 145, age: 60, track: 'fat_loss', activity: 'sedentary' }),
    P({ sex: 'other', weightKg: 42, heightCm: 148, age: 55, track: 'fat_loss' }),
  ]) {
    const r = healthTargets(prof);
    if (r.kcal <= 1200) fail('target inside the supervised low-calorie band', `${r.kcal} kcal for ${prof.sex} ${prof.weightKg}kg`);
  }
  // The floor scales with the person rather than being flat.
  const big = healthTargets(P({ sex: 'female', weightKg: 95, heightCm: 170, track: 'fat_loss' }));
  const tiny = healthTargets(P({ sex: 'female', weightKg: 45, heightCm: 150, track: 'fat_loss' }));
  if (!(big.kcal > tiny.kcal)) fail('floor/target not scaling with body size', `${big.kcal} vs ${tiny.kcal}`);
}

/* ------------------------------------------------------------------
   5. The deficit is bounded three ways
   ------------------------------------------------------------------ */
console.log('5. DEFICIT BOUNDS');
{
  for (const w of [45, 60, 75, 95, 130]) {
    const p = P({ weightKg: w, track: 'fat_loss', activity: 'gym' });
    const t = healthTargets(p);
    const d = Math.abs(t.adjustment);
    if (d > DEFICIT.absoluteCap) fail('deficit above the absolute cap', `${d} at ${w} kg`);
    if (d > t.tdee * DEFICIT.fractionOfTdee + 1) fail('deficit above the TDEE fraction', `${d} at ${w} kg`);
    if (d > w * DEFICIT.kcalPerKgPerDay + 1) fail('deficit above the body-weight bound', `${d} at ${w} kg`);
  }
  // A lighter person must be asked for a smaller deficit than a heavier one.
  const light = Math.abs(healthTargets(P({ weightKg: 50, track: 'fat_loss' })).adjustment);
  const heavy = Math.abs(healthTargets(P({ weightKg: 100, track: 'fat_loss' })).adjustment);
  if (!(heavy > light)) fail('deficit does not scale with body weight', `${light} vs ${heavy}`);
  // And the app must not promise a rate.
  const t = healthTargets(P({ track: 'fat_loss' }));
  if (/half a kilo|kg a week|kilo a week/i.test(t.note)) fail('still promising a weekly rate', t.note);
}

/* ------------------------------------------------------------------
   6. Macros reconcile
   ------------------------------------------------------------------ */
console.log('6. MACROS');
{
  for (const w of [45, 70, 95, 140]) {
    for (const track of ['wellness', 'fat_loss', 'muscle_gain'] as const) {
      const p = P({ weightKg: w, track });
      const t = healthTargets(p);
      const sum = t.protein * KCAL_PER_G.protein + t.carbs * KCAL_PER_G.carbs + t.fat * KCAL_PER_G.fat;
      if (Math.abs(sum - t.kcal) > MACRO_RECONCILE_TOLERANCE_KCAL && !t.macroNotes.length) {
        fail('macros do not reconcile and nothing was said', `${w}kg ${track}: ${sum} vs ${t.kcal}`);
      }
      if (t.protein <= 0 || t.carbs <= 0 || t.fat <= 0) fail('non-positive macro', `${w}kg ${track}`);
    }
  }
  // Fat is a floor, not a share: in a deficit it must not fall below 0.8 g/kg.
  const cut = healthTargets(P({ weightKg: 90, track: 'fat_loss', sex: 'female', heightCm: 160 }));
  if (cut.fat < Math.round(90 * 0.8) - 1) fail('fat fell below the 0.8 g/kg floor in a deficit', String(cut.fat));

  // Fibre scales with maintenance, not with the suppressed target.
  const maint = healthTargets(P({ track: 'wellness' }));
  const deficit = healthTargets(P({ track: 'fat_loss' }));
  if (deficit.fibre < maint.fibre) fail('fibre target fell in a deficit', `${deficit.fibre} < ${maint.fibre}`);
  const expected = Math.round((maint.tdee / 1000) * FIBRE_G_PER_1000_KCAL);
  if (Math.abs(deficit.fibre - expected) > 2) fail('fibre not anchored to maintenance', `${deficit.fibre} vs ${expected}`);
}

/* ------------------------------------------------------------------
   7. Protein
   ------------------------------------------------------------------ */
console.log('7. PROTEIN');
{
  // Above BMI 30, g/kg is taken on adjusted body weight.
  const obese = P({ weightKg: 120, heightCm: 165, track: 'fat_loss' });
  const ref = referenceWeightKg(obese);
  if (!ref.adjusted) fail('adjusted body weight not applied above BMI 30', '');
  if (ref.kg >= obese.weightKg) fail('adjusted weight not below actual', `${ref.kg}`);
  const t = healthTargets(obese);
  if (t.protein > obese.weightKg * 1.8) fail('protein taken on full body weight above BMI 30', String(t.protein));

  // Below BMI 30 it is actual weight.
  if (referenceWeightKg(P({ weightKg: 70, heightCm: 175 })).adjusted) fail('adjusted weight applied below BMI 30', '');

  // The per-meal dose is inside the ISSN range.
  const pm = perMealProtein(P());
  if (pm.grams < 20 || pm.grams > 40) fail('per-meal dose outside the ISSN 20-40 g range', String(pm.grams));

  // Distribution sums back to the total.
  const dist = distributeProtein(120, ['breakfast', 'lunch', 'dinner', 'snack']);
  const sum = Object.values(dist).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 120) > 3) fail('protein distribution does not sum to the total', `${sum}`);
  if (!Object.keys(distributeProtein(100, [])).length === false) fail('empty slot list not handled', '');
}

/* ------------------------------------------------------------------
   8. The sex question is answered with a range, not an invented number
   ------------------------------------------------------------------ */
console.log('8. SEX AND BODY COMPOSITION');
{
  const other = bmrEstimate(P({ sex: 'other' }));
  const male = bmrEstimate(P({ sex: 'male' })).value;
  const female = bmrEstimate(P({ sex: 'female' })).value;
  if (other.band[0] >= other.band[1]) fail('no range for sex "other"', JSON.stringify(other.band));
  if (!(other.band[0] <= female && other.band[1] >= male)) {
    fail('range does not span both equations', `${JSON.stringify(other.band)} vs ${female}/${male}`);
  }
  if (other.confidence !== 'low') fail('range not marked low confidence', other.confidence);
  if (!/range|both/i.test(other.why)) fail('does not explain why it is a range', other.why);
  // The old -78 midpoint must be gone.
  const mid = Math.round((male + female) / 2);
  if (other.band[0] === mid && other.band[1] === mid) fail('still collapsing to a midpoint', String(mid));

  // Body fat switches to a fat-free-mass equation and drops the sex term.
  const withFat = (sex: NutritionProfile['sex']) => bmrEstimate(P({ sex, bodyFatPct: 20 })).value;
  if (withFat('male') !== withFat('female') || withFat('male') !== withFat('other')) {
    fail('body-fat path still depends on sex', `${withFat('male')}/${withFat('female')}/${withFat('other')}`);
  }
  if (!/fat-free/i.test(bmrEstimate(P({ bodyFatPct: 20 })).why)) fail('does not say it used fat-free mass', '');
}

/* ------------------------------------------------------------------
   9. BMI never diagnoses
   ------------------------------------------------------------------ */
console.log('9. BMI AND WAIST');
{
  for (const v of [15, 18.4, 18.6, 22.9, 23.1, 26, 30, 33, 45]) {
    const r = bmiBand(v);
    if (/^obes/i.test(r.label)) fail('BMI alone printed as obesity', `${v} → ${r.label}`);
    if (!r.context) fail('band with no context', String(v));
  }
  if (bmiBand(0).label !== '—') fail('empty BMI not handled', '');
  if (bmiBand(NaN).label !== '—') fail('NaN BMI not handled', '');

  const w = waistReading(95, 175, 'male');
  if (!w || !w.aboveCut) fail('male waist cut-off not applied', JSON.stringify(w));
  const wf = waistReading(82, 160, 'female');
  if (!wf || !wf.aboveCut) fail('female waist cut-off not applied', JSON.stringify(wf));
  // 'other' takes the lower cut-off: under-flagging a risk marker is worse.
  const wo = waistReading(82, 160, 'other');
  if (!wo || !wo.aboveCut) fail('"other" did not take the lower cut-off', JSON.stringify(wo));
  if (waistReading(NaN, 175, 'male') !== null) fail('bad waist not rejected', '');
}

/* ------------------------------------------------------------------
   10. The gate cannot be bypassed
   ------------------------------------------------------------------ */
console.log('10. SAFETY GATE');
{
  // Under 18 asking for fat loss never gets a deficit.
  for (const age of [13, 15, 17]) {
    const t = healthTargets(P({ age, track: 'fat_loss' }));
    if (t.adjustment < 0) fail('deficit set for a minor', `age ${age}: ${t.adjustment}`);
    if (!t.minor) fail('minor not flagged', String(age));
  }
  // 18 is an adult.
  if (healthTargets(P({ age: 18, track: 'fat_loss' })).adjustment >= 0) fail('18-year-old refused a deficit', '');

  // Very low BMI refuses outright.
  const g = gate(P({ weightKg: 38, heightCm: 175 }));
  if (g.verdict !== 'refuse') fail('very low BMI did not refuse', g.verdict);
  if (producesTarget(g)) fail('refused gate still produces a target', '');

  // Missing data asks rather than inventing.
  const ask = gate(P({ weightKg: undefined as unknown as number }));
  if (ask.verdict !== 'ask') fail('missing weight did not ask', ask.verdict);
  if (healthTargets(P({ weightKg: undefined as unknown as number })).usable) fail('unusable profile marked usable', '');

  // Edge profiles widen the band rather than pretending to precision.
  for (const o of [{ weightKg: 150, heightCm: 160 }, { age: 80 }]) {
    const t = healthTargets(P(o));
    if (!t.gate.wideBand) fail('edge profile not given a wider band', JSON.stringify(o));
    if (t.kcalEstimate.confidence !== 'low') fail('edge profile not marked low confidence', JSON.stringify(o));
  }

  // Every verdict has something to say to the user.
  for (const o of [{ weightKg: 38, heightCm: 175 }, { age: 15, track: 'fat_loss' as const }, { weightKg: 400 }]) {
    const r = gate(P(o));
    if (r.verdict !== 'calculate' && !r.reason) fail('non-calculate verdict with no reason', JSON.stringify(o));
  }
}

/* ------------------------------------------------------------------
   11. Exercise credit, and no double counting
   ------------------------------------------------------------------ */
console.log('11. EXERCISE');
{
  // The assumed burn is derived from the activity factor, not a magic number.
  const sed = assumedExerciseBurn(P({ activity: 'sedentary' }));
  const act = assumedExerciseBurn(P({ activity: 'very_active' }));
  if (!(act > sed)) fail('assumed burn not rising with activity', `${sed} vs ${act}`);
  if (sed < 0) fail('negative assumed burn', String(sed));

  // Burn inside what the level assumes earns nothing.
  const c1 = exerciseCredit(P({ activity: 'very_active' }), 100);
  if (c1.credit !== 0) fail('credited burn already assumed by the activity level', String(c1.credit));
  if (!c1.note) fail('no explanation for a zero credit', '');

  // Burn beyond it earns half, capped.
  const c2 = exerciseCredit(P({ activity: 'sedentary' }), 2000);
  if (c2.credit > 400) fail('credit above the cap', String(c2.credit));
  if (c2.credit <= 0) fail('genuine extra burn earned nothing', '');

  // A burn figure is a range, and a wide one.
  const b = burnEstimate('running', 45, 70);
  if (b.band[0] === b.band[1]) fail('burn presented as exact', '');
  if (b.basis !== 'rule-of-thumb') fail('burn not labelled a rule of thumb', b.basis);
}

/* ------------------------------------------------------------------
   12. The adaptive model
   ------------------------------------------------------------------ */
console.log('12. ADAPTIVE MAINTENANCE');
{
  const eq = tdeeEstimate(P());
  const mk = (n: number, opts: { intake?: number; drift?: number; logEvery?: number; weighEvery?: number } = {}): DayRecord[] =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      intake: i % (opts.logEvery ?? 1) === 0 ? (opts.intake ?? 2200) : null,
      weightKg: i % (opts.weighEvery ?? 2) === 0 ? 70 + (opts.drift ?? 0) * i : null,
    }));

  // Not enough data → falls back to the equation and says why.
  for (const days of [mk(5), mk(20, { logEvery: 5 }), mk(20, { weighEvery: 30 })]) {
    const r = adaptiveMaintenance(days, eq);
    if (r.observedMaintenance !== null) fail('learned from insufficient data', `${r.daysOfData}d`);
    if (r.maintenance.value !== eq.value) fail('did not fall back to the equation', '');
    if (!r.blockedBy) fail('no explanation for not learning', '');
  }

  // Early in a deficit it refuses — water and glycogen dominate.
  const early = adaptiveMaintenance(mk(30, { drift: -0.05 }), eq, { daysIntoDeficit: 5 });
  if (early.observedMaintenance !== null) fail('learned during the first fortnight of a deficit', '');

  // With enough data it learns, and steady weight implies maintenance ≈ intake.
  const steady = adaptiveMaintenance(mk(60, { intake: 2400, drift: 0 }), eq, { daysIntoDeficit: 90 });
  if (steady.observedMaintenance === null) fail('did not learn from 60 days of data', JSON.stringify(steady.blockedBy));
  else if (Math.abs(steady.observedMaintenance - 2400) > 50) fail('steady weight did not imply intake as maintenance', String(steady.observedMaintenance));
  if (steady.maintenance.basis !== 'personal-data') fail('not marked as learned from personal data', '');

  // Losing weight at a fixed intake implies maintenance above that intake.
  const losing = adaptiveMaintenance(mk(60, { intake: 1900, drift: -0.01 }), eq, { daysIntoDeficit: 90 });
  if (losing.observedMaintenance !== null && !(losing.observedMaintenance > 1900)) {
    fail('weight loss did not raise the maintenance estimate', String(losing.observedMaintenance));
  }
  if (losing.trendKgPerWeek === null || losing.trendKgPerWeek >= 0) fail('trend direction wrong', String(losing.trendKgPerWeek));

  // The rate limit holds against a wild observation.
  const wild = adaptiveMaintenance(mk(60, { intake: 5000, drift: 0 }), eq, { daysIntoDeficit: 90, previousEstimate: 2400 });
  if (Math.abs(wild.maintenance.value - 2400) > 2400 * ADAPTIVE.maxMovePerRecalibration + 1) {
    fail('recalibration moved further than the rate limit allows', String(wild.maintenance.value));
  }

  // The trend is smoothed: one heavy morning must barely move it.
  const base = mk(30, { drift: 0 });
  const spiked = base.map((d, i) => (i === 29 && d.weightKg !== null ? { ...d, weightKg: d.weightKg + 2 } : d));
  const t1 = weightTrend(base).slice(-1)[0].kg;
  const t2 = weightTrend(spiked).slice(-1)[0].kg;
  if (Math.abs(t2 - t1) > 0.3) fail('a single 2 kg reading moved the trend too far', `${t1} → ${t2}`);

  // A gap in the middle must not throw.
  const gappy = mk(60).map((d, i) => (i > 20 && i < 50 ? { ...d, intake: null, weightKg: null } : d));
  try { adaptiveMaintenance(gappy, eq, { daysIntoDeficit: 90 }); }
  catch (e) { fail('30-day gap threw', (e as Error).message); }

  // Empty input.
  try {
    const r = adaptiveMaintenance([], eq);
    if (r.maintenance.value !== eq.value) fail('empty history did not fall back', '');
  } catch (e) { fail('empty history threw', (e as Error).message); }

  // No rate is promised before there is one.
  if (!/will tell you|once it has/i.test(rateSentence(null))) fail('promised a rate with no data', rateSentence(null));
}

/* ------------------------------------------------------------------
   13. Regression — what this does to existing users
   ------------------------------------------------------------------ */
console.log('13. REGRESSION AGAINST THE OLD ENGINE');
{
  /* The old engine, reproduced here exactly, so the size of the change is
     measured rather than estimated. */
  const oldBmr = (p: NutritionProfile) =>
    Math.round(10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78));
  const OLD_FACTOR: Record<string, number> = {
    sedentary: 1.2, light: 1.375, walking: 1.45, cycling: 1.55,
    gym: 1.55, running: 1.65, sports: 1.7, very_active: 1.8,
  };
  const OLD_FLOOR: Record<string, number> = { male: 1500, female: 1200, other: 1300 };
  const oldTarget = (p: NutritionProfile) => {
    const maintenance = Math.round(oldBmr(p) * OLD_FACTOR[p.activity]);
    const adj = p.track === 'fat_loss' ? -Math.min(500, Math.round(maintenance * 0.2))
      : p.track === 'muscle_gain' ? Math.min(350, Math.round(maintenance * 0.12)) : 0;
    return Math.max(OLD_FLOOR[p.sex] ?? 1300, maintenance + adj);
  };

  const cases: Array<[string, NutritionProfile]> = [
    ['sedentary man, wellness', P({ sex: 'male', weightKg: 70, heightCm: 175, age: 26 })],
    ['sedentary man, fat loss', P({ sex: 'male', weightKg: 85, heightCm: 178, age: 30, track: 'fat_loss' })],
    ['sedentary woman, fat loss', P({ sex: 'female', weightKg: 62, heightCm: 160, age: 28, track: 'fat_loss' })],
    ['small woman, fat loss', P({ sex: 'female', weightKg: 45, heightCm: 150, age: 35, track: 'fat_loss' })],
    ['gym man, muscle gain', P({ sex: 'male', weightKg: 72, heightCm: 180, age: 22, activity: 'gym', track: 'muscle_gain' })],
    ['very active man', P({ sex: 'male', weightKg: 80, heightCm: 182, age: 24, activity: 'very_active' })],
    ['older woman, wellness', P({ sex: 'female', weightKg: 68, heightCm: 158, age: 62 })],
    ['heavy man, fat loss', P({ sex: 'male', weightKg: 120, heightCm: 172, age: 40, track: 'fat_loss' })],
    ['prefer not to say', P({ sex: 'other', weightKg: 65, heightCm: 168, age: 27 })],
    ['walking woman, wellness', P({ sex: 'female', weightKg: 55, heightCm: 163, age: 24, activity: 'walking' })],
  ];

  console.log('    profile                        old    new   change');
  let raised = 0;
  for (const [label, p] of cases) {
    const before = oldTarget(p);
    const after = healthTargets(p).kcal;
    const delta = after - before;
    if (delta > 0) raised++;
    console.log(`    ${label.padEnd(30)} ${String(before).padStart(4)}  ${String(after).padStart(5)}   ${delta >= 0 ? '+' : ''}${delta}`);
  }
  if (raised === 0) fail('no target rose', 'the FAO re-basing should raise most targets');

  // The small woman is the case that mattered: she must leave the supervised band.
  const smallBefore = oldTarget(cases[3][1]);
  const smallAfter = healthTargets(cases[3][1]).kcal;
  if (smallBefore > 1200) fail('regression fixture wrong', 'expected the old engine to hit the 1200 floor');
  if (smallAfter <= 1200) fail('small woman still inside the supervised band', String(smallAfter));
}

/* ------------------------------------------------------------------ */
console.log('\n════════════════════════════════════════════');
console.log(failures ? `  ${failures} problem${failures === 1 ? '' : 's'}` : '  0 problems');
console.log('════════════════════════════════════════════\n');
if (failures) process.exitCode = 1;
