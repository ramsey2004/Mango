import type {
  ActionItem, Reason, Priority, Consequence, ActionKind, ActionCategory,
} from '../../lib/mail-types';
import type { ISODate } from '../../lib/types';
import { daysOut } from './dates';

/* ============================================================
   Urgency and importance, kept apart.

   Collapsing them is the standard mistake and it produces a list
   that is wrong in both directions: a trivial thing due in an
   hour outranks a consequential thing due on Friday, and the
   consequential thing is never seen until it is late.

   Urgency answers "how soon". Importance answers "how much does
   it cost me if I ignore it". Priority is derived from the pair,
   and the derivation is shown to the user in words.
   ============================================================ */

export interface ScoreInput {
  kind: ActionKind;
  category: ActionCategory;
  deadline?: ISODate;
  deadlineText?: string;
  deadlineConfidence: ActionItem['deadlineConfidence'];
  evidence: string;
  subject: string;
  fromEmail: string;
  /** how many previous items have come from this sender */
  senderHistory: number;
  /** true if the user has previously raised priority on this sender */
  senderTrusted: boolean;
  /** threads where the user replied — a sign the relationship is live */
  threadActive: boolean;
  now: Date;
  timezone: string;
}

export interface ScoreResult {
  urgency: number;
  importance: number;
  priority: Priority;
  consequence: Consequence;
  reasons: Reason[];
}

/* ------------------------------- urgency ------------------------------- */

const EXPLICIT_URGENCY: Array<[RegExp, number, string]> = [
  [/\b(asap|immediately|right away|at the earliest|top priority)\b/i, 26, 'Sender said ASAP'],
  [/\burgent(ly)?\b/i, 24, 'Sender said urgent'],
  [/\bcritical\b/i, 22, 'Sender said critical'],
  [/\b(eod|end of day|cob|close of business)\b/i, 20, 'Due by end of day'],
  [/\bbefore (the|our|your) (meeting|call|session|review|class|discussion)\b/i, 16, 'Needed before a meeting'],
  [/\b(final|last) (reminder|call|chance)\b/i, 20, 'Final reminder'],
  [/\b(overdue|past due|still (pending|awaited))\b/i, 18, 'Already overdue in the sender’s view'],
  [/\bgentle reminder|following up|follow(-| )up\b/i, 8, 'Sender has had to chase this'],
];

