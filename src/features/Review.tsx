import { useMemo, useState } from 'react';
import type { DB } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { weekStats, weekNarrative } from '../engine/jarvis';
import { goalHealth } from '../engine/priority';
import { Panel, SectionHeader, Segmented, Field, Empty, useToast, Bar } from '../components/ui';
import { HBar, StatTile } from '../components/Charts';
import { Icon } from '../components/Icon';
import { todayISO, weekKey, monthKey, formatMins, pluralise, toISODate, addDays, startOfWeek } from '../lib/util';

const QUESTIONS: Record<string, Array<{ id: string; q: string; hint?: string }>> = {
  daily: [
    { id: 'done', q: 'What did you actually finish today?' },
    { id: 'stuck', q: 'What did not move, and why?' },
    { id: 'tomorrow', q: 'What is the one thing that must happen tomorrow?' },
  ],
  weekly: [
    { id: 'win', q: 'What is the biggest thing you finished this week?' },
    { id: 'wrong', q: 'What went wrong, and was it avoidable?' },
    { id: 'move', q: 'What should move out of next week entirely?' },
    { id: 'attention', q: 'Which goal needs attention next week?' },
  ],
  monthly: [
    { id: 'progress', q: 'Which goals genuinely progressed this month?' },
    { id: 'drift', q: 'Which ones drifted, and do they still matter?' },
    { id: 'change', q: 'What are you changing about how you work?' },
  ],
};

