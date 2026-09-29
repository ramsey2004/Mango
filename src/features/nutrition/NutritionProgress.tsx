import { useMemo, useState } from 'react';
import type { DB } from '../../lib/types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { TRACK_LABEL } from '../../lib/nutrition-types';
import { targetsFor, bmi, bmiBand, waistReading } from '../../engine/calories';
import { WhyNumber } from './WhyNumber';
import { consumedOn, waterOn, consistency } from '../../engine/nutritionSelectors';
import { Panel, SectionHeader, Segmented, Bar, Empty, Field, Modal, useToast, Chip , Locked } from '../../components/ui';
import { StatTile, LineChart, HBar, Heatmap } from '../../components/Charts';
import { Icon } from '../../components/Icon';
import { entitlements, lockReason, FREE_LIMITS } from '../../engine/entitlements';
import { toISODate, addDays, todayISO, formatMins } from '../../lib/util';

export function NutritionProgress({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [rangeKey, setRangeKey] = useState<'7' | '30' | '90'>('30');
  /* The free tier's chart depth is advertised on the plans screen, so it has to
     be true here. Clamped rather than hidden: the control still shows what the
     longer ranges are, and says why they are not available. */
  const rangeCap = entitlements(n).can('fullAnalytics') ? Infinity : FREE_LIMITS.historyDays;
  const range = Math.min(Number(rangeKey), rangeCap);
  const [weighing, setWeighing] = useState(false);
  const [kg, setKg] = useState(n.profile?.weightKg ?? 70);

  const t = targetsFor(n.profile!);
  const ent = entitlements(n);
  const nav = useNav();
  const cons = consistency(n);
  const days = useMemo(() => Array.from({ length: range }, (_, i) => toISODate(addDays(new Date(), -(range - 1 - i)))), [range]);

  const kcalSeries = days.map((d) => ({ x: d.slice(5), y: consumedOn(n, d).kcal }));
  const proteinSeries = days.map((d) => ({ x: d.slice(5), y: consumedOn(n, d).protein }));
  const loggedDays = days.filter((d) => n.logs.some((l) => l.date === d)).length;

  // Body measurements are consent-gated in the trust centre.
  const weights = (n.dataConsent.health ? [...n.weights] : []).sort((a, b) => a.date.localeCompare(b.date)).filter((w) => w.date >= days[0]);
  const weightSeries = weights.map((w) => ({ x: w.date.slice(5), y: w.kg }));
  const first = weights[0]?.kg;
  const last = weights[weights.length - 1]?.kg;
  const delta = first !== undefined && last !== undefined ? Math.round((last - first) * 10) / 10 : null;

  const avgKcal = Math.round(kcalSeries.filter((p) => p.y > 0).reduce((s, p) => s + p.y, 0) / Math.max(1, loggedDays));
  const avgProtein = Math.round(proteinSeries.filter((p) => p.y > 0).reduce((s, p) => s + p.y, 0) / Math.max(1, loggedDays));
  const onTargetDays = days.filter((d) => {
    const c = consumedOn(n, d).kcal;
    return c > 0 && Math.abs(c - t.kcal) <= t.kcal * 0.15;
  }).length;

  const bmiValue = bmi(n.profile!.weightKg, n.profile!.heightCm);
  const band = bmiBand(bmiValue);
  const waist = n.profile!.waistCm ? waistReading(n.profile!.waistCm, n.profile!.heightCm, n.profile!.sex) : null;

  const activityDays: Record<string, number> = {};
  for (const e of n.exercise) activityDays[e.date] = (activityDays[e.date] ?? 0) + 1;

  const waterRows = days.slice(-14).map((d) => ({
    label: d.slice(5),
    value: Math.round((waterOn(n, d) / 1000) * 10) / 10,
    color: waterOn(n, d) >= n.waterGoalMl ? 'var(--good)' : 'var(--cat-2)',
  }));

  const macroSplit = (() => {
    const totals = days.reduce(
      (a, d) => {
        const c = consumedOn(n, d);
        return { p: a.p + c.protein * 4, c: a.c + c.carbs * 4, f: a.f + c.fat * 9 };
      },
      { p: 0, c: 0, f: 0 },
    );
    const sum = totals.p + totals.c + totals.f;
    if (!sum) return [];
    return [
      { label: 'Protein', value: Math.round((totals.p / sum) * 100), color: 'var(--cat-3)' },
      { label: 'Carbohydrate', value: Math.round((totals.c / sum) * 100), color: 'var(--cat-2)' },
      { label: 'Fat', value: Math.round((totals.f / sum) * 100), color: 'var(--cat-5)' },
    ];
  })();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {loggedDays} of the last {range} days logged
            {Number(rangeKey) > range && ' · free tier shows 7 days'}
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Nutrition progress</h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Segmented
            value={rangeKey}
            onChange={setRangeKey}
            ariaLabel="Range"
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: Number.isFinite(rangeCap) ? '30 days · Premium' : '30 days' },
              { value: '90', label: Number.isFinite(rangeCap) ? '90 days · Premium' : '90 days' },
            ]}
          />
          <button className="btn shrink-0" onClick={() => setWeighing(true)}>
            <Icon name="Plus" size={14} />
            Log weight
          </button>
        </div>
      </header>

      <Panel className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
          <StatTile label="Weight now" value={`${n.profile!.weightKg} kg`} sub={delta !== null ? `${delta > 0 ? '+' : ''}${delta} kg this period` : 'no history yet'} tone={delta !== null && delta < 0 && n.profile!.track === 'fat_loss' ? 'good' : undefined} />
          <StatTile label="BMI" value={bmiValue} sub={band.label} tone={band.tone === 'good' ? 'good' : band.tone === 'critical' ? 'critical' : 'warning'} />
          <StatTile label="Average intake" value={avgKcal || '—'} sub={`target ${t.kcal} kcal`} />
          <StatTile label="Average protein" value={`${avgProtein || 0} g`} sub={`target ${t.protein} g`} tone={avgProtein >= t.protein * 0.9 ? 'good' : 'warning'} />
          <StatTile label="Days on target" value={`${onTargetDays}/${range}`} sub="within 15% of target" />
        </div>

        {/* BMI states a band and never a diagnosis: the framework these
            cut-offs come from requires functional impairment or a comorbidity
            as well, which an app cannot see. */}
        <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-[var(--ink-3)]">
          {band.context}{band.needed ? ` ${band.needed}` : ''}
        </p>
        {waist && (
          <p className="mt-1.5 max-w-[70ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
            <span className="font-semibold">Waist {waist.waistCm} cm</span> — {waist.context}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
          <WhyNumber label="Your daily target" estimate={t.kcalEstimate} unit="kcal a day" extra={t.deficitWhy} />
          <WhyNumber label="Maintenance (TDEE)" estimate={t.tdeeEstimate} unit="kcal a day" />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label="How the score is built" title="Consistency" />
        {!ent.can('consistencyScore') && (
          <div className="mt-3">
            <Locked
              title={lockReason('consistencyScore').title}
              body={lockReason('consistencyScore').body}
              onUpgrade={() => nav.go('settings', 'plan')}
            />
          </div>
        )}
        <div className="mt-4 grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div>
            <div className="num text-[44px] font-semibold leading-none" style={{ color: cons.score >= 70 ? 'var(--good)' : cons.score >= 40 ? 'var(--warning)' : 'var(--critical)' }}>
              {cons.score}
              <span className="text-[16px] text-[var(--ink-3)] font-normal"> / 100</span>
            </div>
            <p className="mt-2 text-[12.5px] text-[var(--ink-2)] leading-relaxed">{cons.message}</p>
          </div>
          <div className="flex flex-col gap-3">
            {cons.parts.map((p) => (
              <div key={p.label}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[12.5px]">{p.label}</span>
                  <span className="num text-[11.5px] text-[var(--ink-3)]">{p.value}/{p.max} · {p.detail}</span>
                </div>
                <Bar value={(p.value / p.max) * 100} height={7} color={p.value / p.max > 0.7 ? 'var(--good)' : p.value / p.max > 0.4 ? 'var(--warning)' : 'var(--critical)'} label={p.label} />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <SectionHeader label={`Daily intake against a ${t.kcal} kcal target`} title="Calories" />
          <div className="mt-4">
            <LineChart points={kcalSeries} yLabel="kcal" color="var(--cat-1)" />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label={`Daily protein against a ${t.protein} g target`} title="Protein" />
          <div className="mt-4">
            <LineChart points={proteinSeries} yLabel="g" color="var(--cat-3)" />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label={!n.dataConsent.health ? 'Switched off in Your data' : weights.length > 1 ? `${weights.length} readings` : 'Log a weight to start the trend'} title="Weight" />
          <div className="mt-4">
            {weightSeries.length > 1 ? (
              <LineChart points={weightSeries} yLabel="kg" color="var(--cat-4)" />
            ) : (
              <Empty icon="TrendingUp" title="Not enough readings" body="Weigh yourself at the same time of day, two or three times a week. Daily readings mostly measure water." />
            )}
          </div>
          {delta !== null && weights.length > 1 && (
            <p className="mt-3 text-[12.5px] text-[var(--ink-2)]">
              {delta === 0
                ? 'Flat over this period.'
                : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} kg, about ${Math.abs(Math.round((delta / (weights.length / 3)) * 10) / 10)} kg a week. ${
                    n.profile!.track === 'fat_loss' && delta < 0
                      ? 'That is the direction you asked for.'
                      : n.profile!.track === 'muscle_gain' && delta > 0
                        ? 'Consistent with the surplus you set.'
                        : 'Worth checking against how you feel, not just the number.'
                  }`}
            </p>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Where your calories come from" title="Macro split" />
          <div className="mt-4">
            {macroSplit.length ? <HBar rows={macroSplit} unit="%" max={100} /> : <Empty icon="BarChart3" title="No logs in this period" />}
          </div>
          {macroSplit.length > 0 && (
            <p className="mt-3 text-[12px] text-[var(--ink-3)] leading-relaxed">
              For {TRACK_LABEL[n.profile!.track]} your target split works out to roughly{' '}
              {Math.round(((t.protein * 4) / t.kcal) * 100)}% protein, {Math.round(((t.carbs * 4) / t.kcal) * 100)}% carbohydrate and{' '}
              {Math.round(((t.fat * 9) / t.kcal) * 100)}% fat.
            </p>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Litres per day, last two weeks" title="Water" />
          <div className="mt-4">
            <HBar rows={waterRows} unit="L" max={Math.max(3, n.waterGoalMl / 1000)} />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Every day you logged activity" title="Activity" />
          <div className="mt-4">
            <Heatmap days={activityDays} color="var(--cat-3)" weeks={14} />
          </div>
          <p className="mt-3 text-[12px] text-[var(--ink-3)]">
            {n.exercise.length} sessions logged in total, {n.exercise.filter((e) => e.simulated).length} of them from the simulated wearable.
          </p>
        </Panel>
      </div>

      <Modal
        open={weighing}
        onClose={() => setWeighing(false)}
        title="Log your weight"
        footer={
          <>
            <button className="btn" onClick={() => setWeighing(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                nutrition.addWeight(kg);
                setWeighing(false);
                toast({ text: 'Weight logged — targets recalculated', tone: 'good' });
              }}
            >
              Save
            </button>
          </>
        }
      >
        <Field label="Weight (kg)" hint="This also updates your BMR, so your calorie target moves with you.">
          <input className="field" type="number" step={0.1} min={25} max={250} value={kg} onChange={(e) => setKg(Number(e.target.value))} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
