import type { RawMessage } from '../src/lib/mail-types';
import { emptyMail } from '../src/lib/mail-types';
import { extract } from '../src/engine/mail/extract';
import { whyLine } from '../src/engine/mail/score';
import { parseDeadline } from '../src/engine/mail/dates';
import { ingest } from '../src/engine/mail/ingest';
import { buckets, parseQuery, search, followUpDue, waitingDays } from '../src/engine/mail/actionCenter';
import { freshBody, sentences, isBulk } from '../src/engine/mail/clean';

/* ============================================================
   Extraction probe.

   Same discipline as the nutrition safety probe: it measures the
   misses AND the false positives, and neither is allowed to be
   non-zero. A system that turns every email into a task is not a
   productivity feature, it is a second inbox.

   The wording here is deliberately NOT the wording the patterns
   were written from — polite Indian business English, hedged
   requests, subject-line-only obligations, and the courtesy
   phrases that look exactly like instructions.
   ============================================================ */

const TZ = 'Asia/Kolkata';
/* A Wednesday, so "Friday" is 2 days out and "Monday" is 5 — which is what
   makes the this/next ambiguity testable rather than theoretical. */
const WED = new Date('2026-09-09T09:00:00+05:30');

let failures = 0;
const fail = (what: string, detail: string) => { failures++; console.log(`  FAIL ${what}\n       ${detail}`); };

const msg = (over: Partial<RawMessage>): RawMessage => ({
  id: `m_${Math.random().toString(36).slice(2, 9)}`,
  threadId: 't_1',
  labelIds: ['INBOX'],
  internalDate: WED.getTime(),
  from: 'Priya Nair <priya@acme.co.in>',
  fromEmail: 'priya@acme.co.in',
  to: ['ram@example.com'],
  cc: [],
  subject: 'Proposal',
  body: '',
  snippet: '',
  selfEmail: 'ram@example.com',
  ...over,
});

const run = (m: Partial<RawMessage>) => extract(msg(m), { timezone: TZ });

/* ------------------------------------------------------------------
   1. Actionability — the cases from the brief, plus the ones that
      break naive implementations.
   ------------------------------------------------------------------ */

console.log('\n1. ACTIONABILITY');

const MUST_EXTRACT: Array<[string, string, string]> = [
  ['explicit request', 'Please send me the revised proposal by Thursday.', 'request'],
  ['soft request', 'Can you take a look at this whenever you get a chance?', 'request'],
  ['hedged request', 'Hey, just wanted to check if you could possibly send across the revised financial model with the updated assumptions before our discussion on Thursday.', 'request'],
  ['indian-english kindly', 'Kindly revert with the signed copy at the earliest.', 'request'],
  ['requirement', 'We need you to confirm your attendance for the session.', 'request'],
  ['deadline imperative', 'Please submit the assignment before 20 September.', 'request'],
  ['subject only', 'Anything at all in the body.', 'request'],
  ['approval ask', 'Your approval is required on the marketing budget.', 'request'],
  ['chase', 'Gentle reminder — following up on the vendor quotation.', 'request'],
  ['action required', 'Action required: complete your KYC before the deadline.', 'request'],
];

for (const [label, body, kind] of MUST_EXTRACT) {
  const subject = label === 'subject only' ? 'Reminder: please submit the fee receipt by Friday' : 'Proposal';
  const got = run({ body, subject });
  if (!got.length) fail(`missed — ${label}`, `"${body.slice(0, 70)}"`);
  else if (got[0].kind !== kind) fail(`wrong kind — ${label}`, `got ${got[0].kind}, expected ${kind}`);
}

