import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DB } from '../../lib/types';
import type { Recipe } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { TRACK_LABEL } from '../../lib/nutrition-types';
import { useNav } from '../../store/nav';
import { coachReply, QUICK_ACTIONS } from '../../engine/nutritionCoach';
import { targetsFor } from '../../engine/calories';
import { consumedOn, remainingOn, waterOn, trainedOn, consistency } from '../../engine/nutritionSelectors';
import { providerFrom, buildContext } from '../../engine/ai';
import { Panel, SectionHeader, Chip, Empty, useMotion, useToast , Locked } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { entitlements, lockReason } from '../../engine/entitlements';
import { Orb, type OrbState } from '../../components/Orb';
import { RecipeModal } from './Meals';
import { formatMins, todayISO } from '../../lib/util';

interface Turn {
  id: string;
  role: 'you' | 'coach';
  text: string[];
  offers?: Recipe[];
  safety?: boolean;
  source: 'local' | 'ai';
}

export function Coach({ db }: { db: DB }) {
  const n = db.nutrition;
  const ent = entitlements(n);
  const nav = useNav();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [orb, setOrb] = useState<OrbState>('idle');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Recipe | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { rise, spring } = useMotion();
  const provider = providerFrom(db);

  const t = targetsFor(n.profile!);
  const eaten = consumedOn(n);
  const left = remainingOn(n);
  const cons = consistency(n);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    const id = Math.random().toString(36).slice(2);
    setTurns((x) => [...x, { id, role: 'you', text: [text], source: 'local' }]);
    setOrb('processing');
    setBusy(true);

    // The local coach runs FIRST, always. Its safety layer is what stops a
    // question about purging or extreme restriction from being handed to a
    // model — a safety reply is never a fallback, so it never reaches the
    // endpoint below. Do not reorder these two steps.
    /* Safety answers are never gated: a tier that decides whether someone
       gets help is not a pricing decision. Everything else on the free tier
       answers from general knowledge rather than from today's live state. */
    const local = coachReply(text, ent.can('coach') ? n : { ...n, logs: [], water: [], exercise: [], weights: [], plans: [] });
    const isFallback = local.text[0]?.startsWith('I could not map that');

    if (!isFallback || !provider.isConfigured()) {
      setTimeout(() => {
        setTurns((x) => [
          ...x,
          { id: id + 'r', role: 'coach', text: local.text, offers: local.offers?.map((o) => o.recipe), safety: local.safety, source: 'local' },
        ]);
        setOrb(local.safety ? 'alert' : 'responding');
        setBusy(false);
        setTimeout(() => setOrb('idle'), 1500);
      }, 200);
      return;
    }

    try {
      const reply = await provider.ask(text, `${buildContext(db)}\n\nNutrition today: ${eaten.kcal}/${t.kcal} kcal, ${eaten.protein}/${t.protein} g protein.`);
      setTurns((x) => [...x, { id: id + 'r', role: 'coach', text: reply.split('\n').filter(Boolean), source: 'ai' }]);
      setOrb('responding');
    } catch (e) {
      setTurns((x) => [...x, { id: id + 'r', role: 'coach', text: [`The endpoint could not be reached. ${(e as Error).message}`], source: 'local' }]);
      setOrb('alert');
    } finally {
      setBusy(false);
      setTimeout(() => setOrb('idle'), 1500);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Orb state={orb} size={62} />
          <div>
            <div className="label mb-1">Nutrition coach</div>
            <h1 className="display text-[clamp(24px,3.6vw,34px)] leading-none">It already knows your day</h1>
          </div>
        </div>
        {turns.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setTurns([])}>
            <Icon name="RotateCcw" size={14} />
            Clear
          </button>
        )}
      </header>

      {/* --------------------------- what it can see --------------------------- */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Everything below is read live, not typed by me" title="Current state" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {([
            ['Calories left', Math.max(0, left.kcal), 'kcal'],
            ['Protein left', Math.max(0, left.protein), 'g'],
            ['Water', (waterOn(n) / 1000).toFixed(1), 'L'],
            ['Consistency', cons.score, '/100'],
            ['Budget', n.profile!.budgetPerDay, '₹/day'],
          ] as const).map(([l, v, u]) => (
            <div key={l}>
              <div className="label mb-1">{l}</div>
              <div className="num text-[18px] font-semibold leading-none">
                {v}
                <span className="text-[11px] text-[var(--ink-3)] font-normal"> {u}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>{n.profile!.diet}</Chip>
          <Chip>{TRACK_LABEL[n.profile!.track]}</Chip>
          <Chip>{n.profile!.typicalCookMins} min cooking</Chip>
          {trainedOn(n) && <Chip color="var(--good)">trained today</Chip>}
          {n.pantry.length > 0 && <Chip color="var(--info)">{n.pantry.length} things in the kitchen</Chip>}
          {n.profile!.dislikes.length > 0 && <Chip color="var(--warning)">avoids {n.profile!.dislikes.join(', ')}</Chip>}
        </div>
      </Panel>

      {/* ----------------------------- quick actions -------------------------- */}
      {turns.length === 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Ask it something" />
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left row-hover"
                style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
              >
                <Icon name={a.icon} size={15} className="text-[var(--ink-3)] shrink-0" />
                <span className="text-[13px]">{a.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* ------------------------------- transcript --------------------------- */}
      {turns.length > 0 && (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.div key={turn.id} {...rise} transition={spring}>
                {turn.role === 'you' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[42rem] rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px]" style={{ background: 'var(--accent-soft)', border: '1px solid var(--hairline)' }}>
                      {turn.text[0]}
                    </div>
                  </div>
                ) : (
                  <Panel className="p-4 sm:p-5" style={turn.safety ? { borderColor: 'var(--warning)' } : undefined}>
                    <div className="flex items-start gap-3">
                      <Icon
                        name={turn.safety ? 'AlertTriangle' : turn.source === 'ai' ? 'Sparkles' : 'Compass'}
                        size={15}
                        className="mt-0.5 shrink-0"
                        style={{ color: turn.safety ? 'var(--warning)' : 'var(--ink-3)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1.5">
                          {turn.text.map((l, i) => (
                            <p key={i} className="text-[13.5px] leading-relaxed">{l}</p>
                          ))}
                        </div>

                        {turn.offers && turn.offers.length > 0 && (
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {turn.offers.map((r) => (
                              <div key={r.id} className="rounded-xl p-3" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                                <div className="text-[13.5px] font-semibold">
                                  <span aria-hidden className="mr-1.5">{r.emoji}</span>
                                  {r.name}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] num text-[var(--ink-3)]">
                                  <span>{r.kcal} kcal</span>
                                  <span>{r.protein} g P</span>
                                  <span>{formatMins(r.prepMins)}</span>
                                  <span>₹{r.costRupees}</span>
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    className="btn btn-primary !py-1 !text-[11.5px]"
                                    onClick={() => {
                                      nutrition.addLog({
                                        date: todayISO(), slot: r.slots[0], sourceId: r.id, sourceKind: 'recipe',
                                        name: r.name, servings: 1, kcal: r.kcal, protein: r.protein,
                                        carbs: r.carbs, fat: r.fat, fibre: r.fibre,
                                      });
                                      toast({ text: `${r.name} logged`, tone: 'good' });
                                    }}
                                  >
                                    I'll eat this
                                  </button>
                                  <button className="btn btn-ghost !py-1 !text-[11.5px]" onClick={() => setOpen(r)}>
                                    Recipe
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <Chip>{turn.source === 'ai' ? 'via your endpoint' : 'computed from your data'}</Chip>
                        </div>
                      </div>
                    </div>
                  </Panel>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      )}

      {/* --------------------------------- input ------------------------------ */}
      <Panel className="sticky bottom-[4.75rem] lg:bottom-4 p-3 z-20" style={{ boxShadow: 'var(--shadow-2)' }}>
        <div className="flex items-center gap-2">
          <Icon name="Sparkles" size={15} className="text-[var(--ink-3)] ml-1 shrink-0" />
          <input
            className="field !border-none !bg-transparent !px-1"
            placeholder="What should I eat tonight?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            disabled={busy}
          />
          <button className="btn btn-primary shrink-0" onClick={() => send(input)} disabled={!input.trim() || busy} aria-label="Send">
            {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="ArrowRight" size={14} />}
          </button>
        </div>
        {turns.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.slice(0, 5).map((a) => (
              <button key={a.label} className="chip row-hover" onClick={() => send(a.prompt)} disabled={busy}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2.5 px-1 text-[11px] text-[var(--ink-3)]">
          Answers come from your own logs, targets and preferences — no model is involved unless you connect one in Settings. It will not give
          medical advice, and it will say so rather than guessing.
        </p>
      </Panel>

      <RecipeModal recipe={open} db={db} onClose={() => setOpen(null)} />
    </div>
  );
}
