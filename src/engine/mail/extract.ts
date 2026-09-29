import type { RawMessage, ActionKind, ActionCategory } from '../../lib/mail-types';
import { sentences, freshBody } from './clean';
import { parseDeadline, type DeadlineParse } from './dates';

/* ============================================================
   Extraction.

   The hard part of this is not finding requests. It is not
   finding things that merely look like requests. "Thanks for
   sending this" contains a verb and a noun; "let me know if you
   need anything else" is literally an imperative sentence. A
   system that fires on grammar alone produces an inbox-shaped
   task list, which is exactly the thing the feature exists to
   replace.

   So every candidate has to survive three questions in order:
     1. Is this sentence an obligation at all, or courtesy?
     2. Whose obligation is it — mine, or theirs?
     3. Am I actually the addressee, or am I on copy?

   Confidence falls at each step it cannot answer cleanly, and
   below the floor nothing is created.
   ============================================================ */

export interface Candidate {
  kind: ActionKind;
  title: string;
  summary?: string;
  evidence: string;
  deadline: DeadlineParse;
  confidence: number;
  category: ActionCategory;
  /** which rule fired — used to damp patterns the user keeps dismissing */
  patternId: string;
  waitingPerson?: string;
}

/* ------------------------- courtesy, not tasks ------------------------- */

/**
 * Phrases that are socially obligatory and carry no obligation. These are
 * checked FIRST and win outright — a sentence that is pure courtesy never
 * reaches the request patterns, however imperative it looks.
 */
