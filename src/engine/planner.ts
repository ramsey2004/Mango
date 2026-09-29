import type { DB, Task } from '../lib/types';
import { rankTasks } from './priority';
import { todayISO, formatClock } from '../lib/util';

/* ============================================================
   "Plan my day" — fits today's work into the hours that actually
   exist. It refuses to schedule more than the window holds, which
   is the only thing that makes such a plan worth following.
   ============================================================ */

export interface Block {
  id: string;
  kind: 'task' | 'break';
  taskId?: string;
  title: string;
  startMin: number;
  endMin: number;
  label: string;
}

export interface DayPlan {
  blocks: Block[];
  scheduledMins: number;
  availableMins: number;
  leftOut: Task[];
  windowStart: number;
  windowEnd: number;
}

export interface PlanOptions {
  startMin?: number;
  endMin?: number;
  breakEvery?: number;
  breakLength?: number;
  time24h?: boolean;
}

const roundTo = (n: number, step = 5) => Math.ceil(n / step) * step;

export function planDay(db: DB, opts: PlanOptions = {}): DayPlan {
  const time24h = opts.time24h ?? db.settings.time24h;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const windowStart = opts.startMin ?? Math.max(roundTo(nowMin + 10, 15), 8 * 60);
  const windowEnd = opts.endMin ?? 21 * 60;
  const breakEvery = opts.breakEvery ?? 90;
  const breakLength = opts.breakLength ?? 10;

  const today = todayISO();
  const candidates = db.tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== 'done' &&
      !t.parentId &&
      (t.scheduledFor === today || t.due === today || (t.due && t.due < today)),
  );

  const ranked = rankTasks(db, candidates).filter((s) => s.blockedBy.length === 0);

  const blocks: Block[] = [];
  let cursor = windowStart;
  let sinceBreak = 0;
  const leftOut: Task[] = [];

  for (const s of ranked) {
    const dur = Math.max(15, s.task.effortMins || 30);
    if (cursor + dur > windowEnd) {
      leftOut.push(s.task);
      continue;
    }
    if (sinceBreak >= breakEvery && cursor + breakLength + dur <= windowEnd) {
      blocks.push({
        id: `b_${cursor}`,
        kind: 'break',
        title: 'Break',
        startMin: cursor,
        endMin: cursor + breakLength,
        label: `${formatClock(cursor, time24h)}–${formatClock(cursor + breakLength, time24h)}`,
      });
      cursor += breakLength;
      sinceBreak = 0;
    }
    blocks.push({
      id: `t_${s.task.id}`,
      kind: 'task',
      taskId: s.task.id,
      title: s.task.title,
      startMin: cursor,
      endMin: cursor + dur,
      label: `${formatClock(cursor, time24h)}–${formatClock(cursor + dur, time24h)}`,
    });
    cursor += dur;
    sinceBreak += dur;
  }

  return {
    blocks,
    scheduledMins: blocks.filter((b) => b.kind === 'task').reduce((s, b) => s + (b.endMin - b.startMin), 0),
    availableMins: Math.max(0, windowEnd - windowStart),
    leftOut,
    windowStart,
    windowEnd,
  };
}
