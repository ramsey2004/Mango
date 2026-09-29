import type { DB, Task, ID } from '../lib/types';
import { rankTasks, scoreTask, goalHealth, type Scored } from './priority';
import {
  todayISO, daysUntil, toISODate, addDays, startOfWeek, pluralise, formatMins,
} from '../lib/util';

/* ============================================================
   The assistant's reasoning layer. Deterministic, local, and
   entirely derived from the user's own records — no invented
   facts, and every claim traceable to a count in the database.
   ============================================================ */

export const openTasks = (db: DB): Task[] =>
  db.tasks.filter((t) => !t.archived && t.status !== 'done' && !t.parentId);

export interface Buckets {
  criticalNow: Scored[];
  today: Scored[];
  thisWeek: Scored[];
  atRisk: Scored[];
  next: Scored[];
  longTerm: Scored[];
  overdue: Scored[];
}

export function buckets(db: DB): Buckets {
  const open = rankTasks(db, openTasks(db));
  const today = todayISO();
  const weekEnd = toISODate(addDays(new Date(), 7));

  const overdue = open.filter((s) => s.overdue);
  const dueToday = open.filter((s) => s.task.due === today || s.task.scheduledFor === today);
  const criticalNow = open
    .filter((s) => s.overdue || ((s.task.due === today || s.task.scheduledFor === today) && s.score >= 55))
    .slice(0, 8);

  const thisWeek = open.filter(
    (s) => s.task.due && s.task.due > today && s.task.due <= weekEnd,
  );

  const atRiskGoalIds = new Set(
    db.goals
      .filter((g) => !g.archived && ['at_risk', 'watch'].includes(goalHealth(db, g).risk))
      .map((g) => g.id),
  );
  const atRisk = open.filter((s) => s.task.goalId && atRiskGoalIds.has(s.task.goalId));

  const next = open
    .filter((s) => !s.overdue && !dueToday.includes(s) && s.blockedBy.length === 0)
    .slice(0, 12);

  const longTerm = open.filter((s) => {
    const n = daysUntil(s.task.due);
    return n === null || n > 30;
  });

  return { criticalNow, today: dueToday, thisWeek, atRisk, next, longTerm, overdue };
}

export interface Recommendation {
  scored: Scored;
  headline: string;
  reasons: string[];
  tag: string;
}

/** The three (or N) things worth doing, with the reasoning shown. */
export function recommend(db: DB, limit = 3): Recommendation[] {
  const open = rankTasks(db, openTasks(db)).filter((s) => s.blockedBy.length === 0 && s.task.status !== 'blocked');
  return open.slice(0, limit).map((scored) => {
    const t = scored.task;
    const goal = db.goals.find((g) => g.id === t.goalId);
    const reasons: string[] = [];

    const n = daysUntil(t.due);
    if (n !== null && n < 0) reasons.push(`${pluralise(Math.abs(n), 'day')} overdue`);
    else if (n === 0) reasons.push('Due today');
    else if (n === 1) reasons.push('Due tomorrow');
    else if (n !== null && n <= 7) reasons.push(`Due in ${pluralise(n, 'day')}`);

    if (goal) {
      const h = goalHealth(db, goal);
      if (h.risk === 'at_risk') reasons.push(`“${goal.name}” is behind schedule`);
      else if (goal.importance >= 4) reasons.push(`Serves a high-importance goal: ${goal.name}`);
      else reasons.push(`Moves “${goal.name}” forward`);
    }
    if (t.status === 'doing') reasons.push('Already started — finishing it costs least');
    if (t.effortMins && t.effortMins <= 45) reasons.push(`Only ${formatMins(t.effortMins)} estimated`);
    if (t.impact >= 4) reasons.push('High impact once done');

    const top = scored.factors.slice().sort((a, b) => b.value - a.value)[0];
    if (!reasons.length && top) reasons.push(top.detail ?? top.label);

    let tag = 'WORTH DOING';
    if (n !== null && n < 0) tag = 'OVERDUE';
    else if (scored.score >= 75) tag = 'HIGH IMPACT';
    else if (n !== null && n <= 1) tag = 'URGENT';
    else if (t.status === 'doing') tag = 'IN PROGRESS';

    return { scored, headline: t.title, reasons: reasons.slice(0, 4), tag };
  });
}