const COURTESY = [
  /^\s*(many )?thanks\b/i,
  /^\s*thank you\b/i,
  /^\s*(much )?appreciated\b/i,
  /\bthanks (for|again)\b/i,
  /\bthank you for\b/i,
  /\blet me know if (you (need|have|want)|there('s| is)|anything)\b/i,
  /\bdo let me know if\b/i,
  /\bfeel free to (reach|ask|get in touch|contact)\b/i,
  /\b(happy|glad) to help\b/i,
  /\bhope (this|that|you|it)\b/i,
  /\b(no|not a) (rush|hurry|problem|worries)\b/i,
  /\bjust (fyi|so you know|keeping you|for your (info|reference))\b/i,
  /\bfor your (information|reference|records)\b/i,
  /\blooking forward\b/i,
  /\b(best|kind) regards\b/i,
  /\bplease (find|see) (the )?attach/i,
  /\bplease ignore\b/i,
  /\bplease do not reply\b/i,
  /\bas discussed\b.{0,20}$/i,
  /\bplease note that\b/i,
];

const isCourtesy = (s: string) => COURTESY.some((re) => re.test(s));

/* --------------------------- request patterns -------------------------- */

/** Someone asking the user to do something. Ordered strongest first. */
const REQUESTS: Array<{ id: string; re: RegExp; base: number }> = [
  { id: 'req.could-you', re: /\b(could|can|would) you (please )?(kindly )?([a-z].{2,120})/i, base: 0.82 },
  { id: 'req.please-verb', re: /\bplease (?!find|see|note|ignore|do not|disregard)([a-z][a-z-]{2,}\b.{0,120})/i, base: 0.86 },
  { id: 'req.need-you', re: /\b(i|we) (need|want|would like|require) (you|your) to ([a-z].{2,120})/i, base: 0.9 },
  { id: 'req.need-from', re: /\b(i|we) (need|require) (the|a|an|your) ([a-z].{2,100}) (from you|by \w+)/i, base: 0.86 },
  { id: 'req.send-me', re: /\b(send|share|forward|email|revert with) (me|us|across|over) (the|a|an|your|those|these)?\s*([a-z].{2,110})/i, base: 0.8 },
  { id: 'req.kindly', re: /\bkindly ([a-z][a-z-]{2,}\b.{0,120})/i, base: 0.85 },
  { id: 'req.requested-to', re: /\b(you are|you're|you were)\s+(?:all\s+|kindly\s+|hereby\s+|requested\s+)?(requested|required|expected|advised) to ([a-z].{2,120})/i, base: 0.9 },
  { id: 'req.need-to', re: /\byou (need to|have to|must|should)\s+([a-z][a-z-]{2,}\b.{0,120})/i, base: 0.84 },
  { id: 'req.awaiting', re: /\b(awaiting|waiting for) your ([a-z].{2,80})/i, base: 0.78 },
  { id: 'req.action-required', re: /\b(action (required|needed)|response (required|needed)|your (approval|sign-?off|confirmation) is (required|needed))\b/i, base: 0.85 },
  { id: 'req.submit-by', re: /\b(submit|complete|fill|register|apply|upload|pay|renew|confirm|approve|sign|review|revert)\b.{0,60}\b(by|before|on or before|deadline)\b/i, base: 0.76 },
  { id: 'req.reminder', re: /\b(reminder|gentle reminder|following up|follow(-| )up)\b.{0,120}/i, base: 0.6 },
  { id: 'req.take-a-look', re: /\b(take a look at|have a look at|look (into|at)|go through|review)\b\s+(the|this|these|those|my|our|attached)?\s*([a-z].{2,100})/i, base: 0.66 },
  { id: 'req.let-us-know-by', re: /\blet (me|us) know\b.{0,40}\b(by|before|latest by)\b/i, base: 0.78 },
  { id: 'req.confirm', re: /\b(please )?(confirm|acknowledge|rsvp)\b.{0,100}/i, base: 0.74 },
];

/** The user promising something. Only meaningful in mail the user sent. */
const COMMITMENTS: Array<{ id: string; re: RegExp; base: number }> = [
  { id: 'com.i-will', re: /\b(i|we)('ll| will| shall) ([a-z].{2,120})/i, base: 0.84 },
  { id: 'com.going-to', re: /\b(i|we)(')?(m| am|'re| are) (going to|about to) ([a-z].{2,120})/i, base: 0.78 },
  { id: 'com.let-you-know', re: /\b(i|we)('ll| will) (let you know|get back to you|revert|update you|follow up|circle back)\b.{0,80}/i, base: 0.86 },
  { id: 'com.by-then', re: /\b(i|we) (can|should be able to) ([a-z].{2,110}) by ([a-z0-9].{1,40})/i, base: 0.7 },
  { id: 'com.on-it', re: /\b(i|we)('ll| will) (send|share|submit|complete|finish|prepare|draft|review|check|look into) ([a-z].{2,110})/i, base: 0.88 },
];

/** The other side promising the user something → the user is now waiting. */
const THEIR_PROMISE: Array<{ id: string; re: RegExp; base: number }> = [
  { id: 'wait.they-will', re: /\b(i|we)('ll| will| shall) (get back to you|revert|let you know|send|share|update you|confirm|check|review|look into|follow up)\b.{0,90}/i, base: 0.82 },
  { id: 'wait.once-i', re: /\bonce (i|we) (have|get|receive|hear|finish|complete)\b.{0,90}/i, base: 0.7 },
  { id: 'wait.working-on', re: /\b(i|we) (am|'m|are|'re) (currently )?(working on|looking into|checking|reviewing)\b.{0,90}/i, base: 0.68 },
  { id: 'wait.will-be-shared', re: /\b(will be|shall be) (shared|sent|circulated|provided|released|announced)\b.{0,80}/i, base: 0.66 },
];

/** Things that matter but are not tasks. §22 — kept out of the task list. */
const ATTENTION: Array<{ id: string; re: RegExp; base: number; cat: ActionCategory }> = [
  { id: 'att.cancelled', re: /\b(meeting|call|session|class|interview|session) (is |has been )?(cancelled|canceled|postponed|rescheduled|moved)\b/i, base: 0.8, cat: 'meetings' },
  { id: 'att.deadline-change', re: /\b(deadline|due date|last date) (has been |is )?(extended|advanced|moved|changed|revised|preponed)\b/i, base: 0.85, cat: 'admin' },
  { id: 'att.decision', re: /\b(we have decided|it has been decided|the decision is|approved|rejected|shortlisted|selected|not selected)\b/i, base: 0.72, cat: 'work' },
  { id: 'att.escalation', re: /\b(escalat|this is urgent|needs immediate attention|critical issue|outage|breach|failed)\b/i, base: 0.78, cat: 'work' },
  { id: 'att.payment', re: /\b(payment (failed|declined|overdue)|invoice (is )?(due|overdue)|balance due|dues pending|fee.{0,20}(due|pending))\b/i, base: 0.84, cat: 'finance' },
];

/* ------------------------------ categories ----------------------------- */

const CATEGORY_HINTS: Array<[ActionCategory, RegExp]> = [
  ['finance', /\b(invoice|payment|salary|fees?|refund|gst|tax|bank|budget|reimburse|expense|billing|emi|premium)\b/i],
  ['academic', /\b(assignment|exam|semester|professor|lecture|course|grade|cgpa|attendance|placement|internship|iim|college|university|syllabus|submission)\b/i],
  ['meetings', /\b(meeting|call|zoom|google meet|teams|calendar|invite|agenda|standup|sync|interview|session)\b/i],
  ['approvals', /\b(approve|approval|sign-?off|authorisation|authorization|sanction|permission|consent)\b/i],
  ['documents', /\b(document|attachment|pdf|report|deck|slides|spreadsheet|contract|agreement|certificate|form)\b/i],
  ['travel', /\b(flight|train|hotel|booking|itinerary|visa|ticket|pnr|check-?in|boarding)\b/i],
  ['shopping', /\b(order|delivery|shipment|courier|tracking|dispatch|return|exchange)\b/i],
  ['admin', /\b(register|renew|update your|kyc|verify|portal|login|password|subscription|policy)\b/i],
  ['follow-up', /\b(follow(-| )?up|reminder|checking in|gentle nudge|circle back)\b/i],
  ['personal', /\b(family|birthday|wedding|holiday|leave|personal|home)\b/i],
];

function categorise(text: string, subject: string, fallback: ActionCategory = 'work'): ActionCategory {
  const hay = `${subject} ${text}`;
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(hay)) return cat;
  return fallback;
}

/* ----------------------------- summarisation --------------------------- */

/** Openers that carry no information and should never survive into a title. */
const FILLER = [
  /^(hi|hello|hey|dear)\b[^,]{0,30},?\s*/i,
  // "In case of any issue, please reach out to me by Friday" — the condition
  // is the circumstance, not the task.
  /^(in case of|in the event of)\b[^,]{0,40},?\s*/i,
  /^(if|should)\s+(you|there|any|it)\b[^,]{0,60},?\s*/i,
  /^(for any|for further)\b[^,]{0,40},?\s*/i,
  /^(to|in order to)\s+[a-z][^,]{3,55},\s*/i,
  /^(as|since|because)\s+(we|you|i|this|that|per)\b[^,]{0,60},\s*/i,
  /^(just|quickly|kindly|simply)\s+/i,
  /^(i was|i am|i'm)\s+(just\s+)?(wondering|checking|hoping)\s+(if|whether)\s+/i,
  /^(wanted|want|wanting)\s+to\s+(check|ask|know)\s+(if|whether)\s+/i,
  /^(would|could|can)\s+you\s+(please\s+)?(kindly\s+)?(possibly\s+)?/i,
  /^(please|pls|plz)\s+(kindly\s+)?/i,
  /^(i|we)\s+(need|want|would like|require)\s+you\s+to\s+/i,
  /^(you are|you're)\s+(requested|required|expected)\s+to\s+/i,
  /^(if\s+possible,?\s*)/i,
  /^(at your earliest convenience,?\s*)/i,
  /^(when you get a chance,?\s*)/i,
  /^(whenever you (get|have) (a|the) (chance|time),?\s*)/i,
  /^(i|we)('ll| will| shall)\s+/i,
  /^you\s+(need to|have to|must|should)\s+/i,
  /^you\s+(are|were)\s+(all\s+|kindly\s+|hereby\s+)?(requested|required|expected|advised)\s+to\s+/i,
  /^(sorry|apologies)[^,]{0,30},?\s*/i,
];

/** Trailing clauses that are the deadline, not the task. */
const TAIL = [
  /\s+\b(by|before|on or before|till|until|no later than|latest by)\b\s+.{1,60}$/i,
  /\s+\b(within)\s+(the\s+)?\d+\s*(hour|hours|day|days|week|weeks)\b.{0,30}$/i,
  /\s+\b(for|ahead of|prior to)\s+(our|the|your)\s+[^,.;]{1,45}$/i,
  /\s+\bas soon as possible\b\.?$/i,
  /\s+\bat your earliest\b[^.]{0,20}$/i,
  /\s+\bif possible\b\.?$/i,
  /\s+\bplease\b\.?$/i,
  // Consequence clauses are the stick, not the task.
  /\s+\b(post which|after which|failing which|thereafter|beyond which)\b.*$/i,
  // A trailing parenthetical that only restates the date.
  /\s+\((scheduled|due|deadline|last date)[^)]*\)?\s*$/i,
  /\s+\bthanks?( a lot| so much)?\b\.?$/i,
];

/**
 * Turn a sentence into something you would write on a to-do list.
 * Deliberately conservative: when reduction would mangle the meaning, it
 * keeps more words rather than producing a confident nonsense title.
 */
export function toTitle(sentence: string): string {
  let s = sentence.trim().replace(/\s+/g, ' ');

  for (let i = 0; i < 4; i++) {
    const before = s;
    for (const re of FILLER) s = s.replace(re, '');
    if (s === before) break;
  }
  // Trailing punctuation has to go first, or a tail clause that ends the
  // sentence ("…before our discussion on Thursday.") never matches and the
  // deadline stays glued to the title.
  s = s.replace(/[\s,;:.!?…]+$/, '');
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const re of TAIL) s = s.replace(re, '');
    s = s.replace(/[\s,;:.!?…]+$/, '');
    if (s === before) break;
  }

  s = s
    .replace(/\b(possibly|kindly|please|just|maybe|perhaps)\b\s*/gi, ' ')
    .replace(/\bacross\b|\bover\b(?=\s+(to|the))/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:.!?]+$/, '')
    .trim();

  if (!s) return sentence.trim().slice(0, 80);

  // "you could send X" → "send X"
  s = s.replace(/^(you\s+(could|can|should|will|may)\s+)/i, '');
  // "sending X" → "send X", so the list reads as instructions
  s = s.replace(/^(\w+?)ing\b/i, (m, stem) => (m.length > 5 ? `${stem}` : m));

  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 90) {
    const cut = s.slice(0, 90);
    const lastSpace = cut.lastIndexOf(' ');
    s = `${cut.slice(0, lastSpace > 50 ? lastSpace : 90)}…`;
  }
  return s;
}

/* ------------------------------ addressing ----------------------------- */

/**
 * Is the user the person expected to act? Being on copy is a real signal —
 * most cc'd requests belong to whoever is on the To line.
 */
function addressedToMe(m: RawMessage): { me: boolean; penalty: number; note?: string } {
  const self = m.selfEmail.toLowerCase();
  const to = m.to.map((x) => x.toLowerCase());
  const cc = m.cc.map((x) => x.toLowerCase());

  if (to.includes(self)) {
    if (to.length > 4) return { me: true, penalty: 0.12, note: `One of ${to.length} direct recipients` };
    return { me: true, penalty: 0 };
  }
  if (cc.includes(self)) return { me: true, penalty: 0.3, note: 'You were on copy, not the To line' };
  // Sent to a list or alias that resolves to the user.
  return { me: true, penalty: 0.2, note: 'Not addressed to you by name' };
}

/* ------------------------------- the pass ------------------------------ */

export interface ExtractOptions {
  timezone: string;
  /** patterns the user has repeatedly dismissed, with a 0–1 damping factor */
  damping?: Record<string, number>;
}

export function extract(m: RawMessage, opts: ExtractOptions): Candidate[] {
  const body = freshBody(m.body);
  const fromMe = m.fromEmail.toLowerCase() === m.selfEmail.toLowerCase();
  const at = new Date(m.internalDate);
  const addr = addressedToMe(m);
  const damp = opts.damping ?? {};

  // The subject line is part of the evidence — "Reminder: submit by Friday"
  // often carries the whole obligation with nothing useful in the body.
  const pool = [m.subject, ...sentences(body)].filter(Boolean);

  const out: Candidate[] = [];
  const seenTitles = new Set<string>();

  for (const raw of pool) {
    const s = raw.trim();
    if (!s || isCourtesy(s)) continue;

    const hit = classify(s, fromMe);
    if (!hit) continue;

    let confidence = hit.base;
    confidence *= damp[hit.id] ?? 1;

    // Direction and addressing adjust confidence, never the classification.
    if (hit.kind === 'request') confidence -= addr.penalty;
    if (hit.kind === 'request' && fromMe) continue; // my own ask of someone else
    if (hit.kind === 'commitment' && !fromMe) continue; // only I can promise for me
    if (hit.kind === 'waiting' && fromMe) continue;

    // A question mark makes a request more likely to be a real ask.
    if (hit.kind === 'request' && /\?\s*$/.test(s)) confidence += 0.04;
    // Very short fragments are usually subject-line noise.
    if (s.length < 12) confidence -= 0.15;
    // A sentence with no verb-like token is probably not an obligation.
    if (!/\b(send|share|submit|complete|review|confirm|approve|prepare|check|update|provide|fill|pay|book|call|reply|revert|attend|join|sign|upload|register|arrange|schedule|draft|finalise|finalize|look|get|make|give|let|do|need|bring|collect|return|forward|respond|read|discuss|meet|follow|remind|chase|nudge|revisit|action)\b/i.test(s)) {
      confidence -= 0.2;
    }

    /* Only let the subject supply a deadline when the subject itself is
       making a claim about time. Otherwise a date that merely identifies the
       message — a session date, an invoice number, a schedule range — gets
       read as a due date, and a brand-new task shows up overdue. */
    const subjectHasCue = /\b(by|before|due|deadline|last date|reminder|expires?|closing|submit|today|tomorrow|asap|urgent)\b/i.test(m.subject);
    const deadline = parseDeadline(subjectHasCue ? `${m.subject} ${s}` : s, at, opts.timezone);
    if (deadline.confidence === 'explicit') confidence += 0.06;

    const title = toTitle(hit.kind === 'waiting' ? `${displayFirstName(m.from)} to ${stripLeadIn(s)}` : s);
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (!key || seenTitles.has(key)) continue;
    seenTitles.add(key);

    out.push({
      kind: hit.kind,
      title,
      summary: addr.note && hit.kind === 'request' ? addr.note : undefined,
      evidence: s.slice(0, 300),
      deadline,
      confidence: Math.max(0, Math.min(1, confidence)),
      category: hit.cat ?? categorise(s, m.subject, hit.kind === 'commitment' ? 'follow-up' : 'work'),
      patternId: hit.id,
      waitingPerson: hit.kind === 'waiting' ? m.from : undefined,
    });
  }

  // One email rarely contains four separate obligations. Keep the strongest
  // few; beyond that we are inventing work.
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

interface Hit { kind: ActionKind; id: string; base: number; cat?: ActionCategory }

function classify(s: string, fromMe: boolean): Hit | null {
  for (const p of ATTENTION) if (p.re.test(s)) return { kind: 'attention', id: p.id, base: p.base, cat: p.cat };

  if (fromMe) {
    for (const p of COMMITMENTS) if (p.re.test(s)) return { kind: 'commitment', id: p.id, base: p.base };
    return null;
  }

  for (const p of THEIR_PROMISE) if (p.re.test(s)) return { kind: 'waiting', id: p.id, base: p.base };
  for (const p of REQUESTS) if (p.re.test(s)) return { kind: 'request', id: p.id, base: p.base };
  return null;
}

const displayFirstName = (from: string) => {
  const name = from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return (name.split(/\s+/)[0] || 'They').replace(/[^A-Za-z-]/g, '') || 'They';
};

const stripLeadIn = (s: string) =>
  s.replace(/^\s*(i|we)('ll| will| shall| am| are|'m|'re)\s*/i, '').replace(/^once\s+(i|we)\s+/i, '');