const MUST_NOT_EXTRACT: Array<[string, string]> = [
  ['pure thanks', 'Thanks for sending this.'],
  ['closing courtesy', 'Let me know if you need anything else.'],
  ['offer of help', 'Do let me know if you have any questions, happy to help.'],
  ['fyi', 'Just FYI — the minutes are attached for your reference.'],
  ['please find attached', 'Please find attached the deck from yesterday.'],
  ['pleasantry', 'Hope you are doing well. Looking forward to catching up soon.'],
  ['no rush', 'No rush on this at all, whenever you get time is fine.'],
  ['acknowledgement', 'Noted with thanks. Regards, Priya'],
  ['disclaimer only', 'This e-mail and any attachments are confidential. If received in error please notify the sender immediately and delete it.'],
];

for (const [label, body] of MUST_NOT_EXTRACT) {
  const got = run({ body, subject: 'Re: yesterday' });
  if (got.length) fail(`false positive — ${label}`, `created "${got[0].title}" from "${body.slice(0, 60)}"`);
}

/* Bulk mail must never reach extraction at all. */
const BULK = [
  { 'list-unsubscribe': '<https://x.com/u>' },
  { precedence: 'bulk' },
  { 'auto-submitted': 'auto-generated' },
];
for (const h of BULK) {
  if (!isBulk(h as Record<string, string>, 'someone@real.com')) fail('bulk not detected', JSON.stringify(h));
}
if (!isBulk({}, 'no-reply@notifications.example.com')) fail('bulk not detected', 'no-reply address');
if (isBulk({}, 'priya@acme.co.in')) fail('real person flagged as bulk', 'priya@acme.co.in');

/* ------------------------------------------------------------------
   2. Direction — whose obligation is it?
   ------------------------------------------------------------------ */

console.log('2. DIRECTION');

const mine = run({
  from: 'Ram <ram@example.com>', fromEmail: 'ram@example.com',
  to: ['priya@acme.co.in'],
  body: "I'll send the report tomorrow.",
});
if (!mine.length || mine[0].kind !== 'commitment') {
  fail('own commitment not detected', `got ${mine[0]?.kind ?? 'nothing'}`);
} else if (!mine[0].deadline.date) {
  fail('commitment has no deadline', '"tomorrow" should resolve');
}

const theirs = run({ body: "I'll review it and get back to you by Monday." });
if (!theirs.length || theirs[0].kind !== 'waiting') {
  fail('waiting-for not detected', `got ${theirs[0]?.kind ?? 'nothing'}`);
}

const myAsk = run({
  from: 'Ram <ram@example.com>', fromEmail: 'ram@example.com',
  to: ['priya@acme.co.in'],
  body: 'Please send me the invoice.',
});
if (myAsk.some((c) => c.kind === 'request')) {
  fail('my own ask became my task', 'a request I sent is not a request of me');
}

/* Being on copy should lower confidence, not raise a task to the same level. */
const direct = run({ body: 'Please prepare the summary for the board.', to: ['ram@example.com'], cc: [] });
const copied = run({ body: 'Please prepare the summary for the board.', to: ['other@acme.co.in'], cc: ['ram@example.com'] });
if (direct[0] && copied[0] && copied[0].confidence >= direct[0].confidence) {
  fail('cc not discounted', `direct ${direct[0].confidence.toFixed(2)} vs cc ${copied[0].confidence.toFixed(2)}`);
}

/* ------------------------------------------------------------------
   3. Deadlines
   ------------------------------------------------------------------ */

console.log('3. DEADLINES');

const D: Array<[string, string | null, string]> = [
  ['please reply by today', '2026-09-09', 'explicit'],
  ['send it by EOD', '2026-09-09', 'explicit'],
  ['I need it tomorrow', '2026-09-10', 'explicit'],
  ['submit before Friday', '2026-09-11', 'inferred'],
  ['due next Monday', '2026-09-21', 'explicit'],
  ['by 20 September', '2026-09-20', 'explicit'],
  ['by Sep 20', '2026-09-20', 'explicit'],
  ['within three days', '2026-09-12', 'explicit'],
  ['in 2 weeks', '2026-09-23', 'explicit'],
  ['by end of the week', '2026-09-11', 'inferred'],
  ['sometime next week', '2026-09-14', 'inferred'],
  ['please do this ASAP', '2026-09-09', 'inferred'],
  ['no date mentioned at all here', null, 'none'],
];

