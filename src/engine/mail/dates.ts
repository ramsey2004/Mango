import type { ISODate } from '../../lib/types';
import type { DeadlineConfidence } from '../../lib/mail-types';

/* ============================================================
   Deadline intelligence.

   The rule that matters most here is the one about ambiguity.
   "Send this Friday" on a Wednesday means two different days to
   two reasonable people. The wrong answer is to pick one and
   present it as fact; the app then quietly moves a real deadline
   by a week and the user finds out when it is too late.

   So: when a phrase has more than one honest reading, this
   returns BOTH and marks the result ambiguous. The UI asks.
   ============================================================ */

export interface DeadlineParse {
  date?: ISODate;
  /** the words it came from, as the sender wrote them */
  text?: string;
  confidence: DeadlineConfidence;
  /** competing readings, set only when confidence === 'ambiguous' */
  options?: Array<{ date: ISODate; label: string }>;
  /** a time of day was stated, e.g. "by 5pm" */
  timeOfDay?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * "Now", as a plain Y/M/D in the user's zone. Everything downstream is
 * date arithmetic on a local calendar, which is what people mean by
 * "tomorrow" — not a UTC instant.
 */
export function localToday(at: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return new Date(get('year'), get('month') - 1, get('day'));
  } catch {
    return new Date(at.getFullYear(), at.getMonth(), at.getDate());
  }
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DOW_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3,
};

/** Next occurrence of a weekday, strictly after today. */
function nextDow(today: Date, target: number): Date {
  const diff = (target - today.getDay() + 7) % 7;
  return addDays(today, diff === 0 ? 7 : diff);
}

/** The one coming up in the current week, which may be today. */
function thisDow(today: Date, target: number): Date {
  const diff = (target - today.getDay() + 7) % 7;
  return addDays(today, diff);
}

const timeMatch = (s: string): string | undefined => {
  const m = s.match(/\b(?:by|before|at|until|till)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i)
    || s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!m) return undefined;
  const h = m[1];
  const mins = m[2] ? `:${m[2]}` : '';
  return `${h}${mins} ${m[3].replace(/\./g, '').toLowerCase()}`;
};

/**
 * Pull a deadline out of natural language.
 *
 * `at` is when the message arrived, not when the app is running — a mail from
 * Monday saying "by tomorrow" means Tuesday even if it is read on Friday.
 */
