import type { DB, Task } from '../lib/types';
import { toISODate, addDays, todayISO, fromISODate } from '../lib/util';

/* ============================================================
   Natural-language quick capture. Local, rule-based, and honest
   about what it understood: the palette shows the parsed fields
   back before anything is created.
   ============================================================ */

export interface Parsed {
  title: string;
  due?: string;
  priorityId?: string;
  effortMins?: number;
  tags: string[];
  areaId?: string;
  goalId?: string;
  projectId?: string;
  /** human-readable list of what was recognised */
  understood: string[];
}

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function nextWeekday(target: number): string {
  const today = new Date();
  let delta = (target - today.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return toISODate(addDays(today, delta));
}

export function parseCapture(input: string, db: DB): Parsed {
  let text = ` ${input} `;
  const understood: string[] = [];
  const tags: string[] = [];
  let due: string | undefined;
  let priorityId: string | undefined;
  let effortMins: number | undefined;
  let areaId: string | undefined;
  let goalId: string | undefined;
  let projectId: string | undefined;

  const eat = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], ' ');
    return m;
  };

  // #tags
  let tagMatch: RegExpMatchArray | null;
  while ((tagMatch = text.match(/\s#([\w-]+)/))) {
    tags.push(tagMatch[1]);
    text = text.replace(tagMatch[0], ' ');
  }
  if (tags.length) understood.push(`Tags: ${tags.join(', ')}`);

  // @area
  const areaAt = text.match(/\s@([\w-]+)/);
  if (areaAt) {
    const found = db.areas.find((a) => a.name.toLowerCase().startsWith(areaAt[1].toLowerCase()));
    if (found) {
      areaId = found.id;
      understood.push(`Area: ${found.name}`);
      text = text.replace(areaAt[0], ' ');
    }
  }

  // duration: 45m / 45 min / 1h / 1h30 / 2 hours
  const dur = eat(/\s(\d+)\s?h(?:ours?|rs?)?\s?(\d+)?\s?m?(?:ins?|inutes?)?\b/i);
  if (dur) {
    effortMins = Number(dur[1]) * 60 + (dur[2] ? Number(dur[2]) : 0);
    understood.push(`Estimate: ${effortMins} min`);
  } else {
    const m = eat(/\s(\d{1,3})\s?m(?:ins?|inutes?)?\b/i);
    if (m) {
      effortMins = Number(m[1]);
      understood.push(`Estimate: ${effortMins} min`);
    }
  }

  // priority words, then bang shorthand
  const levels = [...db.priorities].sort((a, b) => a.rank - b.rank);
  for (const lvl of levels) {
    const re = new RegExp(`\\s${lvl.name.toLowerCase()}(?:\\s+priority)?\\b`, 'i');
    if (re.test(text)) {
      priorityId = lvl.id;
      understood.push(`Priority: ${lvl.name}`);
      text = text.replace(re, ' ');
      break;
    }
  }
  if (!priorityId) {
    const bang = eat(/\s(!{1,3})(?=\s)/);
    if (bang) {
      const idx = Math.min(levels.length - 1, 3 - bang[1].length);
      priorityId = levels[idx]?.id;
      understood.push(`Priority: ${levels[idx]?.name}`);
    }
  }

  // relative days
  if (/\btoday\b|\btonight\b/i.test(text)) {
    due = todayISO();
    text = text.replace(/\b(today|tonight)\b/i, ' ');
    understood.push('Due: today');
  } else if (/\btomorrow\b|\btmrw\b/i.test(text)) {
    due = toISODate(addDays(new Date(), 1));
    text = text.replace(/\b(tomorrow|tmrw)\b/i, ' ');
    understood.push('Due: tomorrow');
  } else {
    const inDays = eat(/\sin\s(\d{1,3})\s(day|days|week|weeks|month|months)\b/i);
    if (inDays) {
      const n = Number(inDays[1]);
      const unit = inDays[2].toLowerCase();
      const mult = unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1;
      due = toISODate(addDays(new Date(), n * mult));
      understood.push(`Due: in ${n} ${unit}`);
    } else {
      const dowIdx = DOW.findIndex((d) => new RegExp(`\\b(next\\s+)?${d}\\b`, 'i').test(text));
      if (dowIdx >= 0) {
        due = nextWeekday(dowIdx);
        text = text.replace(new RegExp(`\\b(next\\s+)?${DOW[dowIdx]}\\b`, 'i'), ' ');
        understood.push(`Due: ${DOW[dowIdx][0].toUpperCase()}${DOW[dowIdx].slice(1)} (${due})`);
      } else {
        // 12 Sep / Sep 12 / 12/09 / 12-09-2026
        const dm = eat(/\s(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
        if (dm) {
          const day = Number(dm[1]);
          const mon = Number(dm[2]) - 1;
          const yr = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : new Date().getFullYear();
          const cand = new Date(yr, mon, day);
          if (!Number.isNaN(cand.getTime())) {
            due = toISODate(cand);
            understood.push(`Due: ${due}`);
          }
        } else {
          const md = eat(new RegExp(`\\s(?:(\\d{1,2})\\s)?(${MON.join('|')})[a-z]*\\.?\\s?(\\d{1,2})?\\b`, 'i'));
          if (md && (md[1] || md[3])) {
            const day = Number(md[1] ?? md[3]);
            const mon = MON.indexOf(md[2].toLowerCase().slice(0, 3));
            const y = new Date().getFullYear();
            let cand = new Date(y, mon, day);
            if (toISODate(cand) < todayISO()) cand = new Date(y + 1, mon, day);
            due = toISODate(cand);
            understood.push(`Due: ${due}`);
          }
        }
      }
    }
  }

  // "for <goal or project name>"
  const forMatch = text.match(/\sfor\s+(.{3,60}?)\s*$/i);
  if (forMatch) {
    const needle = forMatch[1].trim().toLowerCase();
    const g = db.goals.find((x) => x.name.toLowerCase().includes(needle));
    const p = db.projects.find((x) => x.name.toLowerCase().includes(needle));
    if (g) {
      goalId = g.id;
      areaId ||= g.areaId;
      understood.push(`Goal: ${g.name}`);
      text = text.replace(forMatch[0], ' ');
    } else if (p) {
      projectId = p.id;
      goalId ||= p.goalId;
      areaId ||= p.areaId;
      understood.push(`Project: ${p.name}`);
      text = text.replace(forMatch[0], ' ');
    }
  }

  const title = text.replace(/\s+/g, ' ').trim().replace(/^[-–—:,]\s*/, '');

  return { title: title || input.trim(), due, priorityId, effortMins, tags, areaId, goalId, projectId, understood };
}

export const parsedToTask = (p: Parsed): Partial<Task> => ({
  title: p.title,
  due: p.due,
  scheduledFor: p.due === todayISO() ? p.due : undefined,
  priorityId: p.priorityId,
  effortMins: p.effortMins,
  tags: p.tags,
  areaId: p.areaId,
  goalId: p.goalId,
  projectId: p.projectId,
});
