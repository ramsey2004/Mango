import { useMemo, useState } from 'react';
import type { DB } from '../lib/types';
import { useNav } from '../store/nav';
import { actions } from '../store/store';
import { Panel, SectionHeader, Segmented, Empty, Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import {
  toISODate, addDays, addMonths, startOfWeek, dowShort, monthName, todayISO, cn, daysUntil, relativeDay, fromISODate,
} from '../lib/util';

type Scale = 'month' | 'quarter' | 'year';

export function CalendarView({ db }: { db: DB }) {
  const nav = useNav();
  const [scale, setScale] = useState<Scale>('month');
  const [cursor, setCursor] = useState(new Date());

  const step = (dir: -1 | 1) => {
    const n = scale === 'month' ? 1 : scale === 'quarter' ? 3 : 12;
    setCursor(addMonths(cursor, dir * n));
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">Long view</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">
            {scale === 'year'
              ? cursor.getFullYear()
              : `${monthName(cursor.getMonth())} ${cursor.getFullYear()}`}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={scale}
            onChange={setScale}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'year', label: 'Year' },
            ]}
          />
          <div className="flex items-center gap-1.5">
            <button className="btn" onClick={() => step(-1)} aria-label="Previous">
              <Icon name="ChevronLeft" size={15} />
            </button>
            <button className="btn" onClick={() => setCursor(new Date())}>
              Today
            </button>
            <button className="btn" onClick={() => step(1)} aria-label="Next">
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>
        </div>
      </header>

      {scale === 'month' && <MonthGrid db={db} cursor={cursor} />}
      {scale === 'quarter' && <QuarterView db={db} cursor={cursor} />}
      {scale === 'year' && <YearView db={db} cursor={cursor} />}
    </div>
  );
}

function itemsOn(db: DB, iso: string) {
  const tasks = db.tasks.filter((t) => !t.archived && (t.due === iso || t.scheduledFor === iso));
  const milestones = db.milestones.filter((m) => m.due === iso);
  const goals = db.goals.filter((g) => !g.archived && g.deadline === iso);
  const projects = db.projects.filter((p) => !p.archived && p.deadline === iso);
  const apps = db.applications.filter((a) => !a.archived && a.deadline === iso);
  return { tasks, milestones, goals, projects, apps, count: tasks.length + milestones.length + goals.length + projects.length + apps.length };
}

function MonthGrid({ db, cursor }: { db: DB; cursor: Date }) {
  const nav = useNav();
  const [selected, setSelected] = useState<string>(todayISO());
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first, db.settings.firstDayOfWeek);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = todayISO();
  const sel = itemsOn(db, selected);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <Panel className="p-3 sm:p-4 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 mb-1.5" style={{ minWidth: '30rem' }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="label text-center">
              {dowShort((i + db.settings.firstDayOfWeek) % 7)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" style={{ minWidth: '30rem' }}>
          {cells.map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const it = itemsOn(db, iso);
            const isToday = iso === today;
            const isSel = iso === selected;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={cn('flex flex-col items-start gap-1 rounded-lg p-1.5 min-h-[4.6rem] text-left transition-colors')}
                style={{
                  background: isSel ? 'var(--accent-soft)' : isToday ? 'var(--raised)' : 'transparent',
                  border: `1px solid ${isSel ? 'var(--accent)' : isToday ? 'var(--hairline-strong)' : 'var(--hairline)'}`,
                  opacity: inMonth ? 1 : 0.38,
                }}
              >
                <span
                  className="num text-[11.5px] font-semibold"
                  style={isToday ? { color: 'var(--accent)' } : undefined}
                >
                  {d.getDate()}
                </span>
                <span className="flex flex-wrap gap-[3px]">
                  {it.tasks.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: t.status === 'done' ? 'var(--ink-3)' : db.priorities.find((p) => p.id === t.priorityId)?.color,
                      }}
                    />
                  ))}
                  {it.goals.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cat-4)' }} />}
                  {it.apps.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cat-6)' }} />}
                  {it.count > 5 && <span className="num text-[9px] text-[var(--ink-3)]">+{it.count - 5}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--critical)' }} /> task deadline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--cat-4)' }} /> goal deadline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--cat-6)' }} /> application closes
          </span>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader
          label={relativeDay(selected)}
          title={fromISODate(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          right={
            <button
              className="btn btn-ghost !px-1.5 !py-1"
              onClick={() => {
                const t = actions.addTask({ title: 'New task', due: selected, scheduledFor: selected });
                nav.openTask(t);
              }}
              aria-label="Add on this day"
            >
              <Icon name="Plus" size={15} />
            </button>
          }
        />
        <div className="mt-3 flex flex-col gap-3">
          {sel.goals.map((g) => (
            <button key={g.id} className="text-left rounded-lg p-2 -mx-2 row-hover" onClick={() => nav.go('goals', g.id)}>
              <Chip color="var(--cat-4)">Goal deadline</Chip>
              <div className="mt-1 text-[13px]">{g.name}</div>
            </button>
          ))}
          {sel.projects.map((p) => (
            <button key={p.id} className="text-left rounded-lg p-2 -mx-2 row-hover" onClick={() => nav.go('projects', p.id)}>
              <Chip color="var(--cat-5)">Project deadline</Chip>
              <div className="mt-1 text-[13px]">{p.name}</div>
            </button>
          ))}
          {sel.milestones.map((m) => (
            <div key={m.id} className="rounded-lg p-2 -mx-2">
              <Chip color="var(--cat-2)">Milestone</Chip>
              <div className="mt-1 text-[13px]">{m.name}</div>
            </div>
          ))}
          {sel.apps.map((a) => (
            <button key={a.id} className="text-left rounded-lg p-2 -mx-2 row-hover" onClick={() => nav.go('applications', a.id)}>
              <Chip color="var(--cat-6)">Application closes</Chip>
              <div className="mt-1 text-[13px]">
                {a.org} — {a.role}
              </div>
            </button>
          ))}
          {sel.tasks.length > 0 && (
            <div className="-mx-2.5">
              {sel.tasks.map((t) => (
                <TaskRow key={t.id} task={t} db={db} compact onOpen={nav.openTask} />
              ))}
            </div>
          )}
          {sel.count === 0 && <Empty icon="CalendarDays" title="Nothing on this day" />}
        </div>
      </Panel>
    </div>
  );
}

