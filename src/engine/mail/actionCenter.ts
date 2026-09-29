import type { ActionItem, MailState, Priority, ActionCategory } from '../../lib/mail-types';
import type { DB } from '../../lib/types';
import { daysOut } from './dates';

/* ============================================================
   The selectors behind the Action Center.

   Everything the UI shows is derived here so that the same
   question asked from a card, the brief, or a search returns the
   same answer. Nothing in this file mutates state.
   ============================================================ */

export const isLive = (i: ActionItem) =>
  i.status !== 'done' && i.status !== 'cancelled'
  && !(i.status === 'snoozed' && i.snoozedUntil && new Date(i.snoozedUntil) > new Date());

/** Snoozed items whose time has come are live again, silently. */
export const wokenUp = (items: ActionItem[], at = new Date()) =>
  items.map((i) =>
    i.status === 'snoozed' && i.snoozedUntil && new Date(i.snoozedUntil) <= at
      ? { ...i, status: 'todo' as const, snoozedUntil: undefined }
      : i,
  );

export interface Buckets {
  mustDo: ActionItem[];
  shouldDo: ActionItem[];
  canDo: ActionItem[];
  waitingFor: ActionItem[];
  upcoming: ActionItem[];
  needsAttention: ActionItem[];
  /** extracted but not yet accepted — below the auto-create line */
  suggestions: ActionItem[];
}

const byUrgency = (a: ActionItem, b: ActionItem) => {
  const p = ORDER[a.priority] - ORDER[b.priority];
  if (p !== 0) return p;
  if (b.urgency !== a.urgency) return b.urgency - a.urgency;
  return b.importance - a.importance;
};

const ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, WAITING: 4 };

export function buckets(mail: MailState, at = new Date()): Buckets {
  const tz = mail.settings.timezone;
  const live = wokenUp(mail.items, at).filter(isLive);

  const tasks = live.filter((i) => i.kind === 'request' || i.kind === 'commitment');
  const accepted = tasks.filter((i) => i.status !== 'inbox');
  const suggestions = tasks.filter((i) => i.status === 'inbox').sort(byUrgency);

  const due = (i: ActionItem) => daysOut(i.deadline, at, tz);

  const mustDo = accepted.filter((i) => i.priority === 'P0' || (due(i) ?? 99) <= 0).sort(byUrgency);
  const rest = accepted.filter((i) => !mustDo.includes(i));
  const shouldDo = rest.filter((i) => i.priority === 'P1' || (due(i) ?? 99) <= 2).sort(byUrgency);
  const canDo = rest.filter((i) => !shouldDo.includes(i) && ((due(i) ?? 99) <= 7 || i.priority === 'P2')).sort(byUrgency);
  const upcoming = rest
    .filter((i) => !shouldDo.includes(i) && !canDo.includes(i))
    .sort((a, b) => (due(a) ?? 999) - (due(b) ?? 999));

  return {
    mustDo,
    shouldDo,
    canDo,
    waitingFor: live.filter((i) => i.kind === 'waiting').sort((a, b) => waitingDays(b, at) - waitingDays(a, at)),
    upcoming,
    needsAttention: live.filter((i) => i.kind === 'attention').sort(byUrgency),
    suggestions,
  };
}

export const waitingDays = (i: ActionItem, at = new Date()) =>
  Math.floor((at.getTime() - new Date(i.waitingOn?.since ?? i.createdAt).getTime()) / 86400000);

/* ---------------------------- follow-up timing --------------------------- */

/**
 * When is chasing reasonable? Nagging someone after a day is worse than not
 * having the tracker at all, so the threshold moves with what was promised
 * and with how consequential the thing is.
 */
export function followUpDue(i: ActionItem, at = new Date(), tz = 'Asia/Kolkata'): { due: boolean; why: string } {
  const waited = waitingDays(i, at);
  const expected = daysOut(i.waitingOn?.expected, at, tz);

  if (expected !== null && expected < 0) {
    return { due: true, why: `They said ${i.deadlineText ?? 'a date'} and that has passed` };
  }
  if (expected !== null) return { due: false, why: `They said ${i.deadlineText ?? 'they would come back'}` };

  const threshold = i.importance >= 60 ? 2 : i.importance >= 40 ? 4 : 7;
  if (waited >= threshold) {
    return { due: true, why: `${waited} days with no reply` };
  }
  return { due: false, why: `Waiting ${waited} day${waited === 1 ? '' : 's'} — give it a little longer` };
}

/* ------------------------------ the brief ------------------------------- */

export interface Brief {
  greeting: string;
  counts: { urgent: number; important: number; waiting: number; meetings: number; overdue: number };
  top: ActionItem[];
  waiting: Array<{ item: ActionItem; days: number; due: boolean; why: string }>;
  meetings: MeetingPrep[];
  /** true when there is genuinely nothing to say */
  quiet: boolean;
}

