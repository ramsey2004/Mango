import type { DB, Task, Goal, ID } from '../lib/types';
import { daysUntil, todayISO, clamp } from '../lib/util';

/* ============================================================
   Priority engine.

   Everything here is explainable on purpose: the score is a sum
   of named contributions, so the assistant can always say WHY
   something ranked where it did. A user override (pinnedRank)
   short-circuits the whole thing — the engine advises, it never
   decides.
   ============================================================ */

export interface Factor {
  label: string;
  value: number;
  detail?: string;
}

export interface Scored {
  task: Task;
  score: number;
  factors: Factor[];
  overdue: boolean;
  blockedBy: Task[];
}

const priorityWeight = (db: DB, priorityId: ID): number => {
  const levels = [...db.priorities].sort((a, b) => a.rank - b.rank);
  const idx = levels.findIndex((p) => p.id === priorityId);
  if (idx < 0) return 12;
  // top level 30 → each step down loses a slice, floor at 2
  const step = levels.length > 1 ? 28 / (levels.length - 1) : 0;
  return clamp(30 - idx * step, 2, 30);
};

/** Deadline pressure. Steep once inside a week, brutal once overdue. */
const urgency = (due?: string): { value: number; detail: string } => {
  const n = daysUntil(due);
  if (n === null) return { value: 0, detail: 'No deadline' };
  if (n < 0) return { value: 34 + Math.min(16, Math.abs(n) * 2), detail: `${Math.abs(n)} day(s) overdue` };
  if (n === 0) return { value: 32, detail: 'Due today' };
  if (n === 1) return { value: 26, detail: 'Due tomorrow' };
  if (n <= 3) return { value: 20, detail: `Due in ${n} days` };
  if (n <= 7) return { value: 13, detail: 'Due this week' };
  if (n <= 14) return { value: 7, detail: 'Due within a fortnight' };
  if (n <= 30) return { value: 3, detail: 'Due this month' };
  return { value: 1, detail: 'Distant deadline' };
};

/** Multiplier from any active context period ("Placement season"). */
export const areaMultiplier = (db: DB, areaId?: ID): { mult: number; label?: string } => {
  if (!areaId) return { mult: 1 };
  const today = todayISO();
  const live = db.periods.filter((p) => p.active && p.start <= today && p.end >= today);
  let mult = 1;
  let label: string | undefined;
  for (const p of live) {
    const w = p.weights[areaId];
    if (typeof w === 'number' && w !== 1) {
      mult *= w;
      label = p.name;
    }
  }
  return { mult, label };
};

/** A goal that is behind, at risk, or has a near deadline lifts its tasks. */
const goalPull = (db: DB, goal?: Goal): { value: number; detail: string } => {
  if (!goal) return { value: 0, detail: 'Not linked to a goal' };
  let v = goal.importance * 2; // 2–10
  let detail = `Serves “${goal.name}”`;
  if (goal.status === 'at_risk') {
    v += 8;
    detail += ' (goal at risk)';
  }
  if (goal.status === 'blocked') {
    v += 4;
    detail += ' (goal blocked)';
  }
  if (goal.status === 'paused' || goal.status === 'completed' || goal.status === 'archived') {
    v = 0;
    detail = `Goal is ${goal.status.replace('_', ' ')}`;
  }
  const gd = daysUntil(goal.deadline);
  if (gd !== null && gd >= 0 && gd <= 30 && v > 0) {
    v += clamp(10 - gd / 3, 0, 10);
    detail += ` · goal deadline in ${gd}d`;
  }
  return { value: v, detail };
};

