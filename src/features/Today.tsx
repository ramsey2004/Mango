import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DB, Task } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { rankTasks } from '../engine/priority';
import { planDay } from '../engine/planner';
import { Panel, SectionHeader, Bar, Empty, useMotion, useToast, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import { todayISO, formatMins, pluralise, cn, toISODate, addDays } from '../lib/util';

export function Today({ db }: { db: DB }) {
  const nav = useNav();
  const toast = useToast();
  const today = todayISO();
  const [mode, setMode] = useState<'list' | 'plan'>('list');
  const { rise, spring } = useMotion();

  const open = db.tasks.filter((t) => !t.archived && !t.parentId && t.status !== 'done');
  const scheduled = open.filter((t) => t.scheduledFor === today || t.due === today || (t.due && t.due < today));
  const doneToday = db.tasks.filter((t) => t.completedAt?.slice(0, 10) === today);

  const ranked = useMemo(() => rankTasks(db, scheduled), [db, scheduled]);
  const levels = [...db.priorities].sort((a, b) => a.rank - b.rank);
  const grouped = levels
    .map((lvl) => ({ lvl, items: ranked.filter((s) => s.task.priorityId === lvl.id) }))
    .filter((g) => g.items.length);

  const totalMins = scheduled.reduce((s, t) => s + (t.effortMins || 0), 0);
  const doneMins = doneToday.reduce((s, t) => s + (t.effortMins || 0), 0);
  const completion = scheduled.length + doneToday.length > 0
    ? Math.round((doneToday.length / (scheduled.length + doneToday.length)) * 100)
    : 0;

  const plan = useMemo(() => planDay(db), [db]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Today</h1>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'list', label: 'List', icon: 'List' },
              { value: 'plan', label: 'Plan the day', icon: 'Clock' },
            ]}
          />
          <button className="btn btn-primary" onClick={nav.openQuickAdd}>
            <Icon name="Plus" size={14} />
            Task
          </button>
        </div>
      </header>

      {/* progress strip */}
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="min-w-[8rem]">
            <div className="label mb-1.5">Completed</div>
            <div className="num text-[24px] font-semibold leading-none">
              {doneToday.length}
              <span className="text-[var(--ink-3)] text-[15px]"> / {doneToday.length + scheduled.length}</span>
            </div>
          </div>
          <div className="min-w-[8rem]">
            <div className="label mb-1.5">Remaining effort</div>
            <div className="num text-[24px] font-semibold leading-none">{formatMins(totalMins)}</div>
          </div>
          <div className="min-w-[8rem]">
            <div className="label mb-1.5">Logged today</div>
            <div className="num text-[24px] font-semibold leading-none">{formatMins(doneMins)}</div>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <div className="flex items-baseline justify-between">
              <div className="label mb-1.5">Progress</div>
              <div className="num text-[12px] text-[var(--ink-2)]">{completion}%</div>
            </div>
            <Bar value={completion} height={8} color="var(--good)" label="Day completion" />
          </div>
        </div>
      </Panel>

      {mode === 'plan' ? (
        <PlanView db={db} />
      ) : (
        <>
          {grouped.length === 0 && doneToday.length === 0 && (
            <Panel className="p-2">
              <Empty
                icon="Inbox"
                title="Nothing planned for today"
                body="Pull work forward from the week, or add something new."
                action={
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => nav.go('week')}>
                      Open the week
                    </button>
                    <button className="btn btn-primary" onClick={nav.openQuickAdd}>
                      Add a task
                    </button>
                  </div>
                }
              />
            </Panel>
          )}

          {grouped.map(({ lvl, items }) => (
            <Panel key={lvl.id} className="p-4 sm:p-5">
              <SectionHeader
                title={
                  <span className="flex items-center gap-2">
                    <span aria-hidden style={{ color: lvl.color }}>
                      {lvl.glyph}
                    </span>
                    {lvl.name}
                  </span>
                }
                right={<span className="num text-[12px] text-[var(--ink-3)]">{items.length}</span>}
              />
              <div className="mt-2 -mx-2.5">
                <AnimatePresence initial={false}>
                  {items.map((s) => (
                    <motion.div key={s.task.id} layout {...rise} transition={spring}>
                      <TaskRow task={s.task} db={db} onOpen={nav.openTask} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </Panel>
          ))}

          {doneToday.length > 0 && (
            <Panel className="p-4 sm:p-5">
              <SectionHeader
                label="Finished"
                title={`${pluralise(doneToday.length, 'task')} done today`}
                right={
                  <button
                    className="btn btn-ghost !py-1 !text-[12px]"
                    onClick={() => {
                      doneToday.forEach((t) => actions.toggleTask(t.id));
                      toast({ text: 'All reopened', tone: 'info' });
                    }}
                  >
                    Reopen all
                  </button>
                }
              />
              <div className="mt-2 -mx-2.5 opacity-70">
                {doneToday.map((t) => (
                  <TaskRow key={t.id} task={t} db={db} compact onOpen={nav.openTask} />
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function PlanView({ db }: { db: DB }) {
  const nav = useNav();
  const toast = useToast();
  const [start, setStart] = useState(9 * 60);
  const [end, setEnd] = useState(21 * 60);
  const plan = useMemo(() => planDay(db, { startMin: start, endMin: end }), [db, start, end]);

  const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader
        label="Proposed shape for the day"
        title="Plan"
        right={
          <div className="flex items-center gap-2">
            <input
              className="field !w-[6.5rem] !py-1.5"
              type="time"
              value={toTime(start)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                setStart(h * 60 + m);
              }}
              aria-label="Day starts"
            />
            <span className="text-[var(--ink-3)]">→</span>
            <input
              className="field !w-[6.5rem] !py-1.5"
              type="time"
              value={toTime(end)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                setEnd(h * 60 + m);
              }}
              aria-label="Day ends"
            />
          </div>
        }
      />

      <p className="mt-3 text-[12.5px] text-[var(--ink-2)]">
        {plan.blocks.length
          ? `${formatMins(plan.scheduledMins)} of work inside a ${formatMins(plan.availableMins)} window. Nothing is scheduled past your end time — that is the point.`
          : 'Nothing is due or scheduled for today, so there is nothing to lay out.'}
      </p>

      {plan.blocks.length > 0 && (
        <ol className="mt-4 flex flex-col">
          {plan.blocks.map((b) => {
            const task = b.taskId ? db.tasks.find((t) => t.id === b.taskId) : undefined;
            const area = task ? db.areas.find((a) => a.id === task.areaId) : undefined;
            return (
              <li
                key={b.id}
                className={cn('flex items-start gap-4 border-l-2 py-2.5 pl-4', b.kind === 'break' && 'opacity-60')}
                style={{ borderColor: b.kind === 'break' ? 'var(--hairline)' : area?.color ?? 'var(--accent)' }}
              >
                <span className="num text-[12px] text-[var(--ink-3)] w-[7.5rem] shrink-0 pt-[2px]">{b.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">{b.title}</span>
                  {task && (
                    <span className="mt-0.5 block text-[11.5px] text-[var(--ink-3)]">
                      {[area?.name, db.projects.find((p) => p.id === task.projectId)?.name, formatMins(task.effortMins)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                {task && (
                  <span className="flex gap-1.5 shrink-0">
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.startFocus(task.id)}>
                      Start
                    </button>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.openTask(task)}>
                      Edit
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {plan.leftOut.length > 0 && (
        <div className="mt-5 rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
          <div className="label mb-2">Did not fit — {plan.leftOut.length}</div>
          <ul className="flex flex-col gap-1.5">
            {plan.leftOut.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="truncate">{t.title}</span>
                <button
                  className="btn btn-ghost !py-0.5 !text-[11.5px] shrink-0"
                  onClick={() => {
                    actions.scheduleTask(t.id, toISODate(addDays(new Date(), 1)));
                    toast({ text: `“${t.title}” moved to tomorrow`, tone: 'info' });
                  }}
                >
                  Move to tomorrow
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