/* -------------------------------- insights ------------------------------- */

export interface Insight {
  id: string;
  text: string;
  tone: 'info' | 'good' | 'warning' | 'critical';
  go?: { view: string; id?: ID };
}

export function insights(db: DB): Insight[] {
  const out: Insight[] = [];
  const open = openTasks(db);
  const today = todayISO();

  const overdue = open.filter((t) => t.due && t.due < today);
  if (overdue.length) {
    out.push({
      id: 'overdue',
      text: `${pluralise(overdue.length, 'task')} past its deadline. The oldest is “${
        overdue.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0].title
      }”.`,
      tone: overdue.length >= 4 ? 'critical' : 'warning',
      go: { view: 'deadlines' },
    });
  }

  const soon = open.filter((t) => {
    const n = daysUntil(t.due);
    return n !== null && n >= 0 && n <= 2;
  });
  if (soon.length >= 3) {
    out.push({
      id: 'crunch',
      text: `${soon.length} deadlines land within 48 hours — that is ${formatMins(
        soon.reduce((s, t) => s + (t.effortMins || 0), 0),
      )} of estimated work.`,
      tone: 'warning',
      go: { view: 'deadlines' },
    });
  }

  for (const g of db.goals.filter((x) => !x.archived && x.status === 'active')) {
    const h = goalHealth(db, g);
    if (h.lastMovedDays !== null && h.lastMovedDays >= 6 && g.importance >= 4) {
      out.push({
        id: `stale_${g.id}`,
        text: `“${g.name}” has not moved in ${pluralise(h.lastMovedDays, 'day')}, and it is one of your most important goals.`,
        tone: 'warning',
        go: { view: 'goals', id: g.id },
      });
    } else if (h.drift !== null && h.drift <= -25) {
      out.push({
        id: `drift_${g.id}`,
        text: `“${g.name}” is ${Math.abs(h.drift)} points behind where the calendar says it should be.`,
        tone: 'critical',
        go: { view: 'goals', id: g.id },
      });
    }
  }

  const todayLoad = open.filter((t) => t.scheduledFor === today);
  const mins = todayLoad.reduce((s, t) => s + (t.effortMins || 0), 0);
  if (mins > 480) {
    out.push({
      id: 'overloaded',
      text: `You have planned ${formatMins(mins)} of work for today. That is more than a full day — something should move.`,
      tone: 'warning',
      go: { view: 'today' },
    });
  }

  // Effort split: is high-value work actually getting the hours?
  const weekStart = toISODate(startOfWeek(new Date(), db.settings.firstDayOfWeek));
  const doneThisWeek = db.tasks.filter(
    (t) => t.completedAt && toISODate(new Date(t.completedAt)) >= weekStart,
  );
  if (doneThisWeek.length >= 5) {
    const lowRank = new Set(
      [...db.priorities].sort((a, b) => a.rank - b.rank).slice(-2).map((p) => p.id),
    );
    const lowMins = doneThisWeek.filter((t) => lowRank.has(t.priorityId)).reduce((s, t) => s + (t.effortMins || 0), 0);
    const allMins = doneThisWeek.reduce((s, t) => s + (t.effortMins || 0), 0);
    if (allMins > 0 && lowMins / allMins > 0.45) {
      out.push({
        id: 'lowvalue',
        text: `${Math.round((lowMins / allMins) * 100)}% of the hours you finished this week went to your two lowest priority levels.`,
        tone: 'warning',
        go: { view: 'analytics' },
      });
    }
  }

  const critDone = db.tasks.filter(
    (t) => t.completedAt && toISODate(new Date(t.completedAt)) >= weekStart && t.priorityId === db.priorities[0]?.id,
  ).length;
  const critOpen = open.filter((t) => t.priorityId === db.priorities[0]?.id).length;
  if (critDone + critOpen > 0 && critDone > 0) {
    out.push({
      id: 'critprogress',
      text: `${critDone} of ${critDone + critOpen} of your top-level priorities are done this week (${Math.round(
        (critDone / (critDone + critOpen)) * 100,
      )}%).`,
      tone: 'good',
      go: { view: 'analytics' },
    });
  }

  const blocked = open.filter((t) => t.status === 'blocked' || t.dependsOn.some((d) => {
    const dep = db.tasks.find((x) => x.id === d);
    return dep && dep.status !== 'done';
  }));
  if (blocked.length >= 2) {
    out.push({
      id: 'blocked',
      text: `${pluralise(blocked.length, 'task')} cannot start until something else finishes.`,
      tone: 'info',
      go: { view: 'tasks' },
    });
  }

  const apps = db.applications.filter((a) => !a.archived);
  const appDue = apps.filter((a) => {
    const n = daysUntil(a.deadline);
    return n !== null && n >= 0 && n <= 3 && !db.stages.find((s) => s.id === a.stageId)?.terminal;
  });
  if (appDue.length) {
    out.push({
      id: 'appsoon',
      text: `${pluralise(appDue.length, 'application')} closing within three days: ${appDue.map((a) => a.org).join(', ')}.`,
      tone: 'critical',
      go: { view: 'applications' },
    });
  }

  if (!out.length) {
    out.push({
      id: 'clear',
      text: 'Nothing is overdue, nothing is drifting. This is the moment to pull long-term work forward.',
      tone: 'good',
      go: { view: 'goals' },
    });
  }

  return out.slice(0, 6);
}

