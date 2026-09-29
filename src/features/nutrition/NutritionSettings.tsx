import { useState } from 'react';
import type { DB } from '../../lib/types';
import type { DietKey, ActivityKey, GoalTrack, Intent } from '../../lib/nutrition-types';
import { INTENT_LABEL } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { targetsFor, bmi, bmiBand, activityLabel } from '../../engine/calories';
import { Panel, SectionHeader, Field, Select, Toggle, Chip, ConfirmDialog, Empty, useToast, Bar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { WhyNumber } from './WhyNumber';
import { waistReading } from '../../engine/calories';
import { FREE_FEATURES, PREMIUM_FEATURES } from '../../engine/entitlements';
import { download } from '../../lib/util';

export const DIET_LABELS: Record<DietKey, string> = {
  vegetarian: 'Vegetarian', vegan: 'Vegan', eggetarian: 'Eggetarian', nonveg: 'Non-vegetarian', jain: 'Jain',
};

/* ------------------------------ profile panel ----------------------------- */

export function NutritionProfilePanel({ db }: { db: DB }) {
  const n = db.nutrition;
  const nav = useNav();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  if (!n.profile) {
    return (
      <Panel className="p-2">
        <Empty
          icon="Heart"
          title="Nutrition is not set up yet"
          body="The short setup calculates your BMR, TDEE and macro targets from your own numbers."
          action={
            <button className="btn btn-primary" onClick={() => nav.go('nut_home')}>
              Set up the nutrition coach
            </button>
          }
        />
      </Panel>
    );
  }

  const p = n.profile;
  const t = targetsFor(p);
  const value = bmi(p.weightKg, p.heightCm);
  const band = bmiBand(value);
  const waist = p.waistCm ? waistReading(p.waistCm, p.heightCm, p.sex) : null;
  const set = (patch: Partial<typeof p>) => {
    nutrition.updateProfile(patch);
  };

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Everything the engine uses" title="Your profile" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="field" value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Age">
            <input className="field" type="number" value={p.age} onChange={(e) => set({ age: Number(e.target.value) })} />
          </Field>
          <Field label="Height (cm)">
            <input className="field" type="number" value={p.heightCm} onChange={(e) => set({ heightCm: Number(e.target.value) })} />
          </Field>
          <Field label="Weight (kg)" hint="Logging a weight on the progress page also updates this.">
            <input className="field" type="number" step={0.1} value={p.weightKg} onChange={(e) => set({ weightKg: Number(e.target.value) })} />
          </Field>
          <Field label="Anything else you are after" as="div" className="sm:col-span-2" hint="Optional. Shapes what gets recommended; your calorie target comes from the track alone.">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(INTENT_LABEL) as Intent[]).map((k) => {
                const on = p.intents.includes(k);
                return (
                  <button
                    key={k}
                    className="chip row-hover"
                    aria-pressed={on}
                    style={on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                    onClick={() => set({ intents: on ? p.intents.filter((x) => x !== k) : [...p.intents, k] })}
                  >
                    {INTENT_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Diet" as="div">
            <Select value={p.diet} onChange={(v) => set({ diet: v as DietKey })} options={Object.entries(DIET_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          </Field>
          <Field label="Activity level" as="div">
            <Select
              value={p.activity}
              onChange={(v) => set({ activity: v as ActivityKey })}
              options={(Object.keys(activityLabel) as ActivityKey[]).map((k) => ({ value: k, label: activityLabel[k] }))}
            />
          </Field>
          <Field label="Daily food budget (₹)">
            <input className="field" type="number" value={p.budgetPerDay} onChange={(e) => set({ budgetPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="Time you usually have to cook (minutes)">
            <input className="field" type="number" value={p.typicalCookMins} onChange={(e) => set({ typicalCookMins: Number(e.target.value) })} />
          </Field>
          <Field label="Your track" as="div" hint="Wellness, fat loss or muscle gain. Not a clinical programme.">
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
          <Field label="Foods you like" className="sm:col-span-2">
            <input className="field" value={p.likes.join(', ')} onChange={(e) => set({ likes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Foods you would rather avoid" className="sm:col-span-2">
            <input className="field" value={p.dislikes.join(', ')} onChange={(e) => set({ dislikes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Allergies" className="sm:col-span-2" hint="Treated as a hard exclusion — nothing containing these is ever recommended.">
            <input className="field" value={p.allergies.join(', ')} onChange={(e) => set({ allergies: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field
            label="Waist (cm)"
            hint="Optional, and the single most useful thing you can add. BMI cannot tell muscle from fat; a tape measure largely can."
          >
            <input
              className="field"
              type="number"
              step={1}
              value={p.waistCm ?? ''}
              placeholder="—"
              onChange={(e) => set({ waistCm: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </Field>
          <Field
            label="Body fat (%)"
            hint="Optional. If you know it, Mango switches to an equation based on lean mass — which is more accurate and needs no assumption about sex."
          >
            <input
              className="field"
              type="number"
              step={0.5}
              value={p.bodyFatPct ?? ''}
              placeholder="—"
              onChange={(e) => set({ bodyFatPct: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </Field>
          <Field label="Daily water goal (ml)">
            <input className="field" type="number" step={250} value={n.waterGoalMl} onChange={(e) => nutrition.setWaterGoal(Number(e.target.value))} />
          </Field>
        </div>

        <div className="mt-5 rounded-xl p-4" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
          <div className="label mb-3">What that works out to</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {([['BMI', value, band.label], ['BMR', t.bmr, 'kcal at rest'], ['TDEE', t.tdee, 'kcal maintenance'], ['Target', t.kcal, 'kcal a day'], ['Protein', t.protein, 'g'], ['Carbs', t.carbs, 'g'], ['Fat', t.fat, 'g'], ['Fibre', t.fibre, 'g']] as const).map(([l, v, note]) => (
              <div key={l}>
                <div className="label mb-1">{l}</div>
                <div className="num text-[19px] font-semibold leading-none">{v}</div>
                <div className="text-[10.5px] text-[var(--ink-3)] mt-1">{note}</div>
              </div>
            ))}
          </div>

          {/* The point estimate stays on the page; the band is one tap away. */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <WhyNumber label="Resting energy (BMR)" estimate={t.bmrEstimate} unit="kcal a day" />
            <WhyNumber label="Maintenance (TDEE)" estimate={t.tdeeEstimate} unit="kcal a day" />
            <WhyNumber label="Your daily target" estimate={t.kcalEstimate} unit="kcal a day" extra={t.deficitWhy} />
            <WhyNumber label="Protein" estimate={t.proteinEstimate} unit="g a day" extra={t.perMealProteinWhy} />
          </div>

          <p className="mt-3 text-[12px] text-[var(--ink-3)]">{t.note}</p>
          {t.macroNotes.map((m) => (
            <p key={m} className="mt-1.5 text-[12px] text-[var(--ink-3)]">{m}</p>
          ))}
          {waist && (
            <p className="mt-3 text-[12px] text-[var(--ink-2)]">
              <span className="font-semibold">Waist {waist.waistCm} cm</span> — {waist.context}
            </p>
          )}
          <button className="btn mt-3" onClick={() => { nutrition.regeneratePlan(); toast({ text: 'Plan rebuilt on the new numbers', tone: 'good' }); }}>
            Rebuild today's plan
          </button>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Read this once" title="Medical disclaimer" />
        <p className="mt-3 text-[13px] text-[var(--ink-2)] leading-relaxed max-w-[70ch]">
          Mango gives general nutrition guidance. It is not a medical device, it does not diagnose or treat anything, and it is not a substitute
          for a doctor or a registered dietitian. The condition focus above changes which meals the engine prefers — it does not make this
          clinical software, and no food here treats or reverses any disease.
        </p>
        <p className="mt-2 text-[13px] text-[var(--ink-2)] leading-relaxed max-w-[70ch]">
          If you are pregnant or breastfeeding, managing a diagnosed condition, taking medication that interacts with food, or have a history of
          disordered eating, get targets from a clinician and use those rather than the ones calculated here. The coach will decline questions in
          those areas rather than guess.
        </p>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Reset nutrition" />
        <p className="mt-2 text-[12.5px] text-[var(--ink-2)]">
          Clears your nutrition profile, logs, plans and feedback. The rest of Mango — tasks, goals, notes — is untouched.
        </p>
        <button className="btn btn-danger mt-3" onClick={() => setConfirm(true)}>
          Reset the nutrition module
        </button>
      </Panel>

      <ConfirmDialog
        open={confirm}
        title="Reset nutrition?"
        body="Your profile, every food and water log, activity, weights, plans and feedback are deleted. Nothing else in Mango changes."
        confirmLabel="Reset nutrition"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          nutrition.resetNutrition();
          setConfirm(false);
          toast({ text: 'Nutrition reset', tone: 'warning' });
        }}
      />
    </>
  );
}

/* --------------------------- integrations panel --------------------------- */

export function IntegrationsPanel({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const groups: Array<[string, string, string]> = [
    ['wearable', 'Wearables and health apps', 'Steps, active minutes and calories burned would flow in from here.'],
    ['grocery', 'Grocery delivery', 'A confirmed meal plan becomes an editable basket.'],
    ['health', 'Health records', 'Lab values such as HbA1c would let the engine weight low-GI meals properly.'],
  ];

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="None of these are real connections" title="Integrations" />
        <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
          <strong>Everything on this page is simulated.</strong> Mango is not connected to Apple Health, Google Fit, BigBasket, Blinkit, Zepto or
          any lab. Turning one on generates clearly-labelled sample data so you can see how the feature would behave; it sends nothing and receives
          nothing. Each would need that company's partner API and your explicit consent to become real.
        </div>
      </Panel>

      {groups.map(([kind, title, note]) => (
        <Panel key={kind} className="p-4 sm:p-5">
          <SectionHeader label={note} title={title} />
          <div className="mt-3 flex flex-col gap-1.5">
            {n.integrations.filter((i) => i.kind === kind).map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                <Icon name={kind === 'wearable' ? 'Activity' : kind === 'grocery' ? 'ShoppingBag' : 'FileText'} size={15} className="text-[var(--ink-3)]" />
                <span className="flex-1 text-[13px]">{i.name}</span>
                <Chip color="var(--warning)">Demo</Chip>
                <button
                  className="btn !py-1 !text-[12px]"
                  onClick={() => {
                    nutrition.toggleIntegration(i.id);
                    toast({ text: i.connected ? `${i.name} disconnected` : `${i.name} connected — simulated data only`, tone: 'info' });
                  }}
                >
                  {i.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
          {kind === 'wearable' && n.integrations.some((i) => i.kind === 'wearable' && i.connected) && (
            <button
              className="btn mt-3"
              onClick={() => {
                const steps = nutrition.syncSimulatedWearable();
                toast({ text: `Wrote ${steps.toLocaleString('en-IN')} simulated steps into today`, tone: 'info' });
              }}
            >
              <Icon name="RotateCcw" size={14} />
              Sync simulated data
            </button>
          )}
        </Panel>
      ))}
    </>
  );
}

/* ------------------------------ pricing panel ----------------------------- */

/* The two lists are no longer written here. They come from the same table the
   gates read, so a line can only appear on this screen if something in the app
   actually enforces it. Previously these were hand-written prose and nothing in
   the product read `plan` at all — every claim on this screen was decorative. */

export function PricingPanel({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="From the marketing plan" title="Plans" />
        <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
          This is the pricing from the strategy, shown as it would appear in the product. There is no payment system here and no card form —
          a checkout that pretends to succeed would be exactly the kind of fake functionality this build avoids. The toggle below switches the
          in-app tier, and the gates behind it are real: on Free the coach stops reading today’s state, day plans and grocery generation are
          withheld, Eat-Out and Festival modes close, the consistency score is hidden and swaps are metered. Every line in the Premium column
          is enforced by something in the app — the two lists are generated from the same table the gates read, so they cannot drift apart.
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-bold">Free</h3>
            <span className="num text-[22px] font-semibold">₹0</span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">Enough to build the logging habit</p>
          <ul className="mt-4 flex flex-col gap-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-[13px]">
                <Icon name="Check" size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--good)' }} />
                {f}
              </li>
            ))}
          </ul>
          <button className="btn mt-5 w-full" disabled={n.plan === 'free'} onClick={() => nutrition.setPlanTier('free')}>
            {n.plan === 'free' ? 'Current tier' : 'Switch to Free'}
          </button>
        </Panel>

        <Panel className="p-5" style={{ borderColor: 'var(--brand)' }}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-bold">Premium</h3>
            <span className="num text-[22px] font-semibold" style={{ color: 'var(--brand)' }}>
              ₹499<span className="text-[13px] text-[var(--ink-3)] font-normal">/month</span>
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">₹3,999 a year · ₹5,999 a year for a family of four</p>
          <ul className="mt-4 flex flex-col gap-2">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-[13px]">
                {/* The brand colour, not var(--accent): the accent follows whatever
                    the user picked in Appearance, and a plans screen that changes
                    colour with a personal preference stops reading as the brand. */}
                <Icon name="Check" size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--brand)' }} />
                {f}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary mt-5 w-full" disabled={n.plan === 'premium'} onClick={() => { nutrition.setPlanTier('premium'); toast({ text: 'Switched to Premium — no payment taken, this is a tier toggle', tone: 'info' }); }}>
            {n.plan === 'premium' ? 'Current tier' : 'Switch to Premium'}
          </button>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Why this price" />
        <p className="mt-2 text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-[72ch]">
          ₹499 a month sits below a single consultation with a dietitian and roughly at the level of one meal delivered. The annual price at ₹3,999
          assumes the usual trade: two months free in exchange for the commitment and the cash up front. The family plan at ₹5,999 exists because
          Indian households eat together — one member subscribing and four eating the food is the normal case, not the exception.
        </p>
      </Panel>
    </>
  );
}

/* ------------------------------- trust centre ----------------------------- */

const CONSENTS: Array<{
  key: 'wearable' | 'grocery' | 'activity' | 'health';
  title: string;
  what: string;
  why: string;
  ifOff: string;
}> = [
  {
    key: 'wearable',
    title: 'Wearable and step data',
    what: 'Steps, workout minutes and estimated calories burned.',
    why: 'Raises your target on days you actually trained, so a hard session does not leave you under-eating.',
    ifOff: 'Targets stay flat across the week and you log activity by hand.',
  },
  {
    key: 'activity',
    title: 'Activity you enter yourself',
    what: 'Workouts you type in, their length and rough intensity.',
    why: 'Feeds the same adjustment as above and the activity part of your consistency score.',
    ifOff: 'The consistency score drops the activity component and scales the rest.',
  },
  {
    key: 'grocery',
    title: 'Kitchen and grocery',
    what: 'What you say is in your kitchen, and the grocery lists you build.',
    why: 'Lets the engine prefer meals you can already cook tonight instead of ones needing a shop.',
    ifOff: 'Recommendations ignore your kitchen and are chosen on goal, time and budget alone.',
  },
  {
    key: 'health',
    title: 'Body measurements',
    what: 'Weight entries and the BMI derived from them.',
    why: 'Draws the weight trend and checks whether your goal is moving at a safe pace.',
    ifOff: 'The weight chart is hidden and pace warnings are switched off.',
  },
];

export function TrustPanel({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'logs' | 'exercise' | 'weights' | 'coach' | 'feedback' | 'all'>(null);

  const ERASE: Array<{ key: 'logs' | 'exercise' | 'weights' | 'coach' | 'feedback'; label: string; count: number }> = [
    { key: 'logs', label: 'Food logs', count: n.logs.length },
    { key: 'exercise', label: 'Activity entries', count: n.exercise.length },
    { key: 'weights', label: 'Weight entries', count: n.weights.length },
    { key: 'coach', label: 'Coach conversation', count: n.coach.length },
    { key: 'feedback', label: 'Meal ratings', count: n.feedback.length },
  ];

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Value first, data second" title="Where it is kept" />
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)] max-w-[74ch]">
          Everything Mango knows about you is stored in this browser, on this device, in IndexedDB. There is no account, no server and
          no sync — which also means nothing leaves here unless you export it yourself. Clearing your browser data deletes it for good.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {([
            ['Where it lives', 'This browser only'],
            ['Who else can see it', 'Nobody — there is no backend'],
            ['What we sell', 'Nothing. There are no ads and no data sales'],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <div className="label mb-1.5">{k}</div>
              <div className="text-[13px] font-semibold leading-snug">{v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Each one is optional" title="What the engine may use" />
        <div className="mt-4 flex flex-col gap-3">
          {CONSENTS.map((c) => {
            const on = n.dataConsent[c.key];
            return (
              <div key={c.key} className="rounded-xl p-3.5 sm:p-4" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                <Toggle
                  checked={on}
                  label={c.title}
                  hint={c.what}
                  onChange={(v) => {
                    nutrition.setConsent(c.key, v);
                    toast({ text: v ? `${c.title} switched on` : `${c.title} switched off`, tone: v ? 'good' : 'info' });
                  }}
                />
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="label mb-1">Why it helps</dt>
                    <dd className="text-[12px] leading-relaxed text-[var(--ink-2)]">{c.why}</dd>
                  </div>
                  <div>
                    <dt className="label mb-1">If you turn it off</dt>
                    <dd className="text-[12px] leading-relaxed text-[var(--ink-2)]">{c.ifOff}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Nothing here is hidden" title="What this build cannot do" />
        <ul className="mt-3 flex flex-col gap-2">
          {[
            'Wearables and grocery platforms are simulated. No device is connected and no order is ever placed.',
            'There is no payment system. The plan toggle changes the tier in this browser and takes no money.',
            'Natural-language food logging is a rule-based parser, not a language model.',
            'Nothing syncs between your devices, because there is no server to sync through.',
            'Mango gives general nutrition guidance. It is not medical advice and it does not manage health conditions.',
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
              <Icon name="Info" size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-3)' }} />
              {t}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Delete anything, any time" title="Erase your data" />
        <div className="mt-4 flex flex-col gap-2">
          {ERASE.map((e) => (
            <div key={e.key} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--sunken)' }}>
              <span className="min-w-0 flex-1 text-[13px]">{e.label}</span>
              <span className="shrink-0 num text-[12px] text-[var(--ink-3)]">{e.count}</span>
              <button className="btn shrink-0 !text-[12px]" disabled={e.count === 0} onClick={() => setConfirm(e.key)}>
                <Icon name="Trash2" size={13} />
                Erase
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => {
              download(`mango-nutrition-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(n, null, 2));
              toast({ text: 'Nutrition data exported', tone: 'good' });
            }}
          >
            <Icon name="Download" size={14} />
            Export everything as JSON
          </button>
          <button className="btn" style={{ color: 'var(--critical)' }} onClick={() => setConfirm('all')}>
            <Icon name="Trash2" size={14} />
            Erase all nutrition data
          </button>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'all' ? 'Erase all nutrition data?' : 'Erase this data?'}
        body={
          confirm === 'all'
            ? 'This clears your logs, activity, weights, plans, grocery list, ratings and coach conversation. Your profile and settings stay. It cannot be undone from here.'
            : 'These rows are removed from this browser. It cannot be undone from here.'
        }
        confirmLabel="Erase"
        onConfirm={() => {
          if (confirm) nutrition.eraseData(confirm);
          toast({ text: 'Erased', tone: 'info' });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