export function brief(db: DB, at = new Date()): Brief {
  const mail = db.mail;
  const b = buckets(mail, at);
  const tz = mail.settings.timezone;
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(at));
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  const overdue = b.mustDo.filter((i) => (daysOut(i.deadline, at, tz) ?? 99) < 0).length;
  const meetings = meetingPrep(db, at);

  const waiting = b.waitingFor.map((item) => {
    const f = followUpDue(item, at, tz);
    return { item, days: waitingDays(item, at), due: f.due, why: f.why };
  });

  return {
    greeting,
    counts: {
      urgent: b.mustDo.length,
      important: b.shouldDo.length,
      waiting: b.waitingFor.length,
      meetings: meetings.length,
      overdue,
    },
    top: [...b.mustDo, ...b.shouldDo].slice(0, 5),
    waiting: waiting.filter((w) => w.due).slice(0, 5),
    meetings,
    quiet: !b.mustDo.length && !b.shouldDo.length && !waiting.some((w) => w.due) && !meetings.length,
  };
}

/* -------------------------- meeting intelligence ------------------------ */

export interface MeetingPrep {
  title: string;
  when: string;
  date: string;
  /** open items from the same people or thread */
  related: ActionItem[];
  /** things the user said they would bring or do */
  commitments: ActionItem[];
  /** unanswered questions from the thread */
  waiting: ActionItem[];
}

/**
 * Mango has no external calendar, so "meetings" are the meeting-shaped things
 * it genuinely knows about: items extracted from email that name a scheduled
 * event, and tasks the user scheduled for that day. That is a narrower claim
 * than "calendar integration" and it is the honest one.
 */
