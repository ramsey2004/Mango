import { useMemo, useState } from 'react';
import type { DB } from '../lib/types';
import { useNav } from '../store/nav';
import { goalHealth, projectProgress } from '../engine/priority';
import { weekStats, openTasks } from '../engine/jarvis';
import { Panel, SectionHeader, Segmented, Bar, Empty } from '../components/ui';
import { StatTile, HBar, LineChart, StackedBar } from '../components/Charts';
import { Icon } from '../components/Icon';
import { toISODate, addDays, todayISO, formatMins, dowShort, pluralise } from '../lib/util';

export function Analytics({ db }: { db: DB }) {
  const nav = useNav();
  const [rangeKey, setRangeKey] = useState<'30' | '90'>('30');
  const range = Number(rangeKey);

  const open = openTasks(db);
  const today = todayISO();

  const completions = useMemo(() => {
    const days = Array.from({ length: range }, (_, i) => toISODate(addDays(new Date(), -(range - 1 - i))));
    const counts = new Map(days.map((d) => [d, 0]));
    for (const t of db.tasks) {
      if (!t.completedAt) continue;
      const d = t.completedAt.slice(0, 10);
      if (counts.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return days.map((d) => ({ x: d.slice(5), y: counts.get(d) ?? 0 }));
  }, [db.tasks, range]);

  const totalCompleted = completions.reduce((s, p) => s + p.y, 0);
  const overdue = open.filter((t) => t.due && t.due < today);
  const createdInRange = db.tasks.filter((t) => t.createdAt.slice(0, 10) >= toISODate(addDays(new Date(), -range))).length;
  const completionRate = createdInRange > 0 ? Math.round((totalCompleted / Math.max(totalCompleted, createdInRange)) * 100) : 0;

  const priorityMix = [...db.priorities]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ label: p.name, value: open.filter((t) => t.priorityId === p.id).length, color: p.color }));

  const areaEffort = useMemo(() => {
    const since = toISODate(addDays(new Date(), -range));
    const map = new Map<string, number>();
    for (const t of db.tasks) {
      if (!t.completedAt || t.completedAt.slice(0, 10) < since) continue;
      const key = t.areaId ?? 'none';
      map.set(key, (map.get(key) ?? 0) + (t.effortMins || 0));
    }
    return [...map.entries()]
      .map(([id, mins]) => {
        const a = db.areas.find((x) => x.id === id);
        return { label: a?.name ?? 'Unassigned', value: Math.round((mins / 60) * 10) / 10, color: a?.color ?? '#616a78' };
      })
      .sort((a, b) => b.value - a.value);
  }, [db.tasks, db.areas, range]);

  const goals = db.goals.filter((g) => !g.archived && !['archived'].includes(g.status));
  const goalRows = goals
    .map((g) => {
      const h = goalHealth(db, g);
      const a = db.areas.find((x) => x.id === g.areaId);
      return { label: g.name, value: h.progress, color: a?.color ?? 'var(--cat-1)', hint: `${h.done}/${h.total} tasks` };
    })
    .sort((a, b) => b.value - a.value);

  const habitRows = db.habits
    .filter((h) => !h.archived)
    .map((h) => {
      const last = Array.from({ length: range }, (_, i) => toISODate(addDays(new Date(), -i)));
      const hits = db.habitEntries.filter((e) => e.habitId === h.id && last.includes(e.date)).length;
      return { label: h.name, value: Math.round((hits / range) * 100), color: h.color };
    })
    .sort((a, b) => b.value - a.value);

  const byWeekday = useMemo(() => {
    const counts = Array(7).fill(0);
    const since = toISODate(addDays(new Date(), -range));
    for (const t of db.tasks) {
      if (!t.completedAt || t.completedAt.slice(0, 10) < since) continue;
      counts[new Date(t.completedAt).getDay()]++;
    }
    return counts.map((c, i) => ({ label: dowShort(i), value: c, color: 'var(--cat-2)' }));
  }, [db.tasks, range]);

  const projects = db.projects.filter((p) => !p.archived && p.status !== 'completed');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">Read from your records — nothing here is decorative</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Analytics</h1>
        </div>
        <Segmented value={rangeKey} onChange={setRangeKey} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </header>

      <Panel className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <StatTile label={`Completed / ${range}d`} value={totalCompleted} sub={`${(totalCompleted / range).toFixed(1)} a day`} />
          <StatTile label="Open tasks" value={open.length} sub={formatMins(open.reduce((s, t) => s + (t.effortMins || 0), 0))} />
          <StatTile label="Overdue" value={overdue.length} tone={overdue.length ? 'critical' : 'good'} sub={overdue.length ? 'needs clearing' : 'nothing late'} />
          <StatTile label="Throughput" value={`${completionRate}%`} sub="closed vs opened" />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader label={`Tasks completed per day, last ${range} days`} title="Momentum" />
        <div className="mt-4">
          <LineChart points={completions} yLabel="tasks" color="var(--cat-1)" />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Where the hours actually went" title="Effort by area" />
          <div className="mt-4">
            <HBar rows={areaEffort} unit="h" />
          </div>
          {areaEffort.length > 1 && (
            <p className="mt-4 text-[12px] text-[var(--ink-3)] leading-relaxed">
              {areaEffort[0].label} took {Math.round((areaEffort[0].value / Math.max(1, areaEffort.reduce((s, a) => s + a.value, 0))) * 100)}% of
              logged effort in this window.
            </p>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Open work by priority level" title="Priority mix" />
          <div className="mt-4">
            <StackedBar parts={priorityMix} />
          </div>
          <p className="mt-4 text-[12px] text-[var(--ink-3)] leading-relaxed">
            A healthy mix has few items at the top level. If everything is critical, nothing is.
          </p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Progress against each goal" title="Goals" />
          <div className="mt-4">{goalRows.length ? <HBar rows={goalRows} unit="%" max={100} /> : <Empty icon="Target" title="No goals to measure" />}</div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label={`Completion rate over ${range} days`} title="Habit consistency" />
          <div className="mt-4">{habitRows.length ? <HBar rows={habitRows} unit="%" max={100} /> : <Empty icon="Repeat" title="No habits tracked" />}</div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Which days you actually finish things" title="By weekday" />
          <div className="mt-4">
            <HBar rows={byWeekday} />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Live projects" title="Project progress" />
          <div className="mt-4 flex flex-col gap-3">
            {projects.length ? (
              projects.map((p) => {
                const pr = projectProgress(db, p.id);
                const a = db.areas.find((x) => x.id === p.areaId);
                return (
                  <button key={p.id} className="text-left group" onClick={() => nav.go('projects', p.id)}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px] truncate group-hover:text-[var(--accent)]">{p.name}</span>
                      <span className="num text-[11.5px] text-[var(--ink-3)]">
                        {pr.done}/{pr.total}
                      </span>
                    </div>
                    <Bar value={pr.progress} color={a?.color ?? 'var(--cat-4)'} height={7} className="mt-1.5" label={p.name} />
                  </button>
                );
              })
            ) : (
              <Empty icon="Layers" title="No live projects" />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