/* -------------------------------- briefing ------------------------------- */

export interface Briefing {
  greeting: string;
  dateLine: string;
  headline: string;
  counts: { today: number; high: number; overdue: number; deadlines: number };
  top: Recommendation[];
  goalsOnTrack: number;
  goalsTotal: number;
  minutesPlanned: number;
}

export function briefing(db: DB): Briefing {
  const h = new Date().getHours();
  const greeting = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const d = new Date();
  const open = openTasks(db);
  const today = todayISO();

  const todayList = open.filter((t) => t.scheduledFor === today || t.due === today || (t.due && t.due < today));
  const topRankIds = new Set([...db.priorities].sort((a, b) => a.rank - b.rank).slice(0, 2).map((p) => p.id));
  const high = todayList.filter((t) => topRankIds.has(t.priorityId)).length;
  const overdue = open.filter((t) => t.due && t.due < today).length;
  const weekEnd = toISODate(addDays(new Date(), 7));
  const deadlines = open.filter((t) => t.due && t.due >= today && t.due <= weekEnd).length;

  const activeGoals = db.goals.filter((g) => !g.archived && !['completed', 'archived'].includes(g.status));
  const onTrack = activeGoals.filter((g) => ['on_track', 'done', 'no_deadline'].includes(goalHealth(db, g).risk)).length;

  const critical = todayList.length;
  const headline =
    overdue > 0
      ? `${pluralise(overdue, 'task')} is past its deadline. Clear those first.`
      : critical === 0
        ? 'Nothing is scheduled for today. A good day to pull work forward.'
        : `${pluralise(high || critical, 'priority', 'priorities')} ${high || critical === 1 ? 'requires' : 'require'} your attention.`;

  return {
    greeting,
    dateLine: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    headline,
    counts: { today: todayList.length, high, overdue, deadlines },
    top: recommend(db, 3),
    goalsOnTrack: onTrack,
    goalsTotal: activeGoals.length,
    minutesPlanned: todayList.reduce((s, t) => s + (t.effortMins || 0), 0),
  };
}

/* ----------------------------- weekly review ----------------------------- */

export interface WeekStats {
  from: string;
  to: string;
  completed: number;
  completedMins: number;
  createdCount: number;
  overdueCarried: number;
  goalsProgressed: { name: string; delta: number }[];
  projectsCompleted: number;
  habitRate: number;
  areaSplit: { areaId: ID | 'none'; name: string; mins: number; color: string }[];
  unfinishedHigh: Task[];
}