export function meetingPrep(db: DB, at = new Date(), horizonDays = 2): MeetingPrep[] {
  const mail = db.mail;
  const tz = mail.settings.timezone;
  const live = wokenUp(mail.items, at).filter(isLive);

  const events = live.filter(
    (i) =>
      i.category === 'meetings'
      && i.deadline
      && (daysOut(i.deadline, at, tz) ?? 99) >= 0
      && (daysOut(i.deadline, at, tz) ?? 99) <= horizonDays,
  );

  const seen = new Set<string>();
  const out: MeetingPrep[] = [];

  for (const ev of events) {
    const key = `${ev.source.threadId}|${ev.deadline}`;
    if (seen.has(key)) continue;
    seen.add(key);

    /* What belongs on a preparation list is what is actually due by the time
       the meeting starts — not everything this person has ever asked for.
       Same thread always counts; same sender counts only if it is due on or
       before the meeting. Without that second clause a prolific colleague
       turns every meeting into a dump of their whole correspondence. */
    const related = live.filter((i) => {
      if (i.id === ev.id || i.kind === 'attention') return false;
      if (i.source.threadId === ev.source.threadId) return true;
      if (i.source.fromEmail !== ev.source.fromEmail) return false;
      return !!i.deadline && i.deadline <= ev.deadline!;
    });

    const d = daysOut(ev.deadline, at, tz) ?? 0;
    out.push({
      title: ev.source.subject || ev.title,
      when: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`,
      date: ev.deadline!,
      related: related.filter((i) => i.kind === 'request'),
      commitments: related.filter((i) => i.kind === 'commitment'),
      waiting: related.filter((i) => i.kind === 'waiting'),
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------ NL search ------------------------------- */

export interface SearchQuery {
  text: string;
  kinds?: ActionItem['kind'][];
  priorities?: Priority[];
  categories?: ActionCategory[];
  person?: string;
  overdue?: boolean;
  dueWithinDays?: number;
  statuses?: ActionItem['status'][];
  /** what we understood, shown back so the user can see we got it right */
  interpreted: string[];
}

/**
 * Translate "things I need to send this week" into filters. The point is not
 * cleverness; it is that the user sees the filters it chose and can correct
 * them, rather than getting a mystery result set.
 */
export function parseQuery(q: string): SearchQuery {
  const s = q.toLowerCase();
  const out: SearchQuery = { text: q.trim(), interpreted: [] };
  let rest = s;

  const take = (re: RegExp, label: string, apply: (m: RegExpMatchArray) => void) => {
    const m = rest.match(re);
    if (m) { apply(m); out.interpreted.push(label); rest = rest.replace(re, ' '); }
  };

  take(/\b(overdue|late|past due)\b/, 'overdue', () => { out.overdue = true; });
  take(/\b(today|due today)\b/, 'due today', () => { out.dueWithinDays = 0; });
  take(/\btomorrow\b/, 'due tomorrow', () => { out.dueWithinDays = 1; });
  take(/\bthis week\b/, 'due within 7 days', () => { out.dueWithinDays = 7; });
  take(/\bnext week\b/, 'due within 14 days', () => { out.dueWithinDays = 14; });

  // The person is read off the ORIGINAL words: "waiting on Rahul" carries both
  // a kind and a name, and consuming the phrase for one loses the other.
  const who = s.match(/\b(?:waiting (?:on|for)|blocked on|chasing|from|by|with)\s+([a-z][a-z.'-]{1,24})\b/);
  if (who && !['me', 'you', 'us', 'them', 'someone', 'anyone', 'today', 'tomorrow'].includes(who[1])) {
    out.person = who[1];
    out.interpreted.push(`person “${who[1]}”`);
    rest = rest.replace(new RegExp(`\\b${who[1]}\\b`), ' ');
  }

  take(/\b(waiting (on|for)|blocked on|chasing)\b/, 'waiting on someone', () => { out.kinds = ['waiting']; });
  take(/\b(i (promised|committed|said i'?d)|my commitments?|promised to)\b/, 'your commitments', () => { out.kinds = ['commitment']; });
  take(/\b(i need to |things i need to |need to )\b/, 'your tasks', () => { out.kinds = ['request', 'commitment']; });
  take(/\b(high priority|urgent|critical|important)\b/, 'high priority', () => { out.priorities = ['P0', 'P1']; });
  take(/\b(done|completed|finished)\b/, 'completed', () => { out.statuses = ['done']; });

  const CATS: Array<[ActionCategory, RegExp]> = [
    ['finance', /\b(finance|money|payment|invoice|fees?)\b/],
    ['academic', /\b(academic|college|class|assignment|exam)\b/],
    ['meetings', /\b(meetings?|calls?)\b/],
    ['approvals', /\b(approvals?|sign-?off)\b/],
    ['work', /\b(work|office)\b/],
    ['personal', /\bpersonal\b/],
    ['travel', /\btravel\b/],
    ['documents', /\b(documents?|reports?|decks?)\b/],
  ];
  for (const [cat, re] of CATS) {
    if (re.test(rest)) { out.categories = [...(out.categories ?? []), cat]; out.interpreted.push(cat); rest = rest.replace(re, ' '); }
  }

  // Whatever is left is a plain text match.
  out.text = rest.replace(/\b(things?|tasks?|items?|stuff|show|find|list|all|the|my|me|i|to|on|for|about|related|any|which|what)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (out.text) out.interpreted.push(`text “${out.text}”`);

  return out;
}

export function search(items: ActionItem[], q: SearchQuery, at = new Date(), tz = 'Asia/Kolkata'): ActionItem[] {
  return items.filter((i) => {
    if (q.statuses) { if (!q.statuses.includes(i.status)) return false; } else if (!isLive(i)) return false;
    if (q.kinds && !q.kinds.includes(i.kind)) return false;
    if (q.priorities && !q.priorities.includes(i.priority)) return false;
    if (q.categories && !q.categories.includes(i.category)) return false;
    if (q.person) {
      const hay = `${i.source.from} ${i.source.fromEmail} ${i.waitingOn?.person ?? ''}`.toLowerCase();
      if (!hay.includes(q.person)) return false;
    }
    const n = daysOut(i.deadline, at, tz);
    if (q.overdue && !(n !== null && n < 0)) return false;
    if (q.dueWithinDays !== undefined && !(n !== null && n <= q.dueWithinDays)) return false;
    if (q.text) {
      const hay = `${i.title} ${i.summary ?? ''} ${i.source.subject} ${i.source.from} ${i.source.evidence}`.toLowerCase();
      if (!q.text.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }).sort(byUrgency);
}

/* ------------------------- notification decisions ----------------------- */

export interface Alert { id: string; title: string; body: string; tone: 'info' | 'warning' | 'critical' }

/**
 * What is worth interrupting someone for. The bar is deliberately high:
 * an extracted task is not an event, it is a row in a list.
 */
export function alerts(db: DB, at = new Date()): Alert[] {
  const mail = db.mail;
  const tz = mail.settings.timezone;
  const b = buckets(mail, at);
  const out: Alert[] = [];

  const overdue = b.mustDo.filter((i) => (daysOut(i.deadline, at, tz) ?? 99) < 0);
  if (overdue.length) {
    out.push({
      id: 'mail.overdue',
      title: `${overdue.length} overdue`,
      body: overdue.slice(0, 3).map((i) => i.title).join(' · '),
      tone: 'critical',
    });
  }

  const p0Today = b.mustDo.filter((i) => (daysOut(i.deadline, at, tz) ?? 99) === 0);
  if (p0Today.length) {
    out.push({
      id: 'mail.today',
      title: `${p0Today.length} due today`,
      body: p0Today.slice(0, 3).map((i) => i.title).join(' · '),
      tone: 'warning',
    });
  }

  const chase = b.waitingFor.filter((i) => followUpDue(i, at, tz).due);
  if (chase.length) {
    out.push({
      id: 'mail.followup',
      title: `${chase.length} follow-up${chase.length === 1 ? '' : 's'} due`,
      body: chase.slice(0, 3).map((i) => `${i.waitingOn?.person ?? 'Someone'} — ${i.title}`).join(' · '),
      tone: 'info',
    });
  }

  const prep = meetingPrep(db, at, 1).filter((m) => m.related.length + m.commitments.length > 0);
  for (const m of prep) {
    out.push({
      id: `mail.meeting.${m.date}`,
      title: `${m.when}: ${m.title}`,
      body: `${m.related.length + m.commitments.length} open item${m.related.length + m.commitments.length === 1 ? '' : 's'} to sort out first`,
      tone: 'warning',
    });
  }

  return out;
}
