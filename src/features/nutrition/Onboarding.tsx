import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NutritionProfile, DietKey, Cuisine, ActivityKey, Kitchen, GoalTrack, Intent } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { Panel, Field, Select, Bar, Chip, useMotion, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Orb } from '../../components/Orb';
import { DEMO_PROFILE } from '../../lib/nutrition-seed';
import { bmi, bmiBand, bmr, tdee, targetsFor, activityLabel } from '../../engine/calories';
import { cn } from '../../lib/util';

/* ============================================================
   Onboarding.

   Value before data: goals and taste first, because people give
   those freely; the deeper behavioural questions (budget, what is
   in the kitchen) come once the app has already shown it is
   listening. Eight short steps, none of them a wall of fields.
   ============================================================ */

const TRACKS: Array<{ key: GoalTrack; label: string; note: string; icon: string }> = [
  { key: 'wellness', label: 'Wellness', note: 'Eat better and feel steadier, without chasing a number on the scale', icon: 'Heart' },
  { key: 'fat_loss', label: 'Fat loss', note: 'A moderate deficit, built around protein so you keep the muscle', icon: 'TrendingUp' },
  { key: 'muscle_gain', label: 'Muscle gain', note: 'A small surplus and a high protein floor', icon: 'Dumbbell' },
];

const INTENTS: Array<{ key: Intent; label: string }> = [
  { key: 'energy', label: 'Better energy' },
  { key: 'consistency', label: 'Eat consistently' },
  { key: 'performance', label: 'Train better' },
  { key: 'maintain_weight', label: 'Hold my weight' },
];

const DIETS: Array<{ key: DietKey; label: string; note: string }> = [
  { key: 'vegetarian', label: 'Vegetarian', note: 'No meat, fish or egg' },
  { key: 'eggetarian', label: 'Eggetarian', note: 'Vegetarian plus egg' },
  { key: 'nonveg', label: 'Non-vegetarian', note: 'Everything' },
  { key: 'vegan', label: 'Vegan', note: 'No animal products at all' },
  { key: 'jain', label: 'Jain', note: 'No onion, garlic or root vegetables' },
];

const CUISINES: Cuisine[] = ['North Indian', 'South Indian', 'Punjabi', 'Bengali', 'Gujarati', 'Maharashtrian', 'Mughlai', 'Continental'];

const ACTIVITIES: ActivityKey[] = ['sedentary', 'light', 'walking', 'cycling', 'gym', 'running', 'sports', 'very_active'];

const BUDGETS = [
  { value: 150, label: '₹100–200', note: 'Hostel mess or cooking at home' },
  { value: 250, label: '₹200–300', note: 'Cooking mostly, ordering sometimes' },
  { value: 400, label: '₹300–500', note: 'A mix of cooking and eating out' },
  { value: 600, label: '₹500+', note: 'Eating out or ordering often' },
];

const STEPS = ['You', 'Goal', 'Diet', 'Taste', 'Routine', 'Budget', 'Activity', 'Kitchen'];

