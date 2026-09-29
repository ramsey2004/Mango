import type { DB, Task, Goal } from '../lib/types';
import { actions } from '../store/store';
import { buckets, recommend, insights, weekStats, weekNarrative, openTasks, type Recommendation } from './jarvis';
import { goalHealth, rankTasks } from './priority';
import { planDay, type DayPlan } from './planner';
import { parseCapture, parsedToTask } from './nlp';
import { todayISO, toISODate, addDays, daysUntil, pluralise, formatMins, relativeDay } from '../lib/util';

/* ============================================================
   The assistant's local command grammar. Every one of these
   answers is computed from the user's records — no model needed.
   Free-form text that matches nothing here is either handed to a
   configured AI endpoint or answered with an honest "I can't".
   ============================================================ */

export interface Answer {
  lines: string[];
  tasks?: Task[];
  goals?: Goal[];
  recs?: Recommendation[];
  plan?: DayPlan;
  source: 'local' | 'ai' | 'none';
  go?: { view: string; id?: string };
  /** set when the command changed data, so the UI can show an undo affordance */
  mutated?: boolean;
}

const findTask = (db: DB, needle: string): Task | undefined => {
  const n = needle.toLowerCase().trim();
  if (!n) return undefined;
  const open = openTasks(db);
  return (
    open.find((t) => t.title.toLowerCase() === n) ??
    open.find((t) => t.title.toLowerCase().includes(n)) ??
    db.tasks.find((t) => t.title.toLowerCase().includes(n))
  );
};

export const SUGGESTIONS = [
  'What should I do now?',
  'What are my priorities today?',
  'What am I falling behind on?',
  'What is overdue?',
  'What is due this week?',
  'Plan my day',
  'Give me my weekly review',
  'Which goal needs attention?',
  'Show everything related to …',
  'Add … tomorrow high priority',
];