export function scoreTask(db: DB, task: Task): Scored {
  const goal = db.goals.find((g) => g.id === task.goalId);
  const blockedBy = task.dependsOn
    .map((id) => db.tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && t.status !== 'done');

  const factors: Factor[] = [];

  const p = db.priorities.find((x) => x.id === task.priorityId);
  factors.push({ label: 'Priority level', value: priorityWeight(db, task.priorityId), detail: p?.name });

  const u = urgency(task.due);
  factors.push({ label: 'Deadline pressure', value: u.value, detail: u.detail });

  factors.push({ label: 'Importance', value: task.importance * 3, detail: `${task.importance}/5` });
  factors.push({ label: 'Impact', value: task.impact * 2.4, detail: `${task.impact}/5` });
  factors.push({ label: 'Strategic relevance', value: task.strategic * 2, detail: `${task.strategic}/5` });

  const g = goalPull(db, goal);
  factors.push({ label: 'Goal pull', value: g.value, detail: g.detail });

  // Short work that clears a bottleneck should beat long work of equal weight.
  const quick = task.effortMins > 0 && task.effortMins <= 30 ? 4 : task.effortMins >= 180 ? -3 : 0;
  if (quick !== 0) {
    factors.push({
      label: quick > 0 ? 'Quick to finish' : 'Large block of work',
      value: quick,
      detail: `${task.effortMins} min estimate`,
    });
  }

  if (task.status === 'doing') factors.push({ label: 'Already in progress', value: 6, detail: 'Finish what is started' });
  if (task.status === 'blocked') factors.push({ label: 'Marked blocked', value: -18, detail: 'Cannot proceed' });
  if (blockedBy.length) {
    factors.push({
      label: 'Waiting on other work',
      value: -22,
      detail: `Blocked by ${blockedBy.map((t) => t.title).join(', ')}`,
    });
  }

  if (task.scheduledFor === todayISO()) {
    factors.push({ label: 'You planned this for today', value: 8 });
  }

  const am = areaMultiplier(db, task.areaId);
  let subtotal = factors.reduce((s, f) => s + f.value, 0);
  if (am.mult !== 1) {
    const delta = subtotal * (am.mult - 1);
    factors.push({
      label: am.mult > 1 ? 'Season emphasis' : 'Season de-emphasis',
      value: delta,
      detail: am.label,
    });
    subtotal += delta;
  }

  if (task.manualBoost) {
    factors.push({ label: 'Your manual adjustment', value: task.manualBoost });
    subtotal += task.manualBoost;
  }

  const n = daysUntil(task.due);
  return {
    task,
    score: Math.round(subtotal * 10) / 10,
    factors: factors.filter((f) => Math.abs(f.value) > 0.05),
    overdue: n !== null && n < 0 && task.status !== 'done',
    blockedBy,
  };
}

export function rankTasks(db: DB, tasks: Task[]): Scored[] {
  const scored = tasks.map((t) => scoreTask(db, t));
  return scored.sort((a, b) => {
    const ap = a.task.pinnedRank ?? Infinity;
    const bp = b.task.pinnedRank ?? Infinity;
    if (ap !== bp) return ap - bp;
    if (b.score !== a.score) return b.score - a.score;
    return a.task.order - b.task.order;
  });
}

/* ------------------------------ goal health ------------------------------ */

export interface GoalHealth {
  progress: number;
  total: number;
  done: number;
  daysLeft: number | null;
  /** progress the goal *should* be at, given elapsed time */
  expected: number | null;
  drift: number | null;
  lastMovedDays: number | null;
  risk: 'on_track' | 'watch' | 'at_risk' | 'no_deadline' | 'done';
}

export function goalHealth(db: DB, goal: Goal): GoalHealth {
  const tasks = db.tasks.filter((t) => t.goalId === goal.id && !t.archived);
  const done = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const progress =
    goal.progressMode === 'manual'
      ? clamp(goal.manualProgress, 0, 100)
      : total === 0
        ? 0
        : Math.round((done / total) * 100);

  const daysLeft = daysUntil(goal.deadline);

  const created = new Date(goal.createdAt).getTime();
  const deadline = goal.deadline ? new Date(goal.deadline).getTime() : null;
  let expected: number | null = null;
  if (deadline && deadline > created) {
    const elapsed = clamp((Date.now() - created) / (deadline - created), 0, 1);
    expected = Math.round(elapsed * 100);
  }
  const drift = expected === null ? null : progress - expected;

  const lastDone = tasks
    .filter((t) => t.completedAt)
    .map((t) => new Date(t.completedAt as string).getTime())
    .sort((a, b) => b - a)[0];
  const lastMovedDays = lastDone ? Math.floor((Date.now() - lastDone) / 86400000) : null;

  let risk: GoalHealth['risk'] = 'on_track';
  if (goal.status === 'completed' || progress >= 100) risk = 'done';
  else if (daysLeft === null) risk = 'no_deadline';
  else if (daysLeft < 0 || (drift !== null && drift <= -25)) risk = 'at_risk';
  else if ((drift !== null && drift <= -10) || (lastMovedDays !== null && lastMovedDays >= 7)) risk = 'watch';

  return { progress, total, done, daysLeft, expected, drift, lastMovedDays, risk };
}

export function projectProgress(db: DB, projectId: ID): { progress: number; done: number; total: number } {
  const tasks = db.tasks.filter((t) => t.projectId === projectId && !t.archived);
  const done = tasks.filter((t) => t.status === 'done').length;
  return { progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0, done, total: tasks.length };
}