for (const [text, expect, conf] of D) {
  const p = parseDeadline(text, WED, TZ);
  if ((p.date ?? null) !== expect) fail(`deadline — "${text}"`, `got ${p.date ?? 'none'}, expected ${expect ?? 'none'}`);
  if (p.confidence !== conf) fail(`deadline confidence — "${text}"`, `got ${p.confidence}, expected ${conf}`);
}

/* The ambiguity case: on a Wednesday, "Tuesday" is 6 days out and could
   reasonably mean either week. It must NOT silently pick one. */
const amb = parseDeadline('can you send it on Tuesday', WED, TZ);
if (amb.confidence !== 'ambiguous') fail('ambiguity not flagged', `"on Tuesday" came back ${amb.confidence}`);
if (!amb.options || amb.options.length !== 2) fail('ambiguity has no options', 'the user cannot correct it');

/* An event-anchored deadline is honest about not knowing the date. */
const evt = parseDeadline('please review before the meeting', WED, TZ);
if (evt.date) fail('invented a date', `"before the meeting" resolved to ${evt.date}`);
if (evt.confidence !== 'ambiguous') fail('event anchor not flagged', evt.confidence);

/* A time of day is captured without becoming a different day. */
const t5 = parseDeadline('please send by 5pm', WED, TZ);
if (t5.date !== '2026-09-09' || t5.timeOfDay !== '5 pm') fail('time of day', `${t5.date} / ${t5.timeOfDay}`);

/* Deadlines resolve against when the mail ARRIVED, not when it is read. */
const old = parseDeadline('by tomorrow', new Date('2026-09-01T10:00:00+05:30'), TZ);
if (old.date !== '2026-09-02') fail('deadline not anchored to arrival', `got ${old.date}`);

/* ------------------------------------------------------------------
   4. Cleaning — quoted history and signatures must not produce tasks
   ------------------------------------------------------------------ */

console.log('4. CLEANING');

const threaded = `Sure, noted.

On Tue, 8 Sep 2026 at 14:02, Priya Nair <priya@acme.co.in> wrote:
> Please send me the signed agreement urgently by tomorrow.
> Also kindly confirm the payment.

--
Ram Tiwari
Sent from my iPhone`;

const cleaned = freshBody(threaded);
if (/signed agreement/i.test(cleaned)) fail('quoted history kept', 'a reply would re-create the original ask');
if (/iPhone/i.test(cleaned)) fail('signature kept', cleaned.slice(0, 60));

const fromQuote = run({ body: threaded });
if (fromQuote.some((c) => /agreement|payment/i.test(c.title))) {
  fail('task from quoted text', fromQuote.map((c) => c.title).join(' / '));
}

/* Abbreviations must not split sentences and lose the deadline. */
const ss = sentences('Please send it by 5 p.m. today. Thanks.');
if (!ss.some((s) => /5 p\.m\. today/.test(s))) fail('sentence split on abbreviation', JSON.stringify(ss));

/* ------------------------------------------------------------------
   5. Titles
   ------------------------------------------------------------------ */

console.log('5. TITLES');

const hedged = run({
  body: 'Hey, just wanted to check if you could possibly send across the revised financial model with the updated assumptions before our discussion on Thursday.',
})[0];
if (!hedged) fail('hedged request lost', '');
else {
  const t = hedged.title.toLowerCase();
  if (t.length > 70) fail('title too long', hedged.title);
  if (!/revised financial model/.test(t)) fail('title lost the subject', hedged.title);
  if (/just wanted|possibly|could you|hey/.test(t)) fail('title kept filler', hedged.title);
  if (/thursday/.test(t)) fail('title kept the deadline clause', hedged.title);
}