export function runCommand(input: string, db: DB): Answer {
  const q = input.trim();
  const l = q.toLowerCase();

  /* ---------------------------- what should I do --------------------------- */
  if (/what (should|do) i do|highest leverage|next action|what.s next/.test(l)) {
    const recs = recommend(db, 3);
    if (!recs.length) {
      return { lines: ['Nothing is open and unblocked right now.'], source: 'local' };
    }
    const top = recs[0];
    return {
      lines: [
        `Your highest-leverage action right now is: ${top.headline}.`,
        ...top.reasons.map((r) => `• ${r}`),
        top.scored.task.effortMins ? `Estimated ${formatMins(top.scored.task.effortMins)}.` : '',
      ].filter(Boolean),
      recs,
      source: 'local',
    };
  }

  /* ----------------------------- today's list ----------------------------- */
  if (/priorities today|today.s priorit|what.s (on )?today|today.s tasks/.test(l)) {
    const b = buckets(db);
    const list = b.today.map((s) => s.task);
    return {
      lines: list.length
        ? [`${pluralise(list.length, 'task')} for today${b.overdue.length ? `, plus ${pluralise(b.overdue.length, 'overdue item')}` : ''}.`]
        : ['Nothing is scheduled or due today.'],
      tasks: list,
      source: 'local',
      go: { view: 'today' },
    };
  }

  /* ------------------------------- overdue -------------------------------- */
  if (/overdue|past due|late/.test(l)) {
    const list = buckets(db).overdue.map((s) => s.task);
    return {
      lines: list.length
        ? [`${pluralise(list.length, 'task')} past its deadline, oldest first.`]
        : ['Nothing is overdue.'],
      tasks: list,
      source: 'local',
      go: { view: 'deadlines' },
    };
  }

  /* ------------------------------ this week ------------------------------- */
  if (/due this week|this week|before friday|by friday/.test(l) && !/review/.test(l)) {
    const end = toISODate(addDays(new Date(), 7));
    const list = rankTasks(db, openTasks(db).filter((t) => t.due && t.due >= todayISO() && t.due <= end)).map((s) => s.task);
    return {
      lines: list.length ? [`${pluralise(list.length, 'task')} falls due in the next seven days.`] : ['Nothing falls due in the next seven days.'],
      tasks: list,
      source: 'local',
      go: { view: 'deadlines' },
    };
  }

  /* --------------------------- falling behind ----------------------------- */
  if (/falling behind|behind on|at risk|slipping|needs attention/.test(l)) {
    const risky = db.goals
      .filter((g) => !g.archived && !['completed', 'archived'].includes(g.status))
      .map((g) => ({ g, h: goalHealth(db, g) }))
      .filter((x) => x.h.risk === 'at_risk' || x.h.risk === 'watch')
      .sort((a, b) => (a.h.drift ?? 0) - (b.h.drift ?? 0));

    if (!risky.length) {
      return { lines: ['No goal is currently behind its own schedule.'], source: 'local', go: { view: 'goals' } };
    }
    return {
      lines: [
        `${pluralise(risky.length, 'goal')} needs attention:`,
        ...risky.map(
          ({ g, h }) =>
            `• ${g.name} — ${h.progress}% done${h.drift !== null ? `, ${Math.abs(h.drift)} points behind pace` : ''}${
              h.lastMovedDays !== null ? `, last moved ${pluralise(h.lastMovedDays, 'day')} ago` : ''
            }`,
        ),
      ],
      goals: risky.map((x) => x.g),
      source: 'local',
      go: { view: 'goals' },
    };
  }

  /* ------------------------------ plan my day ----------------------------- */
  if (/plan (my )?day|schedule my day|build me a day/.test(l)) {
    const plan = planDay(db);
    return {
      lines: [
        plan.blocks.length
          ? `Here is a realistic shape for today: ${formatMins(plan.scheduledMins)} of work inside a ${formatMins(
              plan.availableMins,
            )} window.`
          : 'There is nothing due or scheduled for today to plan.',
        ...(plan.leftOut.length
          ? [`${pluralise(plan.leftOut.length, 'task')} did not fit and should move to another day.`]
          : []),
      ],
      plan,
      source: 'local',
      go: { view: 'today' },
    };
  }

  /* ---------------------------- weekly review ----------------------------- */
  if (/weekly review|review my week|how was my week/.test(l)) {
    const s = weekStats(db);
    return {
      lines: [`Week of ${s.from} to ${s.to}.`, ...weekNarrative(db, s)],
      source: 'local',
      go: { view: 'review' },
    };
  }

  /* ------------------------------- insights ------------------------------- */
  if (/insight|anything i should know|status report|how am i doing/.test(l)) {
    return { lines: insights(db).map((i) => `• ${i.text}`), source: 'local' };
  }

  /* -------------------------- show everything X --------------------------- */
  const rel = q.match(/show (?:me )?(?:everything|all)?\s*(?:related to|about|for)\s+(.+)/i);
  if (rel) {
    const needle = rel[1].trim().toLowerCase().replace(/[.?]$/, '');
    const tasks = db.tasks.filter(
      (t) =>
        !t.archived &&
        (t.title.toLowerCase().includes(needle) ||
          t.tags.some((x) => x.toLowerCase().includes(needle)) ||
          db.goals.find((g) => g.id === t.goalId)?.name.toLowerCase().includes(needle) ||
          db.projects.find((p) => p.id === t.projectId)?.name.toLowerCase().includes(needle) ||
          db.areas.find((a) => a.id === t.areaId)?.name.toLowerCase().includes(needle)),
    );
    const goals = db.goals.filter((g) => g.name.toLowerCase().includes(needle) || g.description?.toLowerCase().includes(needle));
    return {
      lines: [
        tasks.length || goals.length
          ? `Found ${pluralise(tasks.length, 'task')} and ${pluralise(goals.length, 'goal')} matching “${needle}”.`
          : `Nothing matches “${needle}”.`,
      ],
      tasks,
      goals,
      source: 'local',
    };
  }

  /* ------------------------------ mutations ------------------------------- */
  const complete = q.match(/^(?:mark\s+)?(.+?)\s+(?:as\s+)?(?:complete|completed|done)$/i);
  if (complete) {
    const t = findTask(db, complete[1]);
    if (!t) return { lines: [`I could not find an open task matching “${complete[1]}”.`], source: 'local' };
    actions.toggleTask(t.id);
    return { lines: [`Marked “${t.title}” complete.`], source: 'local', mutated: true };
  }

  const move = q.match(/^move\s+(.+?)\s+to\s+(tomorrow|today|next week|\d{1,3}\s*days?)$/i);
  if (move) {
    const t = findTask(db, move[1]);
    if (!t) return { lines: [`I could not find a task matching “${move[1]}”.`], source: 'local' };
    const when = move[2].toLowerCase();
    const days = when === 'today' ? 0 : when === 'tomorrow' ? 1 : when === 'next week' ? 7 : parseInt(when, 10) || 1;
    const date = toISODate(addDays(new Date(), days));
    actions.updateTask(t.id, { scheduledFor: date, due: t.due ? date : undefined });
    return { lines: [`Moved “${t.title}” to ${relativeDay(date).toLowerCase()} (${date}).`], source: 'local', mutated: true };
  }

  const mkProject = q.match(/^create (?:a )?project (?:for |called )?(.+)$/i);
  if (mkProject) {
    const p = actions.addProject({ name: mkProject[1].trim() });
    return { lines: [`Created the project “${p.name}”. Open Projects to give it tasks and a deadline.`], source: 'local', mutated: true, go: { view: 'projects', id: p.id } };
  }

  const mkGoal = q.match(/^create (?:a )?goal (?:for |called )?(.+)$/i);
  if (mkGoal) {
    const g = actions.addGoal({ name: mkGoal[1].trim() });
    return { lines: [`Created the goal “${g.name}”.`], source: 'local', mutated: true, go: { view: 'goals', id: g.id } };
  }

  const breakDown = q.match(/^break (?:down )?(?:this |the )?goal\s+(.+?)\s+into tasks$/i);
  if (breakDown) {
    return {
      lines: [
        `Splitting a goal into the right tasks is a judgement call about your situation, and I will not invent steps you did not ask for.`,
        `Open the goal and add milestones — or configure an AI endpoint in Settings if you want a model to draft them.`,
      ],
      source: 'local',
      go: { view: 'goals' },
    };
  }

  const add = q.match(/^(?:add|create|new)\s+(?:task\s+)?(.+)$/i);
  if (add) {
    const parsed = parseCapture(add[1], db);
    const t = actions.addTask(parsedToTask(parsed));
    return {
      lines: [
        `Added “${t.title}”.`,
        ...(parsed.understood.length ? [`Understood — ${parsed.understood.join(' · ')}`] : []),
      ],
      tasks: [t],
      source: 'local',
      mutated: true,
    };
  }

  return {
    lines: [],
    source: 'none',
  };
}
