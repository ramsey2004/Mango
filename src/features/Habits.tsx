import { useEffect, useMemo, useState } from 'react';
import type { DB, Habit } from '../lib/types';
import { actions } from '../store/store';
import { Panel, SectionHeader, Empty, Field, Select, Modal, ConfirmDialog, Menu, Bar } from '../components/ui';
import { Icon, ICON_NAMES } from '../components/Icon';
import { Heatmap } from '../components/Charts';
import { todayISO, toISODate, addDays, pluralise, startOfWeek, cn } from '../lib/util';

function streakFor(db: DB, habit: Habit): { current: number; best: number; rate30: number } {
  const dates = new Set(db.habitEntries.filter((e) => e.habitId === habit.id).map((e) => e.date));
  let current = 0;
  for (let i = 0; i < 400; i++) {
    const d = toISODate(addDays(new Date(), -i));
    if (dates.has(d)) current++;
    else if (i > 0 || !dates.has(todayISO())) break;
  }
  let best = 0;
  let run = 0;
  for (let i = 400; i >= 0; i--) {
    const d = toISODate(addDays(new Date(), -i));
    if (dates.has(d)) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  const last30 = Array.from({ length: 30 }, (_, i) => toISODate(addDays(new Date(), -i)));
  const rate30 = Math.round((last30.filter((d) => dates.has(d)).length / 30) * 100);
  return { current, best, rate30 };
}

export function Habits({ db }: { db: DB }) {
  const [editing, setEditing] = useState<Habit | null>(null);
  const habits = db.habits.filter((h) => !h.archived);
  const today = todayISO();

  const weekDays = useMemo(() => {
    const s = startOfWeek(new Date(), db.settings.firstDayOfWeek);
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(s, i)));
  }, [db.settings.firstDayOfWeek]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">{pluralise(habits.length, 'habit')} · kept separate from your task list on purpose</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Habits</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(actions.addHabit({}))}>
          <Icon name="Plus" size={14} />
          Habit
        </button>
      </header>

      {habits.length === 0 ? (
        <Panel className="p-2">
          <Empty
            icon="Repeat"
            title="No habits yet"
            body="Habits are things you repeat, not things you finish. They never appear in Today or the priority engine."
            action={
              <button className="btn btn-primary" onClick={() => setEditing(actions.addHabit({}))}>
                Add a habit
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {habits.map((h) => {
            const s = streakFor(db, h);
            const days: Record<string, number> = {};
            for (const e of db.habitEntries.filter((x) => x.habitId === h.id)) days[e.date] = e.count;
            const area = db.areas.find((a) => a.id === h.areaId);
            const weekDone = weekDays.filter((d) => days[d]).length;

            return (
              <Panel key={h.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className="grid h-9 w-9 place-items-center rounded-lg shrink-0"
                      style={{ background: `${h.color}1f`, border: `1px solid ${h.color}44` }}
                    >
                      <Icon name={h.icon} size={17} style={{ color: h.color }} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold leading-snug">{h.name}</h3>
                      <div className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">
                        {h.cadence === 'daily' ? 'Every day' : h.cadence === 'weekly' ? `${h.target}× a week` : `${h.target}× a month`}
                        {area && ` · ${area.name}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-center">
                      <div className="num text-[20px] font-semibold leading-none" style={{ color: s.current ? h.color : 'var(--ink-3)' }}>
                        {s.current}
                      </div>
                      <div className="label mt-1">streak</div>
                    </div>
                    <div className="text-center">
                      <div className="num text-[20px] font-semibold leading-none">{s.best}</div>
                      <div className="label mt-1">best</div>
                    </div>
                    <div className="text-center">
                      <div className="num text-[20px] font-semibold leading-none">{s.rate30}%</div>
                      <div className="label mt-1">30 days</div>
                    </div>
                    <Menu
                      trigger={<Icon name="MoreHorizontal" size={15} />}
                      items={[
                        { label: 'Edit', icon: 'Pencil', run: () => setEditing(h) },
                        { label: 'Archive', icon: 'Archive', run: () => actions.updateHabit(h.id, { archived: true }) },
                        { label: 'Delete', icon: 'Trash2', danger: true, run: () => actions.deleteHabit(h.id) },
                      ]}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {weekDays.map((d) => {
                    const on = !!days[d];
                    const isToday = d === today;
                    return (
                      <button
                        key={d}
                        onClick={() => actions.toggleHabitDay(h.id, d)}
                        className="flex flex-col items-center gap-1.5 rounded-lg px-2.5 py-2 row-hover"
                        style={{ border: `1px solid ${isToday ? 'var(--hairline-strong)' : 'transparent'}` }}
                        aria-pressed={on}
                      >
                        <span className="label">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d).getDay()]}</span>
                        <span
                          className="grid h-6 w-6 place-items-center rounded-md"
                          style={{ background: on ? h.color : 'var(--sunken)', border: `1px solid ${on ? h.color : 'var(--hairline)'}` }}
                        >
                          {on && <Icon name="Check" size={13} strokeWidth={3} style={{ color: 'var(--ground)' }} />}
                        </span>
                      </button>
                    );
                  })}
                  {h.cadence === 'weekly' && (
                    <div className="ml-2 min-w-[8rem] flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="label">This week</span>
                        <span className="num text-[11.5px] text-[var(--ink-3)]">
                          {weekDone}/{h.target}
                        </span>
                      </div>
                      <Bar value={(weekDone / Math.max(1, h.target)) * 100} color={h.color} height={6} className="mt-1.5" label={h.name} />
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="label mb-2">Last 18 weeks — click any square to change it</div>
                  <Heatmap days={days} color={h.color} onToggle={(d) => actions.toggleHabitDay(h.id, d)} />
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <HabitEditor db={db} habit={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function HabitEditor({ db, habit, open, onClose }: { db: DB; habit: Habit | null; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Habit | null>(habit);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft(habit), [habit]);
  if (!draft) return null;
  const patch = (p: Partial<Habit>) => setDraft({ ...draft, ...p });

  const palette = ['#d06200', '#5784d7', '#029f6d', '#a75ddd', '#ad7c04', '#08999e', '#f2555a', '#98a1ae'];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Edit habit"
        footer={
          <>
            <button className="btn btn-danger mr-auto" onClick={() => setConfirming(true)}>
              Delete
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                actions.updateHabit(draft.id, draft);
                onClose();
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Habit" className="sm:col-span-2">
            <input className="field" autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Cadence">
            <Select
              value={draft.cadence}
              onChange={(v) => patch({ cadence: v as Habit['cadence'] })}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          </Field>
          <Field label="Target per period">
            <input className="field" type="number" min={1} value={draft.target} onChange={(e) => patch({ target: Math.max(1, Number(e.target.value)) })} />
          </Field>
          <Field label="Area" className="sm:col-span-2">
            <Select
              value={draft.areaId ?? ''}
              onChange={(v) => patch({ areaId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </Field>
          <Field label="Colour" className="sm:col-span-2" as="div">
            <div className="flex flex-wrap gap-2">
              {palette.map((c) => (
                <button
                  key={c}
                  onClick={() => patch({ color: c })}
                  className="h-7 w-7 rounded-lg"
                  aria-label={c}
                  style={{ background: c, outline: draft.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}
                />
              ))}
            </div>
          </Field>
          <Field label="Icon" className="sm:col-span-2" as="div">
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              {ICON_NAMES.slice(0, 48).map((n) => (
                <button
                  key={n}
                  onClick={() => patch({ icon: n })}
                  className="grid h-8 w-8 place-items-center rounded-lg"
                  style={{
                    background: draft.icon === n ? 'var(--accent-soft)' : 'var(--sunken)',
                    border: `1px solid ${draft.icon === n ? 'var(--accent)' : 'var(--hairline)'}`,
                  }}
                  aria-label={n}
                >
                  <Icon name={n} size={15} />
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Delete this habit?"
        body="Its entire history is deleted with it."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteHabit(draft.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
