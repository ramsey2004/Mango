import { useMemo, useState } from 'react';
import type { DB } from '../../lib/types';
import type { Recipe } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { eatNow, type EatNowInput, type EatNowPick } from '../../engine/eatNow';
import { SLOT_LABEL } from '../../engine/nutritionSelectors';
import { Panel, SectionHeader, Chip, Empty, Modal, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { cn, formatMins, todayISO } from '../../lib/util';

/* ============================================================
   What should I eat now?

   Four questions, one answer, two named alternatives. The rest
   of the app plans a day; this one handles the moment you are
   standing in the kitchen at nine at night with twelve minutes
   and no plan.
   ============================================================ */

const TIMES = [5, 10, 15, 20, 30, 45];

const WHERE: Array<{ k: EatNowInput['where']; label: string; note: string; icon: string }> = [
  { k: 'kitchen', label: 'I can cook', note: 'At home or a PG kitchen', icon: 'Flame' },
  { k: 'no-kitchen', label: 'No cooking', note: 'Hostel room, office, travelling', icon: 'Box' },
  { k: 'eating-out', label: 'Eating out', note: 'Restaurant, canteen or delivery', icon: 'Building2' },
];

const HUNGER: Array<{ k: EatNowInput['hunger']; label: string }> = [
  { k: 'peckish', label: 'Just peckish' },
  { k: 'hungry', label: 'Hungry' },
  { k: 'very-hungry', label: 'Very hungry' },
];

export function EatNow({ db }: { db: DB }) {
  const n = db.nutrition;
  const nav = useNav();
  const toast = useToast();

  const [minutes, setMinutes] = useState(15);
  const [where, setWhere] = useState<EatNowInput['where']>('kitchen');
  const [hunger, setHunger] = useState<EatNowInput['hunger']>('hungry');
  const [budget, setBudget] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [steps, setSteps] = useState<Recipe | null>(null);

  const answer = useMemo(
    () => eatNow(n, { minutes, where, hunger, budget }),
    // nonce lets "show me something else" re-run without changing the question
    [n, minutes, where, hunger, budget, nonce],
  );

  if (!n.profile) {
    return (
      <Panel className="p-2">
        <Empty
          icon="Heart"
          title="Set up nutrition first"
          body="This answer is built from your targets, your budget and your kitchen, so it needs those first."
          action={<button className="btn btn-primary" onClick={() => nav.go('nut_home')}>Set it up</button>}
        />
      </Panel>
    );
  }

  const c = answer.context;

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-1">
        <div className="label mb-2">No plan needed — just tell me about right now</div>
        <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">What should I eat now?</h1>
      </header>

      {/* ------------------------------ the question ------------------------ */}
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div>
            <div className="label mb-2">How long have you got?</div>
            <div className="flex flex-wrap gap-1.5">
              {TIMES.map((m) => (
                <button
                  key={m}
                  className="chip row-hover"
                  aria-pressed={minutes === m}
                  style={minutes === m ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                  onClick={() => setMinutes(m)}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label mb-2">Where are you?</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {WHERE.map((w) => {
                const on = where === w.k;
                return (
                  <button
                    key={w.k}
                    onClick={() => setWhere(w.k)}
                    aria-pressed={on}
                    className="flex items-start gap-2.5 rounded-xl p-3 text-left transition-colors"
                    style={{ background: on ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}` }}
                  >
                    <Icon name={w.icon} size={16} className="mt-0.5 shrink-0" style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold">{w.label}</span>
                      <span className="block text-[11.5px] text-[var(--ink-3)] mt-0.5">{w.note}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="label mb-2">How hungry?</div>
              <div className="flex flex-wrap gap-1.5">
                {HUNGER.map((h) => (
                  <button
                    key={h.k}
                    className="chip row-hover"
                    aria-pressed={hunger === h.k}
                    style={hunger === h.k ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                    onClick={() => setHunger(h.k)}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <div className="label mb-2">Spending limit</div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 50, 100, 150].map((b) => (
                  <button
                    key={b}
                    className="chip row-hover"
                    aria-pressed={budget === b}
                    style={budget === b ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                    onClick={() => setBudget(b)}
                  >
                    {b === 0 ? `My budget (₹${c.budget})` : `Under ₹${b}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          Answering from: {c.kcalLeft} kcal and {c.proteinLeft} g of protein left today
          {c.pantryCount > 0 && `, ${c.pantryCount} things in your kitchen`}
          {c.useSoon.length > 0 && `, ${c.useSoon.join(' and ')} to use up`}.
        </p>
      </Panel>

      {/* ------------------------------- the answer ------------------------- */}
      {answer.nothingFits && (
        <Panel className="p-4 sm:p-5" style={{ borderColor: 'var(--warning)' }}>
          <SectionHeader label="Being straight with you" title="That is a tight ask" />
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">{answer.nothingFits}</p>
        </Panel>
      )}

      {answer.best && (
        <PickCard pick={answer.best} db={db} hero onSteps={setSteps} onSwap={() => setNonce((x) => x + 1)} />
      )}

      {answer.alternatives.length > 0 && (
        <>
          <SectionHeader
            title={answer.best ? 'Or, if that does not suit' : 'The closest thing'}
            right={<span className="text-[11.5px] text-[var(--ink-3)]">Named by what they trade away</span>}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {answer.alternatives.map((a) => (
              <PickCard key={a.suggestion.recipe.id} pick={a} db={db} onSteps={setSteps} />
            ))}
          </div>
        </>
      )}

      {!answer.best && !answer.nothingFits && (
        <Panel className="p-2">
          <Empty icon="Search" title="Nothing to suggest" body="Loosen one of the answers above." />
        </Panel>
      )}

      <Modal open={!!steps} onClose={() => setSteps(null)} title={steps ? `${steps.emoji} ${steps.name}` : ''}>
        {steps && (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] num text-[var(--ink-3)]">
              <span>{formatMins(steps.prepMins)}</span>
              <span>about ₹{steps.costRupees}</span>
              <span>{steps.kcal} kcal</span>
              <span>{steps.protein} g protein</span>
            </div>
            <div className="label mt-4 mb-2">You need</div>
            <ul className="flex flex-col gap-1">
              {steps.ingredients.map((i) => (
                <li key={i.name} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span>{i.name}</span>
                  <span className="num shrink-0 text-[var(--ink-3)]">{i.qty}</span>
                </li>
              ))}
            </ul>
            <div className="label mt-4 mb-2">How to make it</div>
            <ol className="flex flex-col gap-1.5 list-decimal pl-4">
              {steps.steps.map((x, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">{x}</li>
              ))}
            </ol>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------- one option -------------------------------- */

function PickCard({
  pick, db, hero, onSteps, onSwap,
}: {
  pick: EatNowPick;
  db: DB;
  hero?: boolean;
  onSteps: (r: Recipe) => void;
  onSwap?: () => void;
}) {
  const r = pick.suggestion.recipe;
  const toast = useToast();
  const nav = useNav();
  const [showWhy, setShowWhy] = useState(false);
  const saved = db.nutrition.saved.includes(r.id);

  const log = () => {
    nutrition.addLog({
      date: todayISO(), slot: r.slots[0], sourceId: r.id, sourceKind: 'recipe',
      name: r.name, servings: 1, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fibre: r.fibre,
    });
    toast({ text: `${r.name} logged`, tone: 'good' });
  };

  return (
    <Panel className={cn('p-4 sm:p-5', hero && 'lg:p-6')} style={hero ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {pick.role && (
          <Chip color={pick.role === 'faster' ? 'var(--info)' : 'var(--good)'}>
            {pick.role === 'faster' ? 'Faster' : 'Cheaper'}
          </Chip>
        )}
        {hero && <Chip color="var(--accent)">Best fit right now</Chip>}
        <Chip>{SLOT_LABEL[r.slots[0]]}</Chip>
      </div>

      <div className={cn('mt-2 font-bold leading-snug', hero ? 'text-[clamp(20px,3vw,26px)]' : 'text-[17px]')}>
        <span aria-hidden className="mr-2">{r.emoji}</span>
        {r.name}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 num text-[13px] text-[var(--ink-3)]">
        <span><span className="text-[var(--ink)] font-semibold">{formatMins(r.prepMins)}</span></span>
        <span><span className="text-[var(--ink)] font-semibold">₹{r.costRupees}</span></span>
        <span><span className="text-[var(--ink)] font-semibold">{r.protein} g</span> protein</span>
        <span><span className="text-[var(--ink)] font-semibold">{r.kcal}</span> kcal</span>
      </div>

      {pick.tradeOff && (
        <p className="mt-2.5 text-[12.5px] text-[var(--ink-2)]">{pick.tradeOff}</p>
      )}

      {/* On an alternative the trade-off is the reason, so repeating the
          hero's sentence underneath it is noise rather than information. */}
      {hero && <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-2)]">{pick.why}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => onSteps(r)}>
          <Icon name="BookOpen" size={14} />
          Cook it
        </button>
        <button className="btn" onClick={log}>
          <Icon name="Check" size={14} />
          I ate this
        </button>
        {onSwap && (
          <button className="btn" onClick={onSwap}>
            <Icon name="RotateCcw" size={14} />
            Something else
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            const missing = r.ingredients.filter((i) => !db.nutrition.pantry.some((p) => i.name.toLowerCase().includes(p.name.toLowerCase())));
            if (!missing.length) {
              toast({ text: 'You already have everything for this', tone: 'good' });
              return;
            }
            for (const i of missing) nutrition.addGroceryItem({ name: i.name, qty: i.qty, group: i.group, estCost: 0 });
            toast({ text: `${missing.length} items added to your grocery list`, tone: 'good', action: { label: 'Open', run: () => nav.go('nut_grocery') } });
          }}
        >
          <Icon name="ShoppingBag" size={14} />
          Shop for it
        </button>
        <button
          className="btn"
          aria-pressed={saved}
          onClick={() => {
            const now = nutrition.toggleSaved(r.id);
            toast({ text: now ? `${r.name} saved` : `${r.name} removed from saved`, tone: now ? 'good' : 'info' });
          }}
        >
          <Icon name={saved ? 'BookmarkCheck' : 'Bookmark'} size={14} />
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <button className="btn btn-ghost mt-3 !px-0 !text-[12.5px]" aria-expanded={showWhy} onClick={() => setShowWhy((x) => !x)}>
        <Icon name={showWhy ? 'ChevronUp' : 'ChevronDown'} size={13} />
        {showWhy ? 'Hide the checks' : 'Show every check'}
      </button>

      {showWhy && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {pick.checks.map((ch) => (
            <li key={ch.key} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2" style={{ background: 'var(--sunken)' }}>
              <Icon
                name={ch.unknown ? 'Circle' : ch.ok ? 'CheckCircle2' : 'CircleSlash'}
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: ch.unknown ? 'var(--ink-3)' : ch.ok ? 'var(--good)' : 'var(--warning)' }}
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold">{ch.label}</span>
                <span className="block text-[11.5px] leading-relaxed text-[var(--ink-2)]">{ch.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