/* ------------------------------------------------------------------
   6. Priority — urgency and importance must not collapse
   ------------------------------------------------------------------ */

console.log('6. PRIORITY');

const state = { items: [], corrections: [], settings: emptyMail().settings };

const one = (body: string, over: Partial<RawMessage> = {}) =>
  ingest([msg({ body, ...over })], state, WED).items[0];

const overdueItem = one('Please clear the pending invoice, payment was due last week.', {
  internalDate: new Date('2026-09-01T09:00:00+05:30').getTime(),
  body: 'Please clear the pending invoice by 3 September.',
});
if (overdueItem && overdueItem.priority !== 'P0') fail('overdue not P0', `${overdueItem.priority} (u${overdueItem.urgency}/i${overdueItem.importance})`);

const trivialSoon = one('Can you take a look at the poster today when free?');
const weightyLater = one('Please complete the mandatory compliance audit submission by 30 September.');
if (trivialSoon && weightyLater) {
  if (!(weightyLater.importance > trivialSoon.importance)) {
    fail('importance collapsed into urgency', `compliance ${weightyLater.importance} vs poster ${trivialSoon.importance}`);
  }
  if (!(trivialSoon.urgency > weightyLater.urgency)) {
    fail('urgency collapsed into importance', `poster ${trivialSoon.urgency} vs compliance ${weightyLater.urgency}`);
  }
}

const noDeadline = one('Could you review the draft at some point?');
if (noDeadline && !['P2', 'P3'].includes(noDeadline.priority)) {
  fail('no-deadline request over-ranked', noDeadline.priority);
}

/* The one-line explanation must say something that distinguishes THIS item.
   Every obligation gets the same flat starting score, so leading with it is
   the same as saying nothing. */
{
  for (const it of [overdueItem, trivialSoon, weightyLater].filter(Boolean)) {
    const line = whyLine(it!);
    if (/actual obligation/i.test(line)) fail('why-line is generic', `"${line}" for "${it!.title}"`);
    if (!line.trim()) fail('why-line empty', it!.title);
  }
  const a = whyLine(overdueItem!);
  const b = whyLine(trivialSoon!);
  if (a === b) fail('why-line does not distinguish', `both say "${a}"`);
  console.log(`  overdue invoice  → "${a}"`);
  console.log(`  poster, today    → "${b}"`);
  console.log(`  compliance, 30th → "${whyLine(weightyLater!)}"`);
}

/* Every item must be able to explain itself. */
for (const it of [overdueItem, trivialSoon, weightyLater, noDeadline].filter(Boolean)) {
  if (!it!.reasons.length) fail('no reasons', it!.title);
  if (!it!.reasons.some((r) => r.label.startsWith('→'))) fail('no derivation shown', it!.title);
  if (!it!.reasons.some((r) => r.label.startsWith('Urgency'))) fail('urgency not reported', it!.title);
  if (!it!.reasons.some((r) => r.label.startsWith('Importance'))) fail('importance not reported', it!.title);
}

/* ------------------------------------------------------------------
   7. Threads — one obligation, chased
   ------------------------------------------------------------------ */

console.log('7. THREADS');

const thread = ingest([
  msg({ id: 'a', threadId: 'tx', subject: 'Monthly report', body: 'Please send the report by Friday.', internalDate: WED.getTime() }),
  msg({ id: 'b', threadId: 'tx', subject: 'Re: Monthly report', body: 'Just following up on the report.', internalDate: WED.getTime() + 2 * 86400000 }),
  msg({ id: 'c', threadId: 'tx', subject: 'Re: Monthly report', body: 'Gentle reminder about the report please.', internalDate: WED.getTime() + 3 * 86400000 }),
], state, WED);

const reportItems = thread.items.filter((i) => /report/i.test(i.title));
if (reportItems.length !== 1) fail('thread produced duplicates', `${reportItems.length} items: ${reportItems.map((i) => i.title).join(' | ')}`);
if (reportItems[0] && reportItems[0].source.messageCount !== 3) {
  fail('chase count wrong', `messageCount ${reportItems[0].source.messageCount}`);
}
if (thread.merged !== 2) fail('merge count wrong', `merged ${thread.merged}`);

