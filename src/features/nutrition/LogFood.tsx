import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DB } from '../../lib/types';
import type { FoodItem, MealSlot, FoodLogEntry } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { searchFoods, parseFoodText, type ParseResult } from '../../engine/foodParser';
import { targetsFor } from '../../engine/calories';
import { consumedOn, remainingOn, SLOT_LABEL, currentSlot, targets} from '../../engine/nutritionSelectors';
import { Panel, SectionHeader, Bar, Chip, Empty, Field, Select, Modal, useMotion, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ProvenanceTag, ProvenanceNote } from './ProvenanceTag';
import { todayISO, cn, formatMins, haptic } from '../../lib/util';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export function LogFood({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const { rise, spring } = useMotion();
  const [tab, setTab] = useState<'search' | 'sentence'>('search');
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState<MealSlot>(currentSlot());
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState(1);
  const [sentence, setSentence] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);

  const t = targets(n)!;
  const eaten = consumedOn(n);
  const left = remainingOn(n);
  const today = n.logs.filter((l) => l.date === todayISO());

  const results = useMemo(() => searchFoods(q, n.customFoods, 24), [q, n.customFoods]);

  const recent = useMemo(() => {
    const seen = new Map<string, FoodLogEntry>();
    for (const l of [...n.logs].reverse()) if (!seen.has(l.name)) seen.set(l.name, l);
    return [...seen.values()].slice(0, 8);
  }, [n.logs]);

  const frequent = useMemo(() => {
    const count = new Map<string, { entry: FoodLogEntry; n: number }>();
    for (const l of n.logs) {
      const cur = count.get(l.name);
      count.set(l.name, { entry: l, n: (cur?.n ?? 0) + 1 });
    }
    return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [n.logs]);

  const add = (f: FoodItem, s: number, sl: MealSlot) => {
    nutrition.addLog({
      date: todayISO(), slot: sl, sourceId: f.id, sourceKind: 'food', name: f.name, servings: s,
      kcal: Math.round(f.kcal * s), protein: Math.round(f.protein * s), carbs: Math.round(f.carbs * s),
      fat: Math.round(f.fat * s), fibre: Math.round(f.fibre * s),
    });
    haptic(8);
    toast({ text: `${f.name} logged — ${Math.round(f.kcal * s)} kcal`, tone: 'good' });
    setPicked(null);
    setServings(1);
  };

  const relog = (e: FoodLogEntry) => {
    nutrition.addLog({ ...e, date: todayISO(), slot });
    toast({ text: `${e.name} logged again`, tone: 'good' });
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {eaten.kcal} of {t.kcal} kcal · {Math.max(0, left.kcal)} remaining
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Log food</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className="btn !py-1.5 !text-[12.5px]"
              style={slot === s ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
            >
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      <Panel className="p-4">
        <Bar value={t.kcal ? (eaten.kcal / t.kcal) * 100 : 0} height={8} color="var(--accent)" label="Calories" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([['Protein', eaten.protein, t.protein], ['Carbs', eaten.carbs, t.carbs], ['Fat', eaten.fat, t.fat], ['Fibre', eaten.fibre, t.fibre]] as const).map(
            ([label, have, target]) => (
              <div key={label}>
                <div className="label mb-1">{label}</div>
                <div className="num text-[15px] font-semibold">
                  {have}
                  <span className="text-[var(--ink-3)] text-[12px] font-normal"> / {target} g</span>
                </div>
              </div>
            ),
          )}
        </div>
      </Panel>

      {/* ------------------------------ quick add ----------------------------- */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="When you know roughly, not exactly" title="Quick add" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[100, 250, 500].map((k) => (
            <button
              key={k}
              className="btn"
              onClick={() => {
                nutrition.addLog({
                  date: todayISO(), slot, sourceKind: 'quick', name: `Quick add — ${k} kcal`, servings: 1,
                  kcal: k, protein: Math.round(k * 0.04), carbs: Math.round(k * 0.12), fat: Math.round(k * 0.04), fibre: 0,
                });
                toast({ text: `${k} kcal added to ${SLOT_LABEL[slot].toLowerCase()}`, tone: 'good' });
              }}
            >
              +{k} kcal
            </button>
          ))}
          <span className="self-center text-[11.5px] text-[var(--ink-3)]">
            Macros are estimated at a typical mixed-meal split. Use search when it matters.
          </span>
        </div>
      </Panel>

      {/* ------------------------------- add food ----------------------------- */}
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="Add something" />
          <div className="inline-flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            {(['search', 'sentence'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold"
                style={tab === k ? { background: 'var(--raised)' } : { color: 'var(--ink-3)' }}
              >
                {k === 'search' ? 'Search' : 'Type a sentence'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'search' ? (
          <div className="mt-4">
            <div className="relative">
              <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
              <input className="field !pl-9" autoFocus placeholder="Search 60+ Indian foods — roti, dal, poha, paneer…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2 max-h-[24rem] overflow-y-auto">
              {results.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setPicked(f);
                    setServings(1);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left row-hover"
                  style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate">{f.name}</span>
                      <ProvenanceTag provenance={f.provenance} />
                    </span>
                    <span className="block text-[11px] text-[var(--ink-3)]">{f.servingLabel} · {f.cuisine}</span>
                  </span>
                  <span className="num text-[11.5px] text-[var(--ink-3)] shrink-0 text-right">
                    {f.kcal} kcal
                    <br />
                    {f.protein} g P
                  </span>
                </button>
              ))}
              {results.length === 0 && <Empty icon="Search" title="Nothing matched" body="Log it as a quick add, or type it as a sentence instead." />}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Chip color="var(--warning)">Rule-based parser, not a language model</Chip>
            </div>
            <textarea
              className="field min-h-[70px] resize-y"
              placeholder="I had two rotis, dal and a bowl of curd"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary" disabled={!sentence.trim()} onClick={() => setParsed(parseFoodText(sentence, n.customFoods))}>
                <Icon name="Sparkles" size={14} />
                Read that
              </button>
              {sentence && (
                <button className="btn btn-ghost" onClick={() => { setSentence(''); setParsed(null); }}>
                  Clear
                </button>
              )}
            </div>
            <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">
              It understands quantities, common Hindi names (roti, dahi, anda, chawal) and meal words. It always shows what it understood and waits
              for you to confirm — it never writes a log on its own reading.
            </p>
          </div>
        )}
      </Panel>

      {/* ------------------------------ recent / usual ------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Recent" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recent.map((e) => (
              <button key={e.id} className="chip row-hover" onClick={() => relog(e)}>
                {e.name} <span className="num text-[var(--ink-3)]">{e.kcal}</span>
              </button>
            ))}
            {recent.length === 0 && <span className="text-[12px] text-[var(--ink-3)]">Nothing logged yet.</span>}
          </div>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Learned from your history" title="What you usually eat" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {frequent.map((f) => (
              <button key={f.entry.id} className="chip row-hover" onClick={() => relog(f.entry)}>
                {f.entry.name} <span className="num text-[var(--ink-3)]">×{f.n}</span>
              </button>
            ))}
            {frequent.length === 0 && <span className="text-[12px] text-[var(--ink-3)]">This fills in after a few days of logging.</span>}
          </div>
        </Panel>
      </div>

      {/* ------------------------------- today's log -------------------------- */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader label={`${today.length} entries`} title="Today's log" />
        <div className="mt-3 flex flex-col gap-4">
          {SLOTS.map((s) => {
            const items = today.filter((l) => l.slot === s);
            if (!items.length) return null;
            const kcal = items.reduce((a, b) => a + b.kcal, 0);
            return (
              <div key={s}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="label">{SLOT_LABEL[s]}</span>
                  <span className="num text-[11.5px] text-[var(--ink-3)]">{kcal} kcal</span>
                </div>
                <AnimatePresence initial={false}>
                  {items.map((l) => (
                    <motion.div key={l.id} layout {...rise} transition={spring} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] truncate">
                          {l.name}
                          {l.servings !== 1 && <span className="text-[var(--ink-3)]"> × {l.servings}</span>}
                        </span>
                        <span className="block text-[11px] text-[var(--ink-3)] num">
                          {l.protein} g P · {l.carbs} g C · {l.fat} g F
                        </span>
                      </span>
                      <span className="num text-[12.5px] shrink-0">{l.kcal}</span>
                      <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => setEditing(l)} aria-label="Edit">
                        <Icon name="Pencil" size={13} />
                      </button>
                      <button
                        className="btn btn-ghost !px-1.5 !py-1"
                        onClick={() => {
                          const snap = l;
                          nutrition.deleteLog(l.id);
                          toast({
                            text: 'Removed',
                            tone: 'info',
                            action: { label: 'Undo', run: () => nutrition.addLog(snap) },
                          });
                        }}
                        aria-label="Delete"
                      >
                        <Icon name="Trash2" size={13} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            );
          })}
          {today.length === 0 && <Empty icon="Inbox" title="Nothing logged today" body="Search above, or describe your meal in a sentence." />}
        </div>
      </Panel>

      {/* ---------------------------- serving modal --------------------------- */}
      <Modal
        open={!!picked}
        onClose={() => setPicked(null)}
        title={picked?.name ?? ''}
        footer={
          <>
            <button className="btn" onClick={() => setPicked(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => picked && add(picked, servings, slot)}>
              Add {picked ? Math.round(picked.kcal * servings) : 0} kcal
            </button>
          </>
        }
      >
        {picked && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['Calories', Math.round(picked.kcal * servings), 'kcal'], ['Protein', Math.round(picked.protein * servings), 'g'], ['Carbs', Math.round(picked.carbs * servings), 'g'], ['Fat', Math.round(picked.fat * servings), 'g']] as const).map(([l, v, u]) => (
                <div key={l}>
                  <div className="label mb-1">{l}</div>
                  <div className="num text-[18px] font-semibold">{v}<span className="text-[11px] text-[var(--ink-3)] font-normal"> {u}</span></div>
                </div>
              ))}
            </div>
            <Field label={`Servings — one is ${picked.servingLabel}`} as="div">
              <div className="flex items-center gap-2">
                <button className="btn !px-2.5" onClick={() => setServings((s) => Math.max(0.25, Math.round((s - 0.25) * 100) / 100))} aria-label="Fewer">
                  <Icon name="Minus" size={14} />
                </button>
                <input className="field !w-24 text-center num" type="number" step={0.25} min={0.25} value={servings} onChange={(e) => setServings(Math.max(0.25, Number(e.target.value)))} />
                <button className="btn !px-2.5" onClick={() => setServings((s) => Math.round((s + 0.25) * 100) / 100)} aria-label="More">
                  <Icon name="Plus" size={14} />
                </button>
                <div className="flex gap-1 ml-2">
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <button key={s} className="chip row-hover" onClick={() => setServings(s)}>{s}×</button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Meal" as="div">
              <Select value={slot} onChange={(v) => setSlot(v as MealSlot)} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
            </Field>
            <ProvenanceNote food={picked} />
          </div>
        )}
      </Modal>

      {/* ------------------------------ parse modal --------------------------- */}
      <Modal
        open={!!parsed}
        onClose={() => setParsed(null)}
        title="Here is what I understood"
        footer={
          <>
            <button className="btn" onClick={() => setParsed(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!parsed?.items.length}
              onClick={() => {
                if (!parsed) return;
                nutrition.addLogs(
                  parsed.items.map((i) => ({
                    date: todayISO(), slot: parsed.slot, sourceId: i.food.id, sourceKind: 'food' as const,
                    name: i.food.name, servings: i.servings,
                    kcal: Math.round(i.food.kcal * i.servings), protein: Math.round(i.food.protein * i.servings),
                    carbs: Math.round(i.food.carbs * i.servings), fat: Math.round(i.food.fat * i.servings),
                    fibre: Math.round(i.food.fibre * i.servings),
                  })),
                );
                toast({ text: `${parsed.items.length} items logged — ${parsed.totals.kcal} kcal`, tone: 'good' });
                setParsed(null);
                setSentence('');
              }}
            >
              Add {parsed?.totals.kcal ?? 0} kcal to {parsed ? SLOT_LABEL[parsed.slot].toLowerCase() : ''}
            </button>
          </>
        }
      >
        {parsed && (
          <div className="flex flex-col gap-3">
            {parsed.items.map((i, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                <Icon name={i.confident ? 'CheckCircle2' : 'AlertTriangle'} size={15} style={{ color: i.confident ? 'var(--good)' : 'var(--warning)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">
                    {i.food.name} <span className="text-[var(--ink-3)]">× {i.servings}</span>
                  </span>
                  <span className="block text-[11px] text-[var(--ink-3)]">read from “{i.matchedText}”</span>
                </span>
                <span className="num text-[12px] shrink-0">{Math.round(i.food.kcal * i.servings)} kcal</span>
              </div>
            ))}
            {parsed.unmatched.length > 0 && (
              <div className="rounded-lg p-2.5 text-[12px]" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
                I could not place: {parsed.unmatched.join(', ')}. Those are not included — add them by search if they matter.
              </div>
            )}
            {parsed.items.length === 0 && <Empty icon="Search" title="I could not read any food in that" body="Try naming the dishes plainly: “2 rotis, dal, curd”." />}
            {parsed.items.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] num pt-1">
                <span>{parsed.totals.kcal} kcal</span>
                <span>{parsed.totals.protein} g protein</span>
                <span>{parsed.totals.carbs} g carbs</span>
                <span>{parsed.totals.fat} g fat</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------ edit modal ---------------------------- */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit entry"
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (editing) nutrition.updateLog(editing.id, editing);
                setEditing(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input className="field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Meal" as="div">
              <Select value={editing.slot} onChange={(v) => setEditing({ ...editing, slot: v as MealSlot })} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
            </Field>
            {(['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const).map((k) => (
              <Field key={k} label={k === 'kcal' ? 'Calories' : k[0].toUpperCase() + k.slice(1)}>
                <input className="field" type="number" min={0} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: Math.max(0, Number(e.target.value)) })} />
              </Field>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