export function weekStats(db: DB, weeksAgo = 0): WeekStats {
  const start = startOfWeek(addDays(new Date(), -7 * weeksAgo), db.settings.firstDayOfWeek);
  const end = addDays(start, 6);
  const from = toISODate(start);
  const to = toISODate(end);

  const inWeek = (iso?: string) => !!iso && iso >= from && iso <= to;
  const completed = db.tasks.filter((t) => t.completedAt && inWeek(toISODate(new Date(t.completedAt))));
  const created = db.tasks.filter((t) => inWeek(toISODate(new Date(t.createdAt))));

  const areaMins = new Map<string, number>();
  for (const t of completed) {
    const key = t.areaId ?? 'none';
    areaMins.set(key, (areaMins.get(key) ?? 0) + (t.effortMins || 0));
  }
  const areaSplit = [...areaMins.entries()]
    .map(([areaId, mins]) => {
      const a = db.areas.find((x) => x.id === areaId);
      return { areaId: areaId as ID, name: a?.name ?? 'Unassigned', mins, color: a?.color ?? '#616a78' };
    })
    .sort((a, b) => b.mins - a.mins);

  const goalsProgressed = db.goals
    .filter((g) => !g.archived)
    .map((g) => ({
      name: g.name,
      delta: completed.filter((t) => t.goalId === g.id).length,
    }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const projectsCompleted = db.projects.filter(
    (p) => p.status === 'completed' && inWeek(toISODate(new Date(p.updatedAt))),
  ).length;

  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
  const dailyHabits = db.habits.filter((h) => !h.archived && h.cadence === 'daily');
  const possible = dailyHabits.length * 7;
  const actual = db.habitEntries.filter((e) => days.includes(e.date) && dailyHabits.some((h) => h.id === e.habitId)).length;
  const habitRate = possible ? Math.round((actual / possible) * 100) : 0;

  const topRankIds = new Set([...db.priorities].sort((a, b) => a.rank - b.rank).slice(0, 2).map((p) => p.id));
  const unfinishedHigh = openTasks(db).filter((t) => topRankIds.has(t.priorityId));

  return {
    from,
    to,
    completed: completed.length,
    completedMins: completed.reduce((s, t) => s + (t.effortMins || 0), 0),
    createdCount: created.length,
    overdueCarried: openTasks(db).filter((t) => t.due && t.due < from).length,
    goalsProgressed,
    projectsCompleted,
    habitRate,
    areaSplit,
    unfinishedHigh,
  };
}

/** Sentences that are true of THIS week's numbers, not generic encouragement. */
export function weekNarrative(db: DB, s: WeekStats): string[] {
  const out: string[] = [];
  const totalMins = s.areaSplit.reduce((a, b) => a + b.mins, 0);
  if (s.completed === 0) {
    out.push('Nothing was marked complete this week. If work happened but was not logged, the numbers below will understate you.');
  } else {
    out.push(`You closed ${pluralise(s.completed, 'task')}, about ${formatMins(s.completedMins)} of estimated effort.`);
  }
  if (totalMins > 0 && s.areaSplit[0]) {
    const share = Math.round((s.areaSplit[0].mins / totalMins) * 100);
    out.push(`${s.areaSplit[0].name} took ${share}% of that effort${s.areaSplit[1] ? `, ${s.areaSplit[1].name} ${Math.round((s.areaSplit[1].mins / totalMins) * 100)}%` : ''}.`);
  }
  if (s.goalsProgressed[0]) {
    out.push(`Most movement went to “${s.goalsProgressed[0].name}”.`);
  }
  if (s.unfinishedHigh.length) {
    out.push(`${pluralise(s.unfinishedHigh.length, 'high-priority task')} carries into next week.`);
  }
  if (s.overdueCarried) {
    out.push(`${pluralise(s.overdueCarried, 'task')} was already overdue before this week began.`);
  }
  if (db.habits.some((h) => h.cadence === 'daily' && !h.archived)) {
    out.push(`Daily habits ran at ${s.habitRate}%.`);
  }
  return out;
}