function QuarterView({ db, cursor }: { db: DB; cursor: Date }) {
  const nav = useNav();
  const qStart = new Date(cursor.getFullYear(), Math.floor(cursor.getMonth() / 3) * 3, 1);
  const months = [0, 1, 2].map((i) => addMonths(qStart, i));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {months.map((m) => {
        const from = toISODate(new Date(m.getFullYear(), m.getMonth(), 1));
        const to = toISODate(new Date(m.getFullYear(), m.getMonth() + 1, 0));
        const goals = db.goals.filter((g) => !g.archived && g.deadline && g.deadline >= from && g.deadline <= to);
        const projects = db.projects.filter((p) => !p.archived && p.deadline && p.deadline >= from && p.deadline <= to);
        const milestones = db.milestones.filter((x) => x.due && x.due >= from && x.due <= to);
        const tasks = db.tasks.filter((t) => !t.archived && t.due && t.due >= from && t.due <= to && t.status !== 'done');
        return (
          <Panel key={from} className="p-4">
            <SectionHeader label={`${tasks.length} open tasks`} title={monthName(m.getMonth())} />
            <div className="mt-3 flex flex-col gap-2.5">
              {goals.map((g) => (
                <button key={g.id} className="flex items-center gap-2 text-left" onClick={() => nav.go('goals', g.id)}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--cat-4)' }} />
                  <span className="text-[12.5px] truncate">{g.name}</span>
                </button>
              ))}
              {projects.map((p) => (
                <button key={p.id} className="flex items-center gap-2 text-left" onClick={() => nav.go('projects', p.id)}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--cat-5)' }} />
                  <span className="text-[12.5px] truncate">{p.name}</span>
                </button>
              ))}
              {milestones.map((x) => (
                <div key={x.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--cat-2)' }} />
                  <span className="text-[12.5px] truncate text-[var(--ink-2)]">{x.name}</span>
                </div>
              ))}
              {goals.length + projects.length + milestones.length === 0 && (
                <div className="text-[12px] text-[var(--ink-3)] py-2">No deadlines this month.</div>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function YearView({ db, cursor }: { db: DB; cursor: Date }) {
  const nav = useNav();
  const year = cursor.getFullYear();
  const rows = useMemo(() => {
    const goals = db.goals.filter((g) => !g.archived && g.deadline?.startsWith(String(year)));
    return goals.map((g) => {
      const startM = new Date(g.createdAt).getFullYear() === year ? new Date(g.createdAt).getMonth() : 0;
      const endM = g.deadline ? fromISODate(g.deadline).getMonth() : 11;
      return { g, startM, endM: Math.max(startM, endM) };
    });
  }, [db.goals, year]);

  return (
    <Panel className="p-4 overflow-x-auto">
      <div style={{ minWidth: '44rem' }}>
        <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: '12rem repeat(12, 1fr)' }}>
          <div />
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="label text-center">
              {monthName(i).slice(0, 3)}
            </div>
          ))}
        </div>
        {rows.length === 0 && <Empty icon="Target" title={`No goals with a ${year} deadline`} body="Give a goal a deadline and it appears on this timeline." />}
        <div className="flex flex-col gap-1.5">
          {rows.map(({ g, startM, endM }) => {
            const area = db.areas.find((a) => a.id === g.areaId);
            return (
              <div key={g.id} className="grid items-center gap-1" style={{ gridTemplateColumns: '12rem repeat(12, 1fr)' }}>
                <button className="truncate text-left text-[12.5px] pr-2 hover:text-[var(--accent)]" onClick={() => nav.go('goals', g.id)}>
                  {g.name}
                </button>
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="h-6 rounded-[4px]" style={{ background: i >= startM && i <= endM ? area?.color ?? 'var(--accent)' : 'var(--sunken)', opacity: i >= startM && i <= endM ? 0.85 : 1 }} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------- deadlines -------------------------------- */

export function Deadlines({ db }: { db: DB }) {
  const nav = useNav();
  const today = todayISO();
  const open = db.tasks.filter((t) => !t.archived && t.status !== 'done' && !t.parentId && t.due);

  const groups: Array<{ key: string; label: string; tone: string; test: (n: number) => boolean }> = [
    { key: 'overdue', label: 'Overdue', tone: 'var(--critical)', test: (n) => n < 0 },
    { key: 'today', label: 'Today', tone: 'var(--warning)', test: (n) => n === 0 },
    { key: 'tomorrow', label: 'Tomorrow', tone: 'var(--warning)', test: (n) => n === 1 },
    { key: 'week', label: 'This week', tone: 'var(--accent)', test: (n) => n > 1 && n <= 7 },
    { key: 'next', label: 'Next week', tone: 'var(--info)', test: (n) => n > 7 && n <= 14 },
    { key: 'month', label: 'This month', tone: 'var(--ink-2)', test: (n) => n > 14 && n <= 31 },
    { key: 'later', label: 'Later', tone: 'var(--ink-3)', test: (n) => n > 31 },
  ];

  const apps = db.applications.filter((a) => !a.archived && a.deadline && !db.stages.find((s) => s.id === a.stageId)?.terminal);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="label mb-2">Everything with a date on it</div>
        <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Deadlines</h1>
      </header>

      {apps.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Applications" title="Closing dates" />
          <ul className="mt-3 flex flex-col">
            {apps
              .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
              .map((a) => {
                const n = daysUntil(a.deadline) ?? 0;
                return (
                  <li key={a.id}>
                    <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left" onClick={() => nav.go('applications', a.id)}>
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: n < 0 ? 'var(--critical)' : n <= 3 ? 'var(--warning)' : 'var(--ink-3)' }} />
                      <span className="flex-1 truncate text-[13px]">
                        {a.org} <span className="text-[var(--ink-3)]">— {a.role}</span>
                      </span>
                      <span className="num text-[11.5px] shrink-0" style={{ color: n < 0 ? 'var(--critical)' : 'var(--ink-3)' }}>
                        {relativeDay(a.deadline)}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </Panel>
      )}

      {groups.map((g) => {
        const items = open
          .filter((t) => g.test(daysUntil(t.due) ?? 0))
          .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
        if (!items.length) return null;
        return (
          <Panel key={g.key} className="p-4 sm:p-5">
            <SectionHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="h-4 w-[3px] rounded-full" style={{ background: g.tone }} />
                  {g.label}
                </span>
              }
              right={<span className="num text-[12px] text-[var(--ink-3)]">{items.length}</span>}
            />
            <div className="mt-2 -mx-2.5">
              {items.map((t) => (
                <TaskRow key={t.id} task={t} db={db} onOpen={nav.openTask} />
              ))}
            </div>
          </Panel>
        );
      })}

      {open.length === 0 && apps.length === 0 && (
        <Panel className="p-2">
          <Empty icon="CalendarDays" title="Nothing has a deadline" body="Deadlines are what let the priority engine rank anything. Add one to a task and it appears here." />
        </Panel>
      )}
    </div>
  );
}