export function NutritionOnboarding({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { rise, spring } = useMotion();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<NutritionProfile>({
    ...DEMO_PROFILE,
    name: '',
    intents: [],
    cuisines: [],
    likes: [],
    dislikes: [],
    allergies: [],
    restrictions: [],
    disclaimerAccepted: false,
    onboardedAt: undefined,
  });
  const [pantryText, setPantryText] = useState('');
  const [context, setContext] = useState<'pantry' | 'fridge' | 'nothing' | 'eating_out' | 'ordering'>('pantry');

  const set = (patch: Partial<NutritionProfile>) => setP({ ...p, ...patch });

  const bmiValue = useMemo(() => bmi(p.weightKg, p.heightCm), [p.weightKg, p.heightCm]);
  const band = bmiBand(bmiValue);
  const preview = useMemo(() => targetsFor(p), [p]);

  const canAdvance = (() => {
    switch (step) {
      case 0: return p.age > 0 && p.heightCm > 0 && p.weightKg > 0;
      case 1: return true;
      case 2: return true;
      case 3: return true;
      case 4: return true;
      case 5: return p.budgetPerDay > 0;
      case 6: return true;
      case 7: return p.disclaimerAccepted;
      default: return true;
    }
  })();

  const finish = () => {
    nutrition.saveProfile({ ...p, onboardedAt: new Date().toISOString() });
    if (context !== 'nothing') {
      nutrition.setPantry(pantryText.split(',').map((s) => s.trim()).filter(Boolean));
    }
    toast({ text: 'Your plan is ready', tone: 'good' });
    onDone();
  };

  const toggleIntent = (k: Intent) => {
    const has = p.intents.includes(k);
    set({ intents: has ? p.intents.filter((g) => g !== k) : [...p.intents, k] });
  };

  const listField = (label: string, key: 'likes' | 'dislikes' | 'allergies' | 'restrictions', placeholder: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className="field"
        value={p[key].join(', ')}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } as Partial<NutritionProfile>)}
      />
    </Field>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 py-2">
      <header className="flex items-center gap-4">
        <Orb size={56} />
        <div>
          <div className="label mb-1">Setting up your nutrition coach</div>
          <h1 className="display text-[clamp(24px,3.6vw,32px)] leading-none">
            {step === 0 ? 'Let us start with you' : STEPS[step]}
          </h1>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <Bar value={((step + 1) / STEPS.length) * 100} height={5} label="Setup progress" />
        <span className="num shrink-0 text-[11.5px] text-[var(--ink-3)]">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <Panel className="p-5 sm:p-6 min-h-[26rem]">
        <AnimatePresence mode="wait">
          <motion.div key={step} {...rise} transition={spring}>
            {/* ------------------------------ 1. you ------------------------------ */}
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="What should I call you?" className="sm:col-span-2">
                  <input className="field" autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your first name" />
                </Field>
                <Field label="Age">
                  <input className="field" type="number" min={13} max={100} value={p.age || ''} onChange={(e) => set({ age: Number(e.target.value) })} />
                </Field>
                <Field label="Sex" as="div" hint="Used only for the BMR formula, which differs by sex.">
                  <Select
                    value={p.sex}
                    onChange={(v) => set({ sex: v as NutritionProfile['sex'] })}
                    options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Prefer not to say' }]}
                  />
                </Field>
                <Field label="Height (cm)">
                  <input className="field" type="number" min={100} max={230} value={p.heightCm || ''} onChange={(e) => set({ heightCm: Number(e.target.value) })} />
                </Field>
                <Field label="Weight (kg)">
                  <input className="field" type="number" min={25} max={250} value={p.weightKg || ''} onChange={(e) => set({ weightKg: Number(e.target.value) })} />
                </Field>

                {bmiValue > 0 && (
                  <div className="sm:col-span-2 rounded-xl p-4" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
                      <div>
                        <div className="label mb-1">BMI</div>
                        <div className="num text-[24px] font-semibold leading-none">{bmiValue}</div>
                        <div className="text-[11.5px] mt-1" style={{ color: band.tone === 'good' ? 'var(--good)' : band.tone === 'critical' ? 'var(--critical)' : 'var(--warning)' }}>
                          {band.label}
                        </div>
                      </div>
                      <div>
                        <div className="label mb-1">BMR</div>
                        <div className="num text-[24px] font-semibold leading-none">{bmr(p)}</div>
                        <div className="text-[11.5px] text-[var(--ink-3)] mt-1">kcal at complete rest</div>
                      </div>
                      <p className="flex-1 min-w-[16rem] text-[12px] text-[var(--ink-3)] leading-relaxed">
                        BMI is a blunt instrument — it cannot tell muscle from fat. It is here as one reading among several, not a verdict.
                        The bands shown are the Asian-Indian cut-offs, which sit lower than the international ones.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------- 2. track ----------------------------- */}
            {step === 1 && (
              <div>
                <p className="text-[13px] text-[var(--ink-2)] mb-4">
                  One track. It is the only thing that sets your calorie target, so there is exactly one reason
                  behind the number you will see.
                </p>
                <div className="grid gap-2">
                  {TRACKS.map((t) => {
                    const on = p.track === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => set({ track: t.key })}
                        aria-pressed={on}
                        className="flex items-start gap-3 rounded-xl p-3.5 text-left transition-colors"
                        style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                      >
                        <Icon name={t.icon} size={18} className="mt-0.5 shrink-0" style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold">{t.label}</span>
                          <span className="block text-[12px] text-[var(--ink-3)] mt-0.5">{t.note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Field label="Anything else you are after?" className="mt-5" as="div" hint="Optional. These shape what gets recommended, but never change your calorie target.">
                  <div className="flex flex-wrap gap-1.5">
                    {INTENTS.map((i) => {
                      const on = p.intents.includes(i.key);
                      return (
                        <button
                          key={i.key}
                          className="chip row-hover"
                          aria-pressed={on}
                          style={on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                          onClick={() => toggleIntent(i.key)}
                        >
                          {i.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {/* ------------------------------ 3. diet ----------------------------- */}
            {step === 2 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {DIETS.map((d) => {
                  const on = p.diet === d.key;
                  return (
                    <button
                      key={d.key}
                      onClick={() => set({ diet: d.key })}
                      className="rounded-xl p-3 text-left transition-colors"
                      style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                    >
                      <div className="text-[13.5px] font-semibold">{d.label}</div>
                      <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{d.note}</div>
                    </button>
                  );
                })}
                <p className="sm:col-span-2 mt-2 text-[12px] text-[var(--ink-3)]">
                  This is a hard filter, not a preference — nothing outside it will ever be recommended to you.
                </p>
              </div>
            )}

            {/* ------------------------------ 4. taste ---------------------------- */}
            {step === 3 && (
              <div className="grid gap-4">
                <Field label="Cuisines you actually eat" as="div">
                  <div className="flex flex-wrap gap-1.5">
                    {CUISINES.map((c) => {
                      const on = p.cuisines.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => set({ cuisines: on ? p.cuisines.filter((x) => x !== c) : [...p.cuisines, c] })}
                          className="chip"
                          style={on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                {listField('Foods you like', 'likes', 'paneer, curd, rajma')}
                {listField('Foods you would rather not see', 'dislikes', 'oats, karela', 'The engine drops these to the bottom rather than banning them outright.')}
                {listField('Allergies', 'allergies', 'peanut, lactose', 'Treated as a hard exclusion, like your diet.')}
                {listField('Anything else you avoid', 'restrictions', 'refined sugar, maida')}
              </div>
            )}

            {/* ----------------------------- 5. routine --------------------------- */}
            {step === 4 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="You are a…" as="div">
                  <Select
                    value={p.occupation}
                    onChange={(v) => set({ occupation: v as NutritionProfile['occupation'] })}
                    options={[{ value: 'student', label: 'Student' }, { value: 'professional', label: 'Working professional' }, { value: 'other', label: 'Something else' }]}
                  />
                </Field>
                <Field label="Where do you eat most meals?" as="div">
                  <Select
                    value={p.kitchen}
                    onChange={(v) => set({ kitchen: v as Kitchen })}
                    options={[{ value: 'home', label: 'Home, with a kitchen' }, { value: 'hostel', label: 'Hostel or mess' }, { value: 'pg', label: 'PG with limited cooking' }, { value: 'office', label: 'Mostly at the office' }]}
                  />
                </Field>
                <Field label="Days a week you cook">
                  <input className="field" type="number" min={0} max={7} value={p.cooksPerWeek} onChange={(e) => set({ cooksPerWeek: Number(e.target.value) })} />
                </Field>
                <Field label="How much time do you usually have to cook? (minutes)" hint="This is the single strongest filter on what you get suggested.">
                  <input className="field" type="number" min={5} max={120} step={5} value={p.typicalCookMins} onChange={(e) => set({ typicalCookMins: Number(e.target.value) })} />
                </Field>
                <Field label="Cooking confidence" as="div">
                  <Select
                    value={String(p.cookingSkill)}
                    onChange={(v) => set({ cookingSkill: Number(v) as 1 | 2 | 3 })}
                    options={[{ value: '1', label: 'I can manage the basics' }, { value: '2', label: 'Comfortable enough' }, { value: '3', label: 'I enjoy cooking' }]}
                  />
                </Field>
                <Field label="Meals eaten out per week">
                  <input className="field" type="number" min={0} max={21} value={p.eatsOutPerWeek} onChange={(e) => set({ eatsOutPerWeek: Number(e.target.value) })} />
                </Field>
                <Field label="Usual wake time">
                  <input className="field" type="time" value={p.wakeTime} onChange={(e) => set({ wakeTime: e.target.value })} />
                </Field>
                <Field label="Usual sleep time">
                  <input className="field" type="time" value={p.sleepTime} onChange={(e) => set({ sleepTime: e.target.value })} />
                </Field>
              </div>
            )}

            {/* ----------------------------- 6. budget ---------------------------- */}
            {step === 5 && (
              <div>
                <p className="text-[13px] text-[var(--ink-2)] mb-4">Roughly what a day of food costs you. Nothing above this gets recommended.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BUDGETS.map((b) => {
                    const on = p.budgetPerDay === b.value;
                    return (
                      <button
                        key={b.value}
                        onClick={() => set({ budgetPerDay: b.value })}
                        className="rounded-xl p-3 text-left"
                        style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                      >
                        <div className="text-[15px] font-bold num">{b.label}</div>
                        <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{b.note}</div>
                      </button>
                    );
                  })}
                </div>
                <Field label="Or set it exactly (₹ per day)" className="mt-4">
                  <input className="field" type="number" min={50} step={10} value={p.budgetPerDay} onChange={(e) => set({ budgetPerDay: Number(e.target.value) })} />
                </Field>
              </div>
            )}

            {/* ---------------------------- 7. activity --------------------------- */}
            {step === 6 && (
              <div className="grid gap-2">
                {ACTIVITIES.map((a) => {
                  const on = p.activity === a;
                  return (
                    <button
                      key={a}
                      onClick={() => set({ activity: a })}
                      className="rounded-xl p-3 text-left"
                      style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                    >
                      <div className="text-[13.5px]">{activityLabel[a]}</div>
                    </button>
                  );
                })}
                <Field label="Workouts a week" className="mt-2">
                  <input className="field" type="number" min={0} max={14} value={p.workoutsPerWeek} onChange={(e) => set({ workoutsPerWeek: Number(e.target.value) })} />
                </Field>
              </div>
            )}

            {/* ---------------------------- 8. kitchen ---------------------------- */}
            {step === 7 && (
              <div className="grid gap-4">
                <div>
                  <div className="label mb-2">What do you have available today?</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ['pantry', 'Pantry ingredients', 'Dry goods, dals, flour'],
                      ['fridge', 'Fridge ingredients', 'Vegetables, paneer, curd'],
                      ['nothing', 'Nothing much', 'I will need to shop'],
                      ['eating_out', 'Eating out today', 'Plan around a restaurant'],
                      ['ordering', 'Ordering in', 'Plan around delivery'],
                    ].map(([k, label, note]) => {
                      const on = context === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setContext(k as typeof context)}
                          className="rounded-xl p-3 text-left"
                          style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                        >
                          <div className="text-[13.5px] font-semibold">{label}</div>
                          <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{note}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(context === 'pantry' || context === 'fridge') && (
                  <Field label="List what you have" hint="Comma separated. Today's plan is built around these first.">
                    <input className="field" value={pantryText} onChange={(e) => setPantryText(e.target.value)} placeholder="paneer, tomato, onion, capsicum, atta, curd" />
                  </Field>
                )}

                <Field label="Your track" as="div" hint="Changes what the engine weights. Mango is not a medical app and does not manage health conditions.">
                  <Select
                    value={p.track}
                    onChange={(v) => set({ track: v as GoalTrack })}
                    options={[
                      { value: 'wellness', label: 'Wellness — eat better, feel steadier' },
                      { value: 'fat_loss', label: 'Fat loss — protein-dense, filling meals' },
                      { value: 'muscle_gain', label: 'Muscle gain — build around protein' },
                    ]}
                  />
                </Field>

                <label className="flex items-start gap-3 rounded-xl p-3.5 cursor-pointer" style={{ background: 'var(--sunken)', border: `1px solid ${p.disclaimerAccepted ? 'var(--good)' : 'var(--hairline)'}` }}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={p.disclaimerAccepted} onChange={(e) => set({ disclaimerAccepted: e.target.checked })} />
                  <span className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                    I understand Mango gives general nutrition guidance, not medical advice, and that it is not a substitute for a doctor or a
                    registered dietitian. If I have a health condition, am pregnant, or am taking medication, I will get proper clinical advice
                    before changing how I eat.
                  </span>
                </label>

                {preview && (
                  <div className="rounded-xl p-4" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                    <div className="label mb-2">What this works out to</div>
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                      <Stat label="BMR" value={preview.bmr} unit="kcal" />
                      <Stat label="TDEE" value={preview.tdee} unit="kcal" />
                      <Stat label="Daily target" value={preview.kcal} unit="kcal" accent />
                      <Stat label="Protein" value={preview.protein} unit="g" />
                      <Stat label="Carbs" value={preview.carbs} unit="g" />
                      <Stat label="Fat" value={preview.fat} unit="g" />
                    </div>
                    <p className="mt-3 text-[12px] text-[var(--ink-3)]">{preview.note}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>

      <div className="flex items-center justify-between gap-3">
        <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <Icon name="ChevronLeft" size={14} />
          Back
        </button>
        <div className="flex items-center gap-2">
          {step === 0 && (
            <button
              className="btn btn-ghost !text-[12px]"
              onClick={() => {
                nutrition.loadDemoProfile();
                toast({ text: 'Loaded the demo profile', tone: 'info' });
                onDone();
              }}
            >
              Skip and explore with demo data
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
              Continue
              <Icon name="ChevronRight" size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={!canAdvance}>
              <Icon name="Check" size={14} />
              Build my plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: boolean }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="num text-[19px] font-semibold leading-none" style={accent ? { color: 'var(--accent)' } : undefined}>
        {value}
        <span className="text-[12px] text-[var(--ink-3)] font-normal"> {unit}</span>
      </div>
    </div>
  );
}
