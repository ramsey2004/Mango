import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MealSlot, Recipe, FeedbackReason } from '../../lib/nutrition-types';
import type { DB as FullDB } from '../../lib/types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { RECIPES, recipeById } from '../../lib/recipe-db';
import { targetsFor } from '../../engine/calories';
import { recommend, SLOT_SHARE, contextChecks, fitLabel, whySentence, type Ctx, type Suggestion } from '../../engine/mealRecommender';
import { TRACK_LABEL } from '../../lib/nutrition-types';
import {
  consumedOn, remainingOn, waterOn, burnedOn, trainedOn, budgetLeft, planFor,
  recentRecipeIds, consistency, SLOT_LABEL, currentSlot,
  pantryFor, expiringSoon, targets,
} from '../../engine/nutritionSelectors';
import { Panel, SectionHeader, Bar, Ring, Chip, Empty, Modal, Field, Select, useMotion, useToast, Menu , Allowance } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { entitlements, lockReason } from '../../engine/entitlements';
import { Orb } from '../../components/Orb';
import { cn, formatMins, todayISO, haptic, toISODate, addDays } from '../../lib/util';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export function NutritionHome({ db }: { db: FullDB }) {
  const n = db.nutrition;
  const nav = useNav();
  const toast = useToast();
  const { rise, spring } = useMotion();
  const [swapFor, setSwapFor] = useState<MealSlot | null>(null);
  const [whyFor, setWhyFor] = useState<MealSlot | null>(null);
  const [ratingFor, setRatingFor] = useState<Recipe | null>(null);

  const t = targets(n)!;
  const eaten = consumedOn(n);
  const left = remainingOn(n);
  const plan = planFor(n);
  const water = waterOn(n);
  const burned = burnedOn(n);
  const trained = trainedOn(n);
  const cons = consistency(n);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const nowSlot = currentSlot();

  const planned = plan?.meals ?? [];
  const planCost = planned.reduce((s, m) => s + (recipeById(m.recipeId, n.customRecipes)?.costRupees ?? 0), 0);
  const planMins = planned.reduce((s, m) => s + (recipeById(m.recipeId, n.customRecipes)?.prepMins ?? 0), 0);
  const planKcal = planned.reduce((s, m) => s + (recipeById(m.recipeId, n.customRecipes)?.kcal ?? 0), 0);

  const proteinUrgency = Math.min(
    2.2,
    Math.max(0.6, Math.max(0, left.protein) / Math.max(1, t.protein) / Math.max(0.15, Math.max(0, left.kcal) / Math.max(1, t.kcal))),
  );

  const ctxFor = (slot: MealSlot): Ctx => ({
    profile: n.profile!,
    slot,
    proteinUrgency,
    remaining: left,
    slotShare: SLOT_SHARE[slot],
    budgetLeft: budgetLeft(n),
    minutesAvailable: n.profile!.typicalCookMins,
    pantry: pantryFor(n),
    useSoon: expiringSoon(n, 3).map((p) => p.name),
    trainedToday: trained,
    recentRecipeIds: recentRecipeIds(n),
    feedback: n.feedback,
    rejected: n.rejected,
  });

  const swapOptions = useMemo<Suggestion[]>(() => {
    if (!swapFor) return [];
    const exclude = planned.map((m) => m.recipeId);
    return recommend(ctxFor(swapFor), [...RECIPES, ...n.customRecipes].filter((r) => !exclude.includes(r.id)), 6);
  }, [swapFor, n]);

  const whyCtx = useMemo(() => (whyFor ? ctxFor(whyFor) : null), [whyFor, n]);
  const whyList = useMemo<Suggestion[]>(() => {
    if (!whyFor) return [];
    const current = planned.find((m) => m.slot === whyFor);
    if (!current) return [];
    const r = recipeById(current.recipeId, n.customRecipes);
    return r && whyCtx ? recommend(whyCtx, [r], 1) : [];
  }, [whyFor, n]);

  const macro = (label: string, have: number, target: number, color: string) => {
    const pctv = target > 0 ? (have / target) * 100 : 0;
    return (
      <div key={label}>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[12px]">{label}</span>
          <span className="num text-[11.5px] text-[var(--ink-3)]">
            {Math.round(have)} / {target} g
          </span>
        </div>
        <Bar value={pctv} color={color} height={7} label={label} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* A calorie target that moves by a few hundred with no explanation is
          how a health app loses trust. The re-basing is announced once. */}
      {n.energyMethodNotice === 'pending' && (
        <Panel className="order-first p-3.5" style={{ borderColor: 'var(--accent)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-[70ch]">
              <div className="text-[13.5px] font-semibold">Your calorie target has changed</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                Mango was using activity multipliers that sat below the range FAO/WHO/UNU report for
                people who are up and about — the old “sedentary” figure described bed rest rather than
                desk work. They now sit inside the published bands, so most targets have risen by
                roughly 200–400 kcal. Your old number was too low, not your new one too high.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="btn" onClick={() => { nutrition.dismissEnergyNotice(); nutrition.regeneratePlan(); }}>
                Got it
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* ------------------------------ greeting ------------------------------ */}
      <header className="order-first flex flex-wrap items-end justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="label mb-2">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            {trained && ' · you trained today'}
          </div>
          <h1 className="display text-[clamp(28px,4.6vw,42px)] leading-[1.05]">
            {greeting}
            {n.profile!.name ? `, ${n.profile!.name}` : ''}
          </h1>
          <p className="mt-2 text-[14px] text-[var(--ink-2)] max-w-[54ch]">
            {left.kcal > 0
              ? `${left.kcal} kcal and ${Math.max(0, left.protein)} g of protein left today. Here is what you can realistically eat.`
              : `You are ${Math.abs(left.kcal)} kcal past target — eat normally at the next meal, do not skip it.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => nav.go('nut_log')}>
            <Icon name="Plus" size={14} />
            Log food
          </button>
          <button className="btn" onClick={() => nav.go('nut_coach')}>
            <Icon name="Sparkles" size={14} />
            Ask the coach
          </button>
          <button className="btn btn-primary" onClick={() => nav.go('nut_now')}>
            <Icon name="Zap" size={14} />
            What should I eat now?
          </button>
        </div>
      </header>

      {/* ------------------------------- numbers ------------------------------
          On a phone the plan comes first: the question this screen exists to
          answer is "what do I eat", not "what are my macros". */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Panel className="p-4 sm:p-5 lg:col-span-2">
          <SectionHeader
            label={t.usable ? `Target ${t.kcal} kcal · ${t.note}` : 'Your profile is missing something these numbers need'}
            title="Today's nutrition"
          />

          {/* A number computed from a blank field is not a target, and showing
              one anyway is the worst thing a health-adjacent app can do. */}
          {!t.usable && (
            <div className="mt-3 rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
              <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
                Mango cannot work out your targets without your{' '}
                <strong>{t.missing.join(' and ')}</strong>. The figures below are placeholders, not advice.
              </p>
              <button className="btn mt-3" onClick={() => nav.go('settings', 'nutrition')}>
                <Icon name="User" size={14} />
                Fill in your profile
              </button>
            </div>
          )}

          {t.usable && t.clamped.length > 0 && (
            <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
              {t.clamped.map((c) => <div key={c}>{c}.</div>)}
              <div className="mt-1 text-[var(--ink-3)]">Worth correcting in your profile — the target above is only as good as what it was given.</div>
            </div>
          )}

          {t.minor && (
            <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
              Your profile says you are under 18. Mango will not set a weight-loss target for you, and these figures are
              rough estimates — an adult formula applied to a growing body. Please talk to a doctor or a registered
              dietitian before changing how you eat.
            </div>
          )}

          {/* A training day is a different day. Say so, and show the working. */}
          {t.activityNote && (
            <div
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3.5 py-2.5"
              style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
            >
              <span
                className="chip shrink-0"
                style={t.activityCredit > 0
                  ? { borderColor: 'var(--good)', color: 'var(--good)' }
                  : { color: 'var(--ink-3)' }}
              >
                <Icon name="Dumbbell" size={12} />
                {t.activityCredit > 0 ? 'Training day' : 'Trained today'}
              </span>
              {t.activityCredit > 0 ? (
                <span className="num shrink-0 text-[12.5px]">
                  <span className="text-[var(--ink-3)] line-through">{t.restDayKcal}</span>
                  <span className="mx-1.5 text-[var(--ink-3)]">→</span>
                  <span className="font-semibold">{t.kcal} kcal</span>
                </span>
              ) : (
                <span className="num shrink-0 text-[12.5px] font-semibold">{t.kcal} kcal, unchanged</span>
              )}
              <span className="min-w-0 flex-1 basis-[16rem] text-[11.5px] leading-relaxed text-[var(--ink-3)]">
                {t.activityNote}
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-6">
            <Ring value={t.kcal ? (eaten.kcal / t.kcal) * 100 : 0} size={104} stroke={7} color="var(--accent)">
              <span className="flex flex-col items-center">
                <span className="num text-[20px] font-semibold leading-none">{Math.max(0, left.kcal)}</span>
                <span className="label mt-1 !text-[9px]">left</span>
              </span>
            </Ring>
            <div className="flex-1 min-w-[15rem] grid gap-3">
              {macro('Protein', eaten.protein, t.protein, 'var(--cat-3)')}
              {macro('Carbohydrate', eaten.carbs, t.carbs, 'var(--cat-2)')}
              {macro('Fat', eaten.fat, t.fat, 'var(--cat-5)')}
              {macro('Fibre', eaten.fibre, t.fibre, 'var(--cat-6)')}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-[12px] text-[var(--ink-3)]">
            <span>Eaten <span className="num text-[var(--ink)]">{eaten.kcal}</span> kcal</span>
            <span>Burned <span className="num text-[var(--ink)]">{burned}</span> kcal</span>
            <span>Maintenance <span className="num text-[var(--ink)]">{t.tdee}</span> kcal</span>
            {t.floored && <span style={{ color: 'var(--warning)' }}>Target held at a safe floor</span>}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader label="Last seven days" title="Consistency" />
            <div className="mt-3 flex items-center gap-4">
              <Ring value={cons.score} size={62} stroke={5} color={cons.score >= 70 ? 'var(--good)' : cons.score >= 40 ? 'var(--warning)' : 'var(--critical)'}>
                {cons.score}
              </Ring>
              <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed">{cons.message}</p>
            </div>
            <button className="btn btn-ghost !text-[12px] mt-2 !px-1" onClick={() => nav.go('nut_progress')}>
              See the breakdown
              <Icon name="ArrowRight" size={12} />
            </button>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader label={`${(water / 1000).toFixed(2)} of ${(n.waterGoalMl / 1000).toFixed(1)} litres`} title="Water" />
            <Bar value={(water / n.waterGoalMl) * 100} color="var(--cat-2)" height={8} className="mt-3" label="Water" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[250, 500, 750].map((ml) => (
                <button
                  key={ml}
                  className="btn !py-1 !text-[12px]"
                  onClick={() => {
                    nutrition.addWater(ml);
                    haptic(6);
                  }}
                >
                  +{ml} ml
                </button>
              ))}
              <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nutrition.undoWater()} aria-label="Undo last water entry">
                <Icon name="Undo2" size={12} />
              </button>
            </div>
          </Panel>
        </div>
      </div>

      {/* --------------------- what changed after you logged ------------------- */}
      {n.lastReplan && n.lastReplan.changes.length > 0 && (
        <Panel className="order-first lg:order-none p-4 sm:p-5" style={{ borderColor: 'var(--accent)' }}>
          <SectionHeader
            label={`Because of ${n.lastReplan.trigger}`}
            title="The rest of your day changed"
            right={
              <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nutrition.dismissReplan()}>
                <Icon name="X" size={13} />
                Dismiss
              </button>
            }
          />
          <ul className="mt-3 flex flex-col gap-2">
            {n.lastReplan.changes.map((c) => (
              <li key={c.slot} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
                <span className="label shrink-0 !text-[10px]">{SLOT_LABEL[c.slot]}</span>
                {c.fromName && <span className="text-[var(--ink-3)] line-through">{c.fromName}</span>}
                <span className="text-[var(--ink-3)]">→</span>
                <span className="font-semibold">{c.toName ?? 'dropped — no room left today'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink-3)]">
            You have {Math.max(0, left.kcal)} kcal and {Math.max(0, left.protein)} g of protein left, so the meals still
            ahead were rebuilt to fit what is actually remaining rather than what the morning assumed.
          </p>
        </Panel>
      )}

      {/* ----------------------------- today's plan --------------------------- */}
      <Panel className="order-first lg:order-none p-4 sm:p-5">
        <SectionHeader
          label={
            planned.length
              ? `${planKcal} kcal planned · about ₹${planCost} of a ₹${n.profile!.budgetPerDay} budget · ${formatMins(planMins)} of cooking`
              : 'Nothing planned yet'
          }
          title="Today's plan"
          right={
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_meals')}>
                Kitchen mode
              </button>
              <button
                className="btn !py-1 !text-[12px]"
                onClick={() => {
                  nutrition.regeneratePlan();
                  toast({ text: 'Plan rebuilt around what has changed', tone: 'good' });
                }}
              >
                <Icon name="RotateCcw" size={13} />
                Rebuild
              </button>
            </div>
          }
        />

        {plan?.proteinShortfall ? (
          <div className="mt-3 rounded-xl p-3 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
            This plan lands about <strong>{plan.proteinShortfall} g short on protein</strong>. Hitting {t.protein} g on a ₹
            {n.profile!.budgetPerDay} vegetarian day is genuinely tight — the cheapest ways to close it are curd, roasted chana, soya chunks
            and sprouts. I would rather say this than quietly pretend the numbers worked.
          </div>
        ) : null}

        {/* An empty slot is a real answer when the day is already full. */}
        {plan?.skippedSlots && plan.skippedSlots.length > 0 && (
          <div className="mt-3 rounded-xl p-3 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            No {plan.skippedSlots.map((sl) => SLOT_LABEL[sl].toLowerCase()).join(' or ')} planned — there is only{' '}
            {Math.max(0, left.kcal)} kcal left in the day, and filling those slots would mean recommending food you do not have room for.
            {left.protein > 20 && ' If you are still hungry, something protein-heavy and small is the better call than a full meal.'}
          </div>
        )}

        {planned.length === 0 ? (
          <Empty
            icon="Inbox"
            title="No plan for today yet"
            body="Mango builds it from your target, your budget, the time you have and what is in your kitchen."
            action={
              <button className="btn btn-primary" onClick={() => nutrition.regeneratePlan()}>
                Build today's plan
              </button>
            }
          />
        ) : (
          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
            {SLOTS.map((slot) => {
              const meal = planned.find((m) => m.slot === slot);
              const r = meal ? recipeById(meal.recipeId, n.customRecipes) : undefined;
              if (!r || !meal) {
                return (
                  <div key={slot} className="rounded-xl p-4" style={{ background: 'var(--sunken)', border: '1px dashed var(--hairline-strong)' }}>
                    <div className="label mb-1">{SLOT_LABEL[slot]}</div>
                    <div className="text-[12.5px] text-[var(--ink-3)]">Nothing fits here yet — widen your budget or time and rebuild.</div>
                  </div>
                );
              }
              const isNow = slot === nowSlot && !meal.eaten;
              const pantryHits = r.ingredients.filter((i) => n.pantry.some((p) => i.name.toLowerCase().includes(p.name.toLowerCase())));
              return (
                <motion.div
                  key={slot}
                  {...rise}
                  transition={spring}
                  className="rounded-xl p-4 flex flex-col"
                  style={{
                    background: meal.eaten ? 'var(--sunken)' : 'var(--raised)',
                    border: `1px solid ${isNow ? 'var(--accent)' : 'var(--hairline)'}`,
                    opacity: meal.eaten ? 0.72 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="label">{SLOT_LABEL[slot]}</span>
                        {isNow && <Chip color="var(--accent)">now</Chip>}
                        {meal.eaten && <Chip color="var(--good)">eaten</Chip>}
                        {meal.locked && <Icon name="Lock" size={11} className="text-[var(--ink-3)]" />}
                      </div>
                      <h3 className="text-[15px] font-bold leading-snug">
                        <span aria-hidden className="mr-1.5">{r.emoji}</span>
                        {r.name}
                      </h3>
                    </div>
                    <Menu
                      trigger={<Icon name="MoreHorizontal" size={15} />}
                      items={[
                        { label: meal.locked ? 'Unlock' : 'Lock this meal', icon: 'Lock', run: () => nutrition.toggleMealLock(todayISO(), slot) },
                        { label: 'Why this?', icon: 'Info', run: () => setWhyFor(slot) },
                        { label: 'Rate it', icon: 'Star', run: () => setRatingFor(r) },
                      ]}
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
                    <span className="num"><span className="text-[var(--ink)]">{r.kcal}</span> kcal</span>
                    <span className="num"><span className="text-[var(--ink)]">{r.protein}</span> g protein</span>
                    <span className="num">{formatMins(r.prepMins)}</span>
                    <span className="num">₹{r.costRupees}</span>
                    {/* Show the number the user's own track actually weights, not a
                        clinical metric the engine is ignoring today. */}
                    {n.profile!.track === 'fat_loss' ? (
                      <span className="num" title="Protein per 100 kcal — what makes a deficit liveable">
                        {Math.round((r.protein / Math.max(1, r.kcal)) * 100 * 10) / 10} g P/100 kcal
                      </span>
                    ) : n.profile!.track === 'muscle_gain' ? (
                      <span className="num" title="Fibre">{Math.round(r.fibre)} g fibre</span>
                    ) : (
                      r.gi !== undefined && <span className="num" title="Glycaemic index — how fast it digests">GI {r.gi}</span>
                    )}
                  </div>

                  {pantryHits.length > 0 && (
                    <div className="mt-2 text-[11.5px]" style={{ color: 'var(--good)' }}>
                      Uses {pantryHits.map((i) => i.name).join(', ')} from your kitchen
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!meal.eaten ? (
                      <button
                        className="btn btn-primary !py-1 !text-[12px]"
                        onClick={() => {
                          nutrition.eatPlannedMeal(todayISO(), slot);
                          haptic(10);
                          toast({ text: `${r.name} logged`, tone: 'good' });
                        }}
                      >
                        <Icon name="Check" size={12} />
                        I ate this
                      </button>
                    ) : (
                      <Chip color="var(--good)" glyph="✓">Logged</Chip>
                    )}
                    <button className="btn !py-1 !text-[12px]" onClick={() => setSwapFor(slot)}>
                      <Icon name="Repeat" size={12} />
                      Swap
                    </button>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => setWhyFor(slot)}>
                      Why this?
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ------------------------------- activity ----------------------------- */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ActivityCard db={db} />
        <PantryCard db={db} />
      </div>

      {/* -------------------------------- swap -------------------------------- */}
      <Modal
        open={!!swapFor}
        onClose={() => setSwapFor(null)}
        wide
        title={swapFor ? `Swap ${SLOT_LABEL[swapFor].toLowerCase()}` : ''}
      >
        <p className="text-[12.5px] text-[var(--ink-2)] mb-4">
          Ranked against what is left of today — not just calories. Choosing one updates your totals immediately, and tells the engine what you
          turned down.
        </p>
        <SwapAllowance db={db} />
        <div className="flex flex-col gap-2">
          {swapOptions.map((s) => (
            <button
              key={s.recipe.id}
              onClick={() => {
                if (!swapFor) return;
                // Metered before the work, not after: a limit that runs the
                // engine and then hides the result is theatre.
                if (!nutrition.useAllowance('swap')) {
                  toast({ text: lockReason('unlimitedSwaps').body, tone: 'warning' });
                  return;
                }
                nutrition.swapMeal(todayISO(), swapFor, s.recipe.id);
                setSwapFor(null);
                toast({ text: `Swapped to ${s.recipe.name}`, tone: 'good' });
              }}
              className="rounded-xl p-3.5 text-left row-hover"
              style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">
                    <span aria-hidden className="mr-1.5">{s.recipe.emoji}</span>
                    {s.recipe.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-[var(--ink-3)] num">
                    <span>{s.recipe.kcal} kcal</span>
                    <span>{s.recipe.protein} g protein</span>
                    <span>{formatMins(s.recipe.prepMins)}</span>
                    <span>₹{s.recipe.costRupees}</span>
                  </div>
                </div>
                <span className="num text-[11px] text-[var(--ink-3)] shrink-0">score {s.score}</span>
              </div>
              {s.reasons.filter((r) => r.delta > 0).slice(0, 2).length > 0 && (
                <div className="mt-2 text-[11.5px] text-[var(--ink-2)]">
                  {s.reasons.filter((r) => r.delta > 0).slice(0, 2).map((r) => r.label).join(' · ')}
                </div>
              )}
            </button>
          ))}
          {swapOptions.length === 0 && <Empty icon="Search" title="No alternatives clear your constraints" body="Loosen the budget or the cooking time and try again." />}
        </div>
      </Modal>

      {/* -------------------------------- why --------------------------------- */}
      <Modal open={!!whyFor} onClose={() => setWhyFor(null)} title="Why this meal" wide>
        {whyList[0] && whyCtx ? (
          <WhyPanel suggestion={whyList[0]} ctx={whyCtx} />
        ) : (
          <Empty icon="Info" title="Nothing to explain here" />
        )}
      </Modal>

      {/* ------------------------------ feedback ------------------------------ */}
      <RatingModal recipe={ratingFor} onClose={() => setRatingFor(null)} />

      <p className="px-1 pb-2 text-[11.5px] text-[var(--ink-3)] leading-relaxed max-w-[76ch]">
        Mango gives general nutrition guidance and is not a substitute for professional medical advice. Calorie and macro figures are estimates
        from standard composition tables, not measurements of the food in front of you.{' '}
        <button className="underline py-2 -my-1 inline-block" onClick={() => nav.go('settings', 'nutrition')}>Read the full disclaimer</button>.
      </p>
    </div>
  );
}

/* ------------------------------- sub-panels ------------------------------- */

function ActivityCard({ db }: { db: FullDB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('gym');
  const [mins, setMins] = useState(45);
  const today = n.exercise.filter((e) => e.date === todayISO());
  const burned = today.reduce((s, e) => s + e.kcalBurned, 0);
  const wearable = n.integrations.find((i) => i.kind === 'wearable' && i.connected);

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader
          label={`${burned} kcal logged today`}
          title="Activity"
          right={
            <button className="btn !py-1 !text-[12px]" onClick={() => setOpen(true)}>
              <Icon name="Plus" size={13} />
              Log
            </button>
          }
        />
        {wearable && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg p-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            <Icon name="Activity" size={14} style={{ color: 'var(--info)' }} />
            <span className="text-[12px] flex-1">{wearable.name} connected</span>
            <Chip color="var(--warning)">Simulated data</Chip>
            <button
              className="btn btn-ghost !py-1 !text-[11.5px]"
              onClick={() => {
                const steps = nutrition.syncSimulatedWearable();
                toast({ text: `Synced ${steps.toLocaleString('en-IN')} simulated steps`, tone: 'info' });
              }}
            >
              Sync
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-1">
          {today.length ? (
            today.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                <Icon name="Dumbbell" size={14} className="text-[var(--ink-3)] shrink-0" />
                <span className="min-w-0 flex-1 text-[12.5px] truncate">
                  {e.label}
                  {e.simulated && <span className="text-[var(--ink-3)]"> · simulated</span>}
                </span>
                <span className="num shrink-0 text-[11.5px] text-[var(--ink-3)]">{e.minutes}m · {e.kcalBurned} kcal</span>
                <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => nutrition.deleteExercise(e.id)} aria-label="Delete">
                  <Icon name="X" size={12} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-[12.5px] text-[var(--ink-3)] py-2">Nothing logged today. Activity raises tomorrow's protein weighting, not today's calorie target.</p>
          )}
        </div>
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log activity"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                nutrition.addExercise({ date: todayISO(), kind: kind as never, label: LABELS[kind] ?? kind, minutes: mins });
                setOpen(false);
                toast({ text: 'Activity logged', tone: 'good' });
              }}
            >
              Log it
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What did you do?" as="div">
            <Select value={kind} onChange={setKind} options={Object.entries(LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          </Field>
          <Field label="Minutes">
            <input className="field" type="number" min={5} step={5} value={mins} onChange={(e) => setMins(Number(e.target.value))} />
          </Field>
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--ink-3)]">
          Calories burned are estimated from a standard MET table and your body weight. Treat them as a rough guide — wearables and formulas both
          overstate this number.
        </p>
      </Modal>
    </>
  );
}

const LABELS: Record<string, string> = {
  gym: 'Gym — resistance training',
  walking: 'Walking',
  running: 'Running',
  cycling: 'Cycling',
  yoga: 'Yoga',
  sports: 'Sport',
  other: 'Something else',
};

function PantryCard({ db }: { db: FullDB }) {
  const n = db.nutrition;
  const nav = useNav();
  const [text, setText] = useState(n.pantry.map((p) => p.name).join(', '));
  const toast = useToast();

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader label="Recommendations are built around this first" title="What is in your kitchen?" />
      <div className="mt-3 flex flex-col gap-2">
        <input
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="paneer, tomato, onion, capsicum, atta"
          onBlur={() => nutrition.setPantry(text.split(',').map((s) => s.trim()).filter(Boolean))}
        />
        <div className="flex flex-wrap gap-1.5">
          {n.pantry.map((p) => {
            const soon = p.expiresOn && p.expiresOn <= toISODate(addDays(new Date(), 3));
            return (
              <Chip key={p.id} color={soon ? 'var(--warning)' : undefined}>
                {p.name}
                {p.qty ? ` · ${p.qty}` : ''}
                {soon ? ' · use soon' : ''}
              </Chip>
            );
          })}
          {n.pantry.length === 0 && <span className="text-[12px] text-[var(--ink-3)]">Nothing listed — meals are chosen without this constraint.</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            className="btn !py-1 !text-[12px]"
            onClick={() => {
              nutrition.setPantry(text.split(',').map((s) => s.trim()).filter(Boolean));
              nutrition.regeneratePlan();
              toast({ text: 'Plan rebuilt around what you have', tone: 'good' });
            }}
          >
            Use what I already have
          </button>
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_meals')}>
            See everything I can make
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function RatingModal({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const toast = useToast();
  const [verdict, setVerdict] = useState<'loved' | 'ok' | 'disliked' | null>(null);
  const [reason, setReason] = useState<FeedbackReason | ''>('');

  const REASONS: Array<[FeedbackReason, string]> = [
    ['expensive', 'Too expensive'],
    ['difficult', 'Too difficult'],
    ['taste', "Didn't taste good"],
    ['slow', 'Took too long'],
    ['ingredients', "Didn't have the ingredients"],
    ['preference', "Doesn't suit me"],
    ['repetitive', 'Already ate something similar'],
  ];

  return (
    <Modal
      open={!!recipe}
      onClose={onClose}
      title={recipe ? `How was ${recipe.name}?` : ''}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!verdict}
            onClick={() => {
              if (!recipe || !verdict) return;
              nutrition.rateMeal(recipe.id, verdict, reason || undefined);
              setVerdict(null);
              setReason('');
              onClose();
              toast({
                text: verdict === 'disliked' ? 'Noted — you will see less of this' : 'Noted — this will show up more often',
                tone: 'good',
              });
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="flex gap-2">
        {([['loved', '👍', 'Loved it'], ['ok', '😐', 'It was okay'], ['disliked', '👎', "Didn't like it"]] as const).map(([v, e, l]) => (
          <button
            key={v}
            onClick={() => setVerdict(v)}
            className="flex-1 rounded-xl p-3 text-center"
            style={{ background: verdict === v ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${verdict === v ? 'var(--accent)' : 'var(--hairline)'}` }}
          >
            <div className="text-[22px]">{e}</div>
            <div className="text-[12px] mt-1">{l}</div>
          </button>
        ))}
      </div>
      {verdict === 'disliked' && (
        <Field label="What was wrong with it?" className="mt-4" as="div">
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(([k, label]) => (
              <button
                key={k}
                className="chip"
                onClick={() => setReason(reason === k ? '' : k)}
                style={reason === k ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}
      <p className="mt-4 text-[11.5px] text-[var(--ink-3)]">
        This is not a rating for anyone else to see. Turning something down twice makes the engine stop offering that ingredient, not just that dish.
      </p>
    </Modal>
  );
}

/* ============================================================
   Why this meal.

   The scoring table is still here, because a claim you cannot
   inspect is not a claim. But it is no longer the first thing
   you see: the checks a person would actually make come first.
   ============================================================ */

function WhyPanel({ suggestion, ctx }: { suggestion: Suggestion; ctx: Ctx }) {
  const [showScoring, setShowScoring] = useState(false);
  const r = suggestion.recipe;
  const checks = useMemo(() => contextChecks(r, ctx), [r, ctx]);
  const fit = fitLabel(checks);
  const sentence = whySentence(r, ctx, checks);

  const DATA_USED = [
    ['Your track', TRACK_LABEL[ctx.profile.track]],
    ['Time you have', formatMins(ctx.minutesAvailable)],
    ['Budget left', ctx.budgetLeft > 0 ? `₹${Math.round(ctx.budgetLeft)}` : 'not set'],
    ['Left to eat', `${Math.max(0, ctx.remaining.kcal)} kcal · ${Math.max(0, ctx.remaining.protein)} g protein`],
    ['Your kitchen', ctx.pantry.length ? `${ctx.pantry.length} items` : 'not listed'],
    ['Trained today', ctx.trainedToday ? 'yes' : 'no'],
    ['Meals you rejected', String(ctx.rejected.length)],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[17px] font-bold">
          <span aria-hidden className="mr-1.5">{r.emoji}</span>
          {r.name}
        </span>
        <Chip color={fit.tone === 'good' ? 'var(--good)' : fit.tone === 'warning' ? 'var(--warning)' : 'var(--info)'}>
          {fit.label}
        </Chip>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{sentence}</p>

      <div className="label mt-5 mb-2">For you today</div>
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2" style={{ background: 'var(--sunken)' }}>
            <Icon
              name={c.unknown ? 'Circle' : c.ok ? 'CheckCircle2' : 'CircleSlash'}
              size={15}
              className="mt-0.5 shrink-0"
              style={{ color: c.unknown ? 'var(--ink-3)' : c.ok ? 'var(--good)' : 'var(--warning)' }}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{c.label}</span>
              <span className="block text-[12px] leading-relaxed text-[var(--ink-2)]">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="label mt-5 mb-2">What it looked at</div>
      <div className="flex flex-wrap gap-1.5">
        {DATA_USED.map(([k, v]) => (
          <Chip key={k}>
            {k}: {v}
          </Chip>
        ))}
      </div>

      <button
        className="btn mt-5"
        aria-expanded={showScoring}
        onClick={() => setShowScoring((x) => !x)}
      >
        <Icon name={showScoring ? 'ChevronUp' : 'ChevronDown'} size={14} />
        {showScoring ? 'Hide the arithmetic' : 'Show the arithmetic'}
      </button>

      {showScoring && (
        <div className="mt-3 rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
          <p className="mb-3 text-[12px] text-[var(--ink-3)]">
            Every recommendation is a sum of named contributions, including the negative ones. Nothing here is a black box.
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestion.reasons.map((x, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-[var(--ink-2)]">{x.label}</span>
                <span className="num shrink-0" style={{ color: x.delta < 0 ? 'var(--critical)' : 'var(--good)' }}>
                  {x.delta > 0 ? '+' : ''}
                  {x.delta}
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-[13px] font-semibold" style={{ borderColor: 'var(--hairline)' }}>
              <span>Total</span>
              <span className="num">{suggestion.score}</span>
            </div>
          </div>
        </div>
      )}

      <div className="label mt-5 mb-2">How to make it</div>
      <ol className="flex flex-col gap-1.5 list-decimal pl-4">
        {r.steps.map((x, i) => (
          <li key={i} className="text-[12.5px] text-[var(--ink-2)]">{x}</li>
        ))}
      </ol>
    </>
  );
}


/** Shows how much of the free tier's daily swap allowance is left. */
function SwapAllowance({ db }: { db: FullDB }) {
  const nav = useNav();
  const ent = entitlements(db.nutrition);
  if (ent.tier === 'premium') return null;
  return (
    <div className="mb-3">
      <Allowance
        left={ent.swapsLeft}
        total={ent.limits.swapsPerDay}
        noun="swaps"
        onUpgrade={() => nav.go('settings', 'plan')}
      />
    </div>
  );
}
