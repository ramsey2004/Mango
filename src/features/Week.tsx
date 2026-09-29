import { useMemo, useState } from 'react';
import type { DB, Task } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { Panel, SectionHeader, Empty, useToast, Bar } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import { startOfWeek, addDays, toISODate, dowShort, todayISO, formatMins, cn, pluralise } from '../lib/util';
import { weekStats, weekNarrative } from '../engine/jarvis';

export function Week({ db }: { db: DB }) {
  const nav = useNav();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const start = startOfWeek(addDays(new Date(), offset * 7), db.settings.firstDayOfWeek);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayISO();

  const open = db.tasks.filter((t) => !t.archived && !t.parentId);

  const forDay = (iso: string) =>
    open.filter((t) => (t.scheduledFor ?? t.due) === iso).sort((a, b) => a.order - b.order);

  const unscheduled = open.filter((t) => !t.scheduledFor && !t.due && t.status !== 'done');

  const drop = (iso: string) => {
    if (!dragId) return;
    const t = db.tasks.find((x) => x.id === dragId);
    actions.scheduleTask(dragId, iso);
    setDragId(null);
    setOverDay(null);
    if (t) toast({ text: `“${t.title}” moved to ${iso}`, tone: 'info' });
  };

  const stats = useMemo(() => weekStats(db, offset === 0 ? 0 : -offset), [db, offset]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} —{' '}
            {addDays(start, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">
            {offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `Week ${offset > 0 ? '+' : ''}${offset}`}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
            <Icon name="ChevronLeft" size={15} />
          </button>
          <button className="btn" onClick={() => setOffset(0)}>
            This week
          </button>
          <button className="btn" onClick={() => setOffset((o) => o + 1)} aria-label="Next week">
            <Icon name="ChevronRight" size={15} />
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const iso = toISODate(d);
          const list = forDay(iso);
          const isToday = iso === today;
          const mins = list.filter((t) => t.status !== 'done').reduce((s, t) => s + (t.effortMins || 0), 0);
          const done = list.filter((t) => t.status === 'done').length;
          return (
            <Panel
              key={iso}
              className={cn('flex flex-col p-3 min-h-[11rem] transition-colors')}
              style={{
                borderColor: overDay === iso ? 'var(--accent)' : isToday ? 'var(--hairline-strong)' : 'var(--hairline)',
                background: isToday ? 'var(--raised)' : 'var(--surface)',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverDay(iso);
              }}
              onDragLeave={() => setOverDay((x) => (x === iso ? null : x))}
              onDrop={() => drop(iso)}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="label" style={isToday ? { color: 'var(--accent)' } : undefined}>
                    {dowShort(d.getDay())}
                  </div>
                  <div className="num text-[18px] font-semibold leading-none mt-1">{d.getDate()}</div>
                </div>
                <div className="text-right">
                  {mins > 0 && <div className="num text-[11px] text-[var(--ink-3)]">{formatMins(mins)}</div>}
                  {done > 0 && <div className="num text-[11px]" style={{ color: 'var(--good)' }}>{done} done</div>}
                </div>
              </div>

              <div className="mt-2.5 flex flex-col gap-1 flex-1">
                {list.length === 0 && (
                  <div className="flex-1 grid place-items-center text-[11.5px] text-[var(--ink-3)] py-4">
                    {overDay === iso ? 'Drop here' : '—'}
                  </div>
                )}
                {list.map((t) => (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => nav.openTask(t)}
                    className={cn(
                      'w-full rounded-lg px-2 py-1.5 text-left text-[12px] leading-snug row-hover cursor-grab active:cursor-grabbing',
                      t.status === 'done' && 'line-through text-[var(--ink-3)]',
                    )}
                    style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
                  >
                    <span className="flex items-start gap-1.5">
                      <span
                        className="mt-[5px] h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: db.priorities.find((p) => p.id === t.priorityId)?.color ?? 'var(--ink-3)' }}
                      />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    </span>
                  </button>
                ))}
              </div>

              <button
                className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] text-[var(--ink-3)] row-hover"
                onClick={() => {
                  const t = actions.addTask({ title: 'New task', scheduledFor: iso, due: iso });
                  nav.openTask(t);
                }}
              >
                <Icon name="Plus" size={12} />
                Add
              </button>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <SectionHeader
            label="Not on the calendar"
            title={`Unscheduled — ${unscheduled.length}`}
            right={<span className="text-[11.5px] text-[var(--ink-3)] hidden sm:block">Drag onto a day</span>}
          />
          <div className="mt-2 -mx-2.5 max-h-[22rem] overflow-y-auto">
            {unscheduled.length ? (
              unscheduled.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  db={db}
                  compact
                  onOpen={nav.openTask}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                />
              ))
            ) : (
              <Empty icon="CheckCircle2" title="Everything has a day" />
            )}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label={`${stats.from} → ${stats.to}`} title="Week in review" />
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <div className="label mb-1">Completed</div>
              <div className="num text-[22px] font-semibold leading-none">{stats.completed}</div>
            </div>
            <div>
              <div className="label mb-1">Effort</div>
              <div className="num text-[22px] font-semibold leading-none">{formatMins(stats.completedMins)}</div>
            </div>
            <div>
              <div className="label mb-1">Habits</div>
              <div className="num text-[22px] font-semibold leading-none">{stats.habitRate}%</div>
            </div>
          </div>
          {stats.areaSplit.length > 0 && (
            <div className="mt-4">
              <div className="label mb-2">Where the effort went</div>
              <div className="flex flex-col gap-2">
                {stats.areaSplit.slice(0, 5).map((a) => (
                  <div key={a.areaId} className="grid items-center gap-3" style={{ gridTemplateColumns: '7rem 1fr auto' }}>
                    <span className="text-[12px] truncate">{a.name}</span>
                    <Bar value={(a.mins / Math.max(1, stats.areaSplit[0].mins)) * 100} color={a.color} height={7} label={a.name} />
                    <span className="num text-[11.5px] text-[var(--ink-3)]">{formatMins(a.mins)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ul className="mt-4 flex flex-col gap-1.5">
            {weekNarrative(db, stats).map((line) => (
              <li key={line} className="text-[12.5px] text-[var(--ink-2)] flex gap-2">
                <span className="text-[var(--ink-3)]">•</span>
                {line}
              </li>
            ))}
          </ul>
          <button className="btn mt-4" onClick={() => nav.go('review')}>
            Write the weekly review
          </button>
        </Panel>
      </div>
    </div>
  );
}