/* Re-running the same messages must change nothing. */
const again = ingest(
  [msg({ id: 'a', threadId: 'tx', subject: 'Monthly report', body: 'Please send the report by Friday.' })],
  { items: thread.items, corrections: [], settings: state.settings },
  WED,
);
if (again.created !== 0) fail('re-sync duplicated', `created ${again.created}`);

/* A user edit must survive a later message in the same thread. */
const edited = thread.items.map((i) => (/report/i.test(i.title) ? { ...i, title: 'MY OWN TITLE', deadline: '2026-12-25', userEdited: true } : i));
const after = ingest(
  [msg({ id: 'd', threadId: 'tx', subject: 'Re: Monthly report', body: 'Please send the report by 15 September.' })],
  { items: edited, corrections: [], settings: state.settings },
  WED,
);
const kept = after.items.find((i) => i.title === 'MY OWN TITLE');
if (!kept) fail('user edit destroyed', 'title was overwritten by a later message');
else if (kept.deadline !== '2026-12-25') fail('user deadline overwritten', `now ${kept.deadline}`);

/* ------------------------------------------------------------------
   8. Waiting-for and follow-up timing
   ------------------------------------------------------------------ */

console.log('8. WAITING FOR');

const waitState = ingest([
  msg({ id: 'w1', threadId: 'tw', subject: 'Marketing budget', from: 'Rahul <rahul@acme.co.in>', fromEmail: 'rahul@acme.co.in', body: "I'll check the marketing budget and get back to you." }),
], state, WED);

const w = waitState.items.find((i) => i.kind === 'waiting');
if (!w) fail('waiting item not created', '');
else {
  if (w.status !== 'waiting') fail('waiting status wrong', w.status);
  if (w.priority !== 'WAITING') fail('waiting priority wrong', w.priority);
  if (!w.waitingOn?.person) fail('waiting person missing', '');

  const day1 = new Date(WED.getTime() + 86400000);
  const day9 = new Date(WED.getTime() + 9 * 86400000);
  if (followUpDue(w, day1, TZ).due) fail('nags too early', `after ${waitingDays(w, day1)} day`);
  if (!followUpDue(w, day9, TZ).due) fail('never suggests a follow-up', `after ${waitingDays(w, day9)} days`);
}

/* ------------------------------------------------------------------
   9. Buckets and search
   ------------------------------------------------------------------ */

console.log('9. BUCKETS AND SEARCH');

const mixed = ingest([
  msg({ id: 'x1', threadId: 'h1', body: 'Please submit the fee receipt today, it is urgent.' }),
  msg({ id: 'x5', threadId: 'h5', body: 'Please send the signed copy by Friday.' }),
  msg({ id: 'x2', threadId: 'h2', body: 'Could you review the deck before Friday?' }),
  msg({ id: 'x3', threadId: 'h3', body: 'Please share the reading list sometime next month.' }),
  msg({ id: 'x4', threadId: 'h4', from: 'Rahul <rahul@acme.co.in>', fromEmail: 'rahul@acme.co.in', body: "I'll send the vendor confirmation once I hear back." }),
], state, WED);

const mail = { ...emptyMail(), items: mixed.items };
const b = buckets(mail, WED);
if (!b.mustDo.length) fail('nothing in Must Do', 'an urgent same-day item should be there');
if (!b.waitingFor.length) fail('nothing in Waiting For', '');
if (b.mustDo.some((i) => i.kind === 'waiting')) fail('waiting leaked into Must Do', '');
const allBuckets = [...b.mustDo, ...b.shouldDo, ...b.canDo, ...b.upcoming];
if (new Set(allBuckets.map((i) => i.id)).size !== allBuckets.length) fail('item in two buckets at once', '');