function urgencyOf(inp: ScoreInput, reasons: Reason[]): number {
  let score = 0;

  const n = daysOut(inp.deadline, inp.now, inp.timezone);
  if (n === null) {
    reasons.push({ label: 'No deadline', delta: 0, detail: 'Nothing in the message fixes a date' });
  } else if (n < 0) {
    const d = Math.min(20, Math.abs(n) * 3);
    score += 52 + d;
    reasons.push({ label: 'Overdue', delta: 52 + d, detail: `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} past the deadline` });
  } else if (n === 0) {
    score += 50;
    reasons.push({ label: 'Due today', delta: 50, detail: inp.deadlineText });
  } else if (n === 1) {
    score += 40;
    reasons.push({ label: 'Due tomorrow', delta: 40, detail: inp.deadlineText });
  } else if (n <= 3) {
    score += 30;
    reasons.push({ label: `Due in ${n} days`, delta: 30, detail: inp.deadlineText });
  } else if (n <= 7) {
    score += 18;
    reasons.push({ label: 'Due this week', delta: 18, detail: inp.deadlineText });
  } else if (n <= 14) {
    score += 9;
    reasons.push({ label: 'Due within a fortnight', delta: 9, detail: inp.deadlineText });
  } else {
    score += 3;
    reasons.push({ label: 'Distant deadline', delta: 3, detail: inp.deadlineText });
  }

  const hay = `${inp.subject} ${inp.evidence}`;
  for (const [re, v, label] of EXPLICIT_URGENCY) {
    if (re.test(hay)) {
      score += v;
      reasons.push({ label, delta: v });
      break;
    }
  }

  // An inferred or ambiguous deadline should not drive the list as hard as a
  // stated one. We are less sure, so we press less.
  if (inp.deadlineConfidence === 'inferred') {
    score *= 0.85;
    reasons.push({ label: 'Deadline inferred, not stated', delta: 0, detail: 'Urgency damped slightly' });
  }
  if (inp.deadlineConfidence === 'ambiguous') {
    score *= 0.7;
    reasons.push({ label: 'Deadline is ambiguous', delta: 0, detail: 'Confirm the date to rank this properly' });
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ------------------------------ importance ----------------------------- */

const CONSEQUENCE_RULES: Array<[RegExp, Consequence, number, string]> = [
  [/\b(payment|invoice|fee|fine|penalty|refund|salary|reimburse|dues|overdue amount|late fee)\b/i, 'financial', 26, 'Money is involved'],
  [/\b(compliance|regulator|audit|legal|statutory|mandatory|policy violation|kyc|tax|gst)\b/i, 'compliance', 28, 'Compliance or legal obligation'],
  [/\b(blocked|blocking|waiting on you|held up|can(')?t proceed|dependency|stuck until)\b/i, 'blocks_others', 24, 'Someone else is blocked on this'],
  [/\b(meeting|call|interview|presentation|session|class)\b/i, 'missed_meeting', 16, 'Tied to a scheduled event'],
  [/\b(deadline|last date|cut-?off|closing date|submission)\b/i, 'missed_deadline', 20, 'A stated deadline exists'],
  [/\b(client|customer|hod|dean|director|principal|professor|recruiter|placement|committee)\b/i, 'relationship', 15, 'Sender relationship matters'],
  [/\b(project|launch|release|milestone|delivery|sprint)\b/i, 'project_delay', 14, 'Attached to delivery work'],
];

const CATEGORY_WEIGHT: Partial<Record<ActionCategory, [number, string]>> = {
  finance: [12, 'Financial matter'],
  approvals: [12, 'Someone is blocked pending approval'],
  academic: [10, 'Academic obligation'],
  meetings: [8, 'Meeting-related'],
  travel: [8, 'Travel arrangements are time-bound'],
  documents: [4, 'Document work'],
  shopping: [-4, 'Shopping and deliveries rarely need you'],
  admin: [2, 'Administrative'],
};

function importanceOf(inp: ScoreInput, reasons: Reason[]): { score: number; consequence: Consequence } {
  let score = 30; // a real obligation starts from a real floor
  reasons.push({ label: BASELINE, delta: 30, detail: kindLabel(inp.kind) });

  const hay = `${inp.subject} ${inp.evidence}`;
  let consequence: Consequence = 'none';
  for (const [re, cons, v, label] of CONSEQUENCE_RULES) {
    if (re.test(hay)) {
      score += v;
      consequence = cons;
      reasons.push({ label, delta: v });
      break;
    }
  }
  if (consequence === 'none' && inp.deadline) consequence = 'missed_deadline';

  const cw = CATEGORY_WEIGHT[inp.category];
  if (cw) {
    score += cw[0];
    reasons.push({ label: cw[1], delta: cw[0] });
  }

  /* Sender signal. Deliberately NOT seniority — a title in a signature is not
     evidence of anything. What we have honest evidence for is whether this
     person and the user actually correspond. */
  if (inp.threadActive) {
    score += 10;
    reasons.push({ label: 'Live conversation', delta: 10, detail: 'You have replied in this thread' });
  }
  if (inp.senderTrusted) {
    score += 12;
    reasons.push({ label: 'You usually raise this sender', delta: 12, detail: 'Learned from your own corrections' });
  } else if (inp.senderHistory >= 5) {
    score += 5;
    reasons.push({ label: 'Frequent correspondent', delta: 5, detail: `${inp.senderHistory} previous items` });
  } else if (inp.senderHistory === 0) {
    score -= 6;
    reasons.push({ label: 'First time this sender has written', delta: -6 });
  }

  if (inp.kind === 'attention') {
    score -= 6;
    reasons.push({ label: 'Needs a read, not an action', delta: -6 });
  }
  if (inp.kind === 'waiting') {
    score -= 10;
    reasons.push({ label: 'Ball is in their court', delta: -10 });
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), consequence };
}

const kindLabel = (k: ActionKind) =>
  k === 'request' ? 'Someone asked you for something'
    : k === 'commitment' ? 'You promised this'
      : k === 'waiting' ? 'You are waiting on someone'
        : 'Worth knowing about';

/* ------------------------------- priority ------------------------------ */

/**
 * The grid. Written out rather than computed so it can be read, argued with,
 * and changed — which is what you want from a rule that decides what a person
 * looks at first thing in the morning.
 */
function derive(urgency: number, importance: number, kind: ActionKind): { priority: Priority; why: string } {
  if (kind === 'waiting') return { priority: 'WAITING', why: 'Nothing for you to do until they reply' };

  if (urgency >= 50 && importance >= 45) return { priority: 'P0', why: 'Due now and consequential' };
  if (urgency >= 65) return { priority: 'P0', why: 'Overdue or due today' };
  if (urgency >= 35 && importance >= 40) return { priority: 'P1', why: 'Due very soon and matters' };
  if (importance >= 65) return { priority: 'P1', why: 'High consequence even without a tight deadline' };
  if (urgency >= 35) return { priority: 'P1', why: 'Deadline is close' };
  if (urgency >= 15 || importance >= 40) return { priority: 'P2', why: 'Worth doing, not today' };
  return { priority: 'P3', why: 'No deadline and low consequence' };
}

export function score(inp: ScoreInput): ScoreResult {
  const urgencyReasons: Reason[] = [];
  const importanceReasons: Reason[] = [];

  const urgency = urgencyOf(inp, urgencyReasons);
  const { score: importance, consequence } = importanceOf(inp, importanceReasons);
  const { priority, why } = derive(urgency, importance, inp.kind);

  const reasons: Reason[] = [
    { label: `Urgency ${urgency}/100`, delta: 0, detail: 'How soon this needs doing' },
    ...urgencyReasons,
    { label: `Importance ${importance}/100`, delta: 0, detail: 'What it costs to ignore' },
    ...importanceReasons,
    { label: `→ ${priority}`, delta: 0, detail: why },
  ];

  return { urgency, importance, priority, consequence, reasons };
}

/** One line the user can read on the card without opening anything. */
/** The flat starting score every obligation gets. True of everything, so it
    distinguishes nothing and must never be the headline. */
const BASELINE = 'It is an actual obligation';

export function whyLine(item: Pick<ActionItem, 'reasons' | 'priority' | 'deadlineText' | 'deadlineConfidence'>): string {
  const strong = item.reasons
    .filter((r) => r.delta >= 14 && r.label !== BASELINE)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((r) => r.label.toLowerCase());
  if (!strong.length) return item.reasons.find((r) => r.label.startsWith('→'))?.detail ?? 'Low urgency, low consequence';
  const tail = item.deadlineConfidence === 'ambiguous' ? ' · deadline needs confirming' : '';
  return `${strong.join(' + ')}${tail}`;
}