export function parseDeadline(text: string, at: Date, timezone: string): DeadlineParse {
  const s = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const today = localToday(at, timezone);
  const t = timeOf(s);

  /* --- explicit calendar dates: "by 20 September", "on 3/10", "20-09-2026" --- */
  const dmy = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[ -/](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:[ -/](\d{4}))?/i);
  if (dmy) {
    const day = Number(dmy[1]);
    const mon = MONTHS.findIndex((m) => m.startsWith(dmy[2].toLowerCase()));
    let year = dmy[3] ? Number(dmy[3]) : today.getFullYear();
    let d = new Date(year, mon, day);
    // "20 September" sent in November means next year, not eleven months ago.
    if (!dmy[3] && d < addDays(today, -7)) { year += 1; d = new Date(year, mon, day); }
    if (valid(d, day, mon)) return { date: iso(d), text: dmy[0].trim(), confidence: 'explicit', timeOfDay: t };
  }

  const mdy = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?/i);
  if (mdy) {
    const mon = MONTHS.findIndex((m) => m.startsWith(mdy[1].toLowerCase()));
    const day = Number(mdy[2]);
    let year = mdy[3] ? Number(mdy[3]) : today.getFullYear();
    let d = new Date(year, mon, day);
    if (!mdy[3] && d < addDays(today, -7)) { year += 1; d = new Date(year, mon, day); }
    if (valid(d, day, mon)) return { date: iso(d), text: mdy[0].trim(), confidence: 'explicit', timeOfDay: t };
  }

  /* --- today / tonight / tomorrow --- */
  if (/\b(eod|end of day|close of business|cob|by end of today|today|tonight|this evening)\b/.test(s)) {
    const word = s.match(/\b(eod|end of day|close of business|cob|today|tonight|this evening)\b/)?.[0] ?? 'today';
    return { date: iso(today), text: word, confidence: 'explicit', timeOfDay: t };
  }
  if (/\b(tomorrow|tmrw|tmr|by morning|first thing tomorrow)\b/.test(s)) {
    return { date: iso(addDays(today, 1)), text: 'tomorrow', confidence: 'explicit', timeOfDay: t };
  }
  if (/\bday after tomorrow\b/.test(s)) {
    return { date: iso(addDays(today, 2)), text: 'day after tomorrow', confidence: 'explicit', timeOfDay: t };
  }

  /* --- "within three days", "in 2 weeks" --- */
  const within = s.match(/\b(?:within|in|over) (?:the )?(?:next )?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)(?: of)? (day|days|week|weeks|month|months|hour|hours)\b/);
  if (within) {
    const n = /^\d+$/.test(within[1]) ? Number(within[1]) : (WORD_NUM[within[1]] ?? 1);
    const unit = within[2];
    const days = unit.startsWith('hour') ? (n >= 24 ? Math.round(n / 24) : 0)
      : unit.startsWith('day') ? n
        : unit.startsWith('week') ? n * 7
          : n * 30;
    return { date: iso(addDays(today, days)), text: within[0].trim(), confidence: 'explicit', timeOfDay: t };
  }

  /* --- weekday names. This is where ambiguity lives. --- */
  const dowRe = new RegExp(
    `\\b(this|next|coming|by|before|on|due)?\\s?(${DOW.join('|')}|${DOW_SHORT.join('|')})\\b`,
  );
  const dm = s.match(dowRe);
  if (dm) {
    const name = dm[2];
    let idx = DOW.indexOf(name);
    if (idx < 0) idx = DOW_SHORT.indexOf(name);
    const qualifier = (dm[1] ?? '').trim();

    if (qualifier === 'next') {
      return { date: iso(nextDow(thisDow(today, idx), idx)), text: dm[0].trim(), confidence: 'explicit', timeOfDay: t };
    }

    const soon = thisDow(today, idx);
    const later = addDays(soon, 7);

    // "this Friday" said ON a Friday, or with days still to run, is clear enough.
    if (qualifier === 'this' || qualifier === 'coming') {
      return { date: iso(soon), text: dm[0].trim(), confidence: 'explicit', timeOfDay: t };
    }
    // A bare or "by" weekday very close to today reads as the imminent one.
    const gap = Math.round((soon.getTime() - today.getTime()) / 86400000);
    if (gap <= 3) {
      return { date: iso(soon), text: dm[0].trim(), confidence: 'inferred', timeOfDay: t };
    }
    // Four or more days out, "Friday" genuinely could be either. Say so.
    return {
      date: iso(soon),
      text: dm[0].trim(),
      confidence: 'ambiguous',
      timeOfDay: t,
      options: [
        { date: iso(soon), label: `This ${cap(DOW[idx])}` },
        { date: iso(later), label: `Next ${cap(DOW[idx])}` },
      ],
    };
  }

  /* --- vaguer windows --- */
  if (/\bend of (the )?week\b/.test(s)) {
    return { date: iso(thisDow(today, 5)), text: 'end of week', confidence: 'inferred', timeOfDay: t };
  }
  if (/\bnext week\b/.test(s)) {
    // Monday of next week is the conventional reading, but it is a reading.
    return { date: iso(nextDow(today, 1)), text: 'next week', confidence: 'inferred', timeOfDay: t };
  }
  if (/\bthis week\b/.test(s)) {
    return { date: iso(thisDow(today, 5)), text: 'this week', confidence: 'inferred', timeOfDay: t };
  }
  if (/\bend of (the )?month\b/.test(s)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { date: iso(d), text: 'end of month', confidence: 'inferred', timeOfDay: t };
  }
  if (/\bnext month\b/.test(s)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { date: iso(d), text: 'next month', confidence: 'inferred', timeOfDay: t };
  }

  /* --- urgency words that imply "now" without naming a day --- */
  if (/\b(asap|as soon as possible|immediately|right away|urgently|at the earliest)\b/.test(s)) {
    return { date: iso(today), text: s.match(/\b(asap|as soon as possible|immediately|right away|urgently|at the earliest)\b/)![0], confidence: 'inferred', timeOfDay: t };
  }

  /* --- anchored to an event we cannot see --- */
  if (/\bbefore (the |our |your )?(meeting|call|session|review|class|discussion|presentation|standup|sync)\b/.test(s)) {
    return { text: s.match(/before (the |our |your )?\w+/)![0].trim(), confidence: 'ambiguous', timeOfDay: t };
  }

  /* --- a bare time today, "by 5pm" --- */
  if (t && /\b(by|before|until|till)\b/.test(s)) {
    return { date: iso(today), text: `by ${t}`, confidence: 'inferred', timeOfDay: t };
  }

  return { confidence: 'none' };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const valid = (d: Date, day: number, mon: number) =>
  mon >= 0 && !Number.isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === mon;

function timeOf(s: string): string | undefined {
  return timeMatch(s);
}

/** Whole days from today to the deadline. Negative means overdue. */
export function daysOut(deadline: ISODate | undefined, at: Date, timezone: string): number | null {
  if (!deadline) return null;
  const today = localToday(at, timezone);
  const [y, m, d] = deadline.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