const QUERIES: Array<[string, (n: number) => boolean, string]> = [
  ['things I need to send this week', (n) => n >= 1, 'tasks due within 7 days'],
  ['tasks waiting on Rahul', (n) => n === 1, 'one waiting item from Rahul'],
  ['high priority', (n) => n >= 1, 'P0/P1 only'],
  ['overdue work tasks', (n) => n === 0, 'nothing is overdue in this set'],
];
for (const [q, ok, what] of QUERIES) {
  const parsed = parseQuery(q);
  const res = search(mixed.items, parsed, WED, TZ);
  if (!ok(res.length)) fail(`search — "${q}"`, `got ${res.length}, expected ${what}`);
  if (!parsed.interpreted.length) fail(`search — "${q}"`, 'nothing interpreted, the user cannot see what it did');
}

/* ------------------------------------------------------------------
   10. Failure modes
   ------------------------------------------------------------------ */

console.log('10. FAILURE MODES');

const broken: Array<[string, Partial<RawMessage>]> = [
  ['empty body', { body: '' }],
  ['no subject', { subject: '', body: 'Please send the file.' }],
  ['no recipients', { to: [], cc: [], body: 'Please send the file.' }],
  ['huge body', { body: 'Please send the report. '.repeat(5000) }],
  ['binary noise', { body: ' �'.repeat(500) }],
  ['html only', { body: '<div><p>Please&nbsp;send the <b>report</b> by Friday.</p></div>' }],
  ['zero timestamp', { internalDate: 0, body: 'Please send the report tomorrow.' }],
];
for (const [label, over] of broken) {
  try {
    const r = run(over);
    if (!Array.isArray(r)) fail(`failure mode — ${label}`, 'did not return an array');
  } catch (e) {
    fail(`failure mode — ${label}`, `threw ${(e as Error).message}`);
  }
}

try {
  const r = ingest([], state, WED);
  if (r.items.length !== 0 || r.created !== 0) fail('empty sync', 'should be a no-op');
} catch (e) {
  fail('empty sync', `threw ${(e as Error).message}`);
}

/* ------------------------------------------------------------------
   11. The shapes real institutional mail actually arrives in.

   Every case below was found by running the engine over a real
   inbox. The wording here is invented; the SHAPE is not, and each
   one broke something.
   ------------------------------------------------------------------ */

console.log('11. REAL-MAIL SHAPES');