export function Review({ db }: { db: DB }) {
  const nav = useNav();
  const toast = useToast();
  const [kind, setKind] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const periodKey =
    kind === 'daily' ? todayISO() : kind === 'weekly' ? weekKey(new Date(), db.settings.firstDayOfWeek) : monthKey(new Date());

  const existing = db.reviews.find((r) => r.kind === kind && r.periodKey === periodKey);
  const [answers, setAnswers] = useState<Record<string, string>>(existing?.answers ?? {});

  const stats = useMemo(() => weekStats(db), [db]);

  const dayStats = useMemo(() => {
    const today = todayISO();
    const done = db.tasks.filter((t) => t.completedAt?.slice(0, 10) === today);
    const open = db.tasks.filter((t) => !t.archived && t.status !== 'done' && (t.scheduledFor === today || t.due === today));
    return { done: done.length, mins: done.reduce((s, t) => s + (t.effortMins || 0), 0), remaining: open.length };
  }, [db.tasks]);

  const monthStats = useMemo(() => {
    const from = `${monthKey(new Date())}-01`;
    const done = db.tasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= from);
    const goals = db.goals.filter((g) => !g.archived).map((g) => ({ g, h: goalHealth(db, g) }));
    return {
      done: done.length,
      mins: done.reduce((s, t) => s + (t.effortMins || 0), 0),
      onTrack: goals.filter((x) => x.h.risk === 'on_track' || x.h.risk === 'done').length,
      total: goals.length,
      rows: goals.map(({ g, h }) => ({
        label: g.name,
        value: h.progress,
        color: db.areas.find((a) => a.id === g.areaId)?.color ?? 'var(--cat-1)',
      })),
    };
  }, [db]);

  const save = () => {
    const numbers: Record<string, number> =
      kind === 'daily'
        ? { completed: dayStats.done, minutes: dayStats.mins, remaining: dayStats.remaining }
        : kind === 'weekly'
          ? { completed: stats.completed, minutes: stats.completedMins, habitRate: stats.habitRate, carried: stats.unfinishedHigh.length }
          : { completed: monthStats.done, minutes: monthStats.mins, goalsOnTrack: monthStats.onTrack };
    actions.saveReview({ kind, periodKey, answers, stats: numbers });
    toast({ text: `${kind[0].toUpperCase()}${kind.slice(1)} review saved`, tone: 'good' });
  };

  const past = db.reviews.filter((r) => r.kind === kind).sort((a, b) => b.periodKey.localeCompare(a.periodKey));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">{periodKey}</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Reviews</h1>
        </div>
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v);
            const ex = db.reviews.find((r) => r.kind === v);
            setAnswers(ex?.answers ?? {});
          }}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />
      </header>

      {/* --------------------------- the numbers -------------------------- */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Measured, not remembered" title="What the records say" />
        {kind === 'daily' && (
          <div className="mt-4 grid grid-cols-3 gap-6">
            <StatTile label="Completed" value={dayStats.done} />
            <StatTile label="Effort logged" value={formatMins(dayStats.mins)} />
            <StatTile label="Still open" value={dayStats.remaining} tone={dayStats.remaining > 5 ? 'warning' : undefined} />
          </div>
        )}
        {kind === 'weekly' && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatTile label="Completed" value={stats.completed} />
              <StatTile label="Effort" value={formatMins(stats.completedMins)} />
              <StatTile label="Habits" value={`${stats.habitRate}%`} />
              <StatTile label="Carried over" value={stats.unfinishedHigh.length} tone={stats.unfinishedHigh.length ? 'warning' : 'good'} />
            </div>
            {stats.areaSplit.length > 0 && (
              <div className="mt-6">
                <div className="label mb-3">Effort by area</div>
                <HBar rows={stats.areaSplit.map((a) => ({ label: a.name, value: Math.round((a.mins / 60) * 10) / 10, color: a.color }))} unit="h" />
              </div>
            )}
            <ul className="mt-5 flex flex-col gap-1.5">
              {weekNarrative(db, stats).map((l) => (
                <li key={l} className="flex gap-2 text-[13px] text-[var(--ink-2)]">
                  <span className="text-[var(--ink-3)]">•</span>
                  {l}
                </li>
              ))}
            </ul>
          </>
        )}
        {kind === 'monthly' && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-6">
              <StatTile label="Completed" value={monthStats.done} />
              <StatTile label="Effort" value={formatMins(monthStats.mins)} />
              <StatTile label="Goals on track" value={`${monthStats.onTrack}/${monthStats.total}`} />
            </div>
            <div className="mt-6">
              <div className="label mb-3">Goal progress</div>
              <HBar rows={monthStats.rows} unit="%" max={100} />
            </div>
          </>
        )}
      </Panel>

      {/* --------------------------- the questions ------------------------ */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader
          label={existing ? 'Saved — editing' : 'Not yet written'}
          title="Your account of it"
          right={
            <button className="btn btn-primary" onClick={save}>
              <Icon name="Check" size={14} />
              Save review
            </button>
          }
        />
        <div className="mt-4 flex flex-col gap-4">
          {QUESTIONS[kind].map((q) => (
            <Field key={q.id} label={q.q} hint={q.hint}>
              <textarea
                className="field min-h-[70px] resize-y"
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Panel>

      {/* ----------------------------- history ---------------------------- */}
      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Past reviews" right={<span className="num text-[12px] text-[var(--ink-3)]">{past.length}</span>} />
        {past.length ? (
          <div className="mt-3 flex flex-col gap-2">
            {past.map((r) => (
              <details key={r.id} className="rounded-xl p-3" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                <summary className="cursor-pointer text-[13px] font-semibold flex items-center justify-between">
                  <span>{r.periodKey}</span>
                  <span className="num text-[11.5px] text-[var(--ink-3)]">
                    {Object.entries(r.stats)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-2.5">
                  {QUESTIONS[r.kind].map((q) =>
                    r.answers[q.id] ? (
                      <div key={q.id}>
                        <div className="label mb-1">{q.q}</div>
                        <p className="text-[12.5px] text-[var(--ink-2)] whitespace-pre-wrap">{r.answers[q.id]}</p>
                      </div>
                    ) : null,
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty icon="Trophy" title="No reviews saved yet" body="The numbers above are computed either way — the writing is what makes them stick." />
        )}
      </Panel>
    </div>
  );
}

/* --------------------------------- archive -------------------------------- */

export function Archive({ db }: { db: DB }) {
  const nav = useNav();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const match = (s: string) => (needle ? s.toLowerCase().includes(needle) : true);

  const tasks = db.tasks.filter((t) => (t.archived || t.status === 'done') && match(t.title));
  const goals = db.goals.filter((g) => (g.archived || g.status === 'completed') && match(g.name));
  const projects = db.projects.filter((p) => (p.archived || p.status === 'completed') && match(p.name));
  const notes = db.notes.filter((n) => n.archived && match(n.title));
  const apps = db.applications.filter((a) => a.archived && match(a.org));

  const total = tasks.length + goals.length + projects.length + notes.length + apps.length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="label mb-2">{pluralise(total, 'item')} kept out of the way</div>
        <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Archive</h1>
      </header>

      <Panel className="p-3">
        <div className="relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
          <input className="field !pl-8" placeholder="Search the archive" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Panel>

      {total === 0 ? (
        <Panel className="p-2">
          <Empty icon="Archive" title="Nothing archived" body="Completed and archived work collects here so the live views stay honest." />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.length > 0 && (
            <Panel className="p-4 sm:p-5">
              <SectionHeader title={`Goals — ${goals.length}`} />
              <div className="mt-3 flex flex-col gap-1">
                {goals.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                    <span className="flex-1 truncate text-[13px]">{g.name}</span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.updateGoal(g.id, { archived: false, status: 'active' })}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {projects.length > 0 && (
            <Panel className="p-4 sm:p-5">
              <SectionHeader title={`Projects — ${projects.length}`} />
              <div className="mt-3 flex flex-col gap-1">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                    <span className="flex-1 truncate text-[13px]">{p.name}</span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.updateProject(p.id, { archived: false, status: 'active' })}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tasks.length > 0 && (
            <Panel className="p-4 sm:p-5 lg:col-span-2">
              <SectionHeader title={`Tasks — ${tasks.length}`} />
              <div className="mt-3 flex flex-col gap-1 max-h-[26rem] overflow-y-auto">
                {tasks.slice(0, 200).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                    <span className="flex-1 truncate text-[13px] text-[var(--ink-2)]">{t.title}</span>
                    <span className="num text-[11px] text-[var(--ink-3)]">{t.completedAt?.slice(0, 10) ?? ''}</span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.updateTask(t.id, { archived: false, status: 'todo', completedAt: undefined, kanban: 'planned' })}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {notes.length > 0 && (
            <Panel className="p-4 sm:p-5">
              <SectionHeader title={`Notes — ${notes.length}`} />
              <div className="mt-3 flex flex-col gap-1">
                {notes.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                    <span className="flex-1 truncate text-[13px]">{n.title}</span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.updateNote(n.id, { archived: false })}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {apps.length > 0 && (
            <Panel className="p-4 sm:p-5">
              <SectionHeader title={`Applications — ${apps.length}`} />
              <div className="mt-3 flex flex-col gap-1">
                {apps.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                    <span className="flex-1 truncate text-[13px]">
                      {a.org} — {a.role}
                    </span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.updateApplication(a.id, { archived: false })}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