{
  // Hard wrapping. Mail clients break at ~72 characters, and a sentence split
  // on newlines ends the task title mid-phrase.
  const wrapped = run({
    body: 'You are requested to review the vendor reconciliation statement\nbefore the committee meeting and confirm the figures.',
  })[0];
  if (!wrapped) fail('hard-wrapped request lost', '');
  else if (!/reconciliation statement/i.test(wrapped.title) || /\n/.test(wrapped.title)) {
    fail('hard wrap cut the title', wrapped.title);
  }

  // No space after the full stop — extremely common in generated mail.
  const glued = run({ body: 'You are marked as Absent for the below session.You need to contact the office within 48 hours.' });
  const g = glued.find((c) => /contact the office/i.test(c.title));
  if (!g) fail('sentence not split on "session.You"', glued.map((c) => c.title).join(' | '));
  else if (/marked as absent/i.test(g.title)) fail('two sentences merged into one title', g.title);
  else if (g.deadline.date !== '2026-09-11') fail('"within 48 hours" mis-resolved', String(g.deadline.date));

  // Obligation phrased as necessity, not politeness.
  for (const phrasing of [
    'You need to submit the undertaking form.',
    'You have to complete the registration.',
    'You are all requested to come prepared with the case.',
    'You are hereby required to confirm your attendance.',
  ]) {
    const got = run({ body: phrasing });
    if (!got.length) fail('necessity phrasing missed', phrasing);
    else if (/^you\s+(need|have|are)\b/i.test(got[0].title)) fail('title not made imperative', got[0].title);
  }

  // Emphasis markers survive Gmail's plain-text rendering, including across
  // a wrapped line.
  const starred = run({ body: 'Please discuss the Case* "Change and Leadership at Yashasvi\nRasayan Limited"* before the session.' })[0];
  if (!starred) fail('emphasised request lost', '');
  else if (/\*/.test(starred.title)) fail('asterisks left in the title', starred.title);
  else if (!/Rasayan Limited/.test(starred.title)) fail('wrapped quote not rejoined', starred.title);

  // A conditional ask is still an ask, but the condition is not the task.
  const cond = run({ body: 'In case of any discrepancy, please write to the programme office by Friday.' })[0];
  if (!cond) fail('conditional request lost', '');
  else if (/in case of/i.test(cond.title)) fail('condition kept in the title', cond.title);

  // Consequence clauses are the stick, not the task.
  const stick = run({ body: 'Please raise any issue by 20 September, thereafter no request will be entertained.' })[0];
  if (stick && /thereafter/i.test(stick.title)) fail('consequence clause kept in title', stick.title);

  // Automated footers read exactly like requests but appear on every message
  // that system ever sends.
  const footer = run({
    subject: 'Attendance Status',
    body: `Dear RAM,\n\nYour attendance has been recorded.\n\nRegards\nTeam\n\nYou received this email since you are part of the SIS Process. If you have any query, please reach out to the Programme Office.`,
  });
  if (footer.some((c) => /programme office/i.test(c.title))) {
    fail('boilerplate footer became a task', footer.map((c) => c.title).join(' | '));
  }

  // A date in the subject that merely identifies the message must not become
  // a due date — it made brand-new tasks appear overdue.
  const subjDate = run({
    subject: 'Business Economics - Session - 20 on 11/Sep/2026 at 09:30-11:00 - Attendance Status',
    body: 'You need to contact the programme office.',
  })[0];
  if (subjDate?.deadline.date === '2026-09-11') {
    fail('subject date read as a deadline', 'a fresh task would show as overdue');
  }

  // "PFA"/"PFB" is how attachments are announced in Indian business English,
  // and it must not read as a request.
  for (const p of ['PFA the slides from today.', 'PFB the attached case for tomorrow.']) {
    const got = run({ body: p, subject: 'Slides' });
    if (got.some((c) => /slides|attached case/i.test(c.title) && c.confidence > 0.6)) {
      fail('attachment announcement became a task', `"${p}" → ${got[0].title}`);
    }
  }
}

/* ------------------------------------------------------------------
   12. Learning from corrections
   ------------------------------------------------------------------ */

console.log('12. LEARNING');

const dismissals = Array.from({ length: 4 }, () => ({
  id: uidish(), at: new Date().toISOString(), kind: 'not_a_task' as const,
  senderDomain: 'acme.co.in', patternId: 'req.could-you',
}));
const before = ingest([msg({ id: 'l1', threadId: 'l', body: 'Could you take a look at the brochure?' })], state, WED);
const afterLearn = ingest(
  [msg({ id: 'l2', threadId: 'l2', body: 'Could you take a look at the brochure?' })],
  { items: [], corrections: dismissals, settings: state.settings },
  WED,
);
const c1 = before.items[0]?.confidence ?? 0;
const c2 = afterLearn.items[0]?.confidence ?? 0;
if (before.items.length && c2 >= c1) {
  fail('corrections had no effect', `confidence ${c1.toFixed(2)} → ${c2.toFixed(2)}`);
}
function uidish() { return Math.random().toString(36).slice(2); }

/* ------------------------------------------------------------------ */

console.log('\n════════════════════════════════════════════');
if (failures) {
  console.log(`  ${failures} problem${failures === 1 ? '' : 's'}`);
  process.exitCode = 1;
} else {
  console.log('  0 problems');
}
console.log('════════════════════════════════════════════\n');
