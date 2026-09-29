import type { ActionItem, MailState, RawMessage, MailCorrection } from '../../lib/mail-types';
import { uid, now } from '../../lib/util';
import { extract } from './extract';
import { score } from './score';
import { displayName } from './clean';

/* ============================================================
   Ingestion: raw messages in, action items out.

   Two rules govern everything here.

   A thread is one obligation. "Please send the report", then
   "just following up on the report" two days later, is one task
   that has been chased — not two tasks. Getting this wrong is
   what makes email-to-task tools unusable within a week.

   The user always wins. Once someone has edited an item, later
   messages may update its evidence and its chase count, but they
   never overwrite a title, deadline, priority or status the user
   set by hand.
   ============================================================ */

/** Crude but effective: overlap of significant words. */
function similar(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    );
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  wa.forEach((w) => { if (wb.has(w)) hit++; });
  return hit / Math.min(wa.size, wb.size);
}

const STOP = new Set([
  'please', 'could', 'would', 'should', 'about', 'there', 'their', 'which',
  'that', 'this', 'with', 'from', 'your', 'have', 'been', 'will', 'send',
  'need', 'want', 'make', 'know', 'take', 'also', 'then', 'they', 'them',
]);

/** Derived from corrections: how much to trust each pattern, 0–1. */
export function dampingFrom(corrections: MailCorrection[]): Record<string, number> {
  const counts: Record<string, { bad: number; total: number }> = {};
  for (const c of corrections) {
    if (!c.patternId) continue;
    const e = (counts[c.patternId] ??= { bad: 0, total: 0 });
    e.total++;
    if (c.kind === 'dismissed' || c.kind === 'not_a_task') e.bad++;
  }
  const out: Record<string, number> = {};
  for (const [id, { bad, total }] of Object.entries(counts)) {
    // Three dismissals is a signal. One is an accident. Never damp below 0.4 —
    // the user can always turn a pattern off outright, and a rule that has
    // learned itself into silence is worse than one that is occasionally wrong.
    if (total >= 3) out[id] = Math.max(0.4, 1 - (bad / total) * 0.6);
  }
  return out;
}

export interface IngestResult {
  items: ActionItem[];
  created: number;
  merged: number;
  skipped: number;
}

export function ingest(
  messages: RawMessage[],
  state: Pick<MailState, 'items' | 'corrections' | 'settings'>,
  at: Date = new Date(),
): IngestResult {
  const items = [...state.items];
  const damping = dampingFrom(state.corrections);
  const trusted = trustedSenders(state.corrections);
  const floor = state.settings.confidenceFloor;

  let created = 0;
  let merged = 0;
  let skipped = 0;

  // Oldest first, so a follow-up merges into the original rather than the
  // other way round.
  const ordered = [...messages].sort((a, b) => a.internalDate - b.internalDate);

  for (const m of ordered) {
    const candidates = extract(m, { timezone: state.settings.timezone, damping });
    if (!candidates.length) { skipped++; continue; }

    for (const c of candidates) {
      /* A follow-up read on its own is weak evidence — "just following up on
         the report" names no obligation. Read inside a thread that already
         established one, it is strong: it says the sender is still waiting.
         So the floor is lower for something that will merge than for
         something that would create a new task out of nothing. */
      const willMerge = items.some(
        (i) => i.status !== 'done' && i.status !== 'cancelled'
          && i.source.threadId === m.threadId && similar(i.title, c.title) >= 0.5,
      );
      if (c.confidence < (willMerge ? floor * 0.6 : floor)) { skipped++; continue; }

      const senderHistory = items.filter((i) => i.source.fromEmail === m.fromEmail).length;
      const threadActive = items.some((i) => i.source.threadId === m.threadId);

      const s = score({
        kind: c.kind,
        category: c.category,
        deadline: c.deadline.date,
        deadlineText: c.deadline.text,
        deadlineConfidence: c.deadline.confidence,
        evidence: c.evidence,
        subject: m.subject,
        fromEmail: m.fromEmail,
        senderHistory,
        senderTrusted: trusted.has(domainOf(m.fromEmail)),
        threadActive,
        now: at,
        timezone: state.settings.timezone,
      });

      /* --- is this the same obligation we already know about? --- */
      const existingIdx = items.findIndex(
        (i) =>
          i.status !== 'done' && i.status !== 'cancelled'
          && i.source.threadId === m.threadId
          && (i.kind === c.kind || (i.kind === 'request' && c.kind === 'request'))
          && similar(i.title, c.title) >= 0.5,
      );

      if (existingIdx >= 0) {
        const prev = items[existingIdx];
        if (prev.relatedMessageIds.includes(m.id) || prev.source.messageId === m.id) { skipped++; continue; }

        // A follow-up is evidence of pressure even when it adds no new facts.
        const chased = c.patternId === 'req.reminder' || /follow|remind|chas|nudge/i.test(c.evidence);
        items[existingIdx] = {
          ...prev,
          relatedMessageIds: [...prev.relatedMessageIds, m.id],
          source: {
            ...prev.source,
            messageCount: prev.source.messageCount + 1,
            // The newest wording is the most useful evidence to show.
            evidence: c.evidence.slice(0, 300),
            receivedAt: new Date(m.internalDate).toISOString(),
          },
          // A firmer deadline from a later message is worth taking, unless the
          // user has already settled it themselves.
          ...(!prev.userEdited && c.deadline.confidence === 'explicit' && prev.deadlineConfidence !== 'explicit'
            ? { deadline: c.deadline.date, deadlineText: c.deadline.text, deadlineConfidence: 'explicit' as const, deadlineOptions: undefined }
            : {}),
          ...(!prev.userEdited
            ? {
              urgency: Math.max(prev.urgency, s.urgency + (chased ? 6 : 0)),
              importance: Math.max(prev.importance, s.importance),
              priority: s.priority === 'WAITING' ? prev.priority : higher(prev.priority, s.priority),
              reasons: chased
                ? [...s.reasons, { label: 'Sender has followed up', delta: 6, detail: `${prev.source.messageCount + 1} messages in this thread` }]
                : s.reasons,
            }
            : {}),
          updatedAt: now(),
        };
        merged++;
        continue;
      }

      const item: ActionItem = {
        id: uid(),
        kind: c.kind,
        title: c.title,
        summary: c.summary,
        source: {
          messageId: m.id,
          threadId: m.threadId,
          from: displayName(m.from, m.fromEmail),
          fromEmail: m.fromEmail,
          subject: m.subject,
          receivedAt: new Date(m.internalDate).toISOString(),
          evidence: c.evidence.slice(0, 300),
          messageCount: 1,
        },
        deadline: c.deadline.date,
        deadlineText: c.deadline.text,
        deadlineConfidence: c.deadline.confidence,
        deadlineOptions: c.deadline.options,
        urgency: s.urgency,
        importance: s.importance,
        priority: s.priority,
        consequence: s.consequence,
        reasons: s.reasons,
        category: c.category,
        confidence: c.confidence,
        status: c.kind === 'waiting' ? 'waiting'
          : state.settings.autoCreate && c.confidence >= 0.75 ? 'todo'
            : 'inbox',
        waitingOn: c.kind === 'waiting'
          ? {
            person: displayName(m.from, m.fromEmail),
            email: m.fromEmail,
            since: new Date(m.internalDate).toISOString(),
            expected: c.deadline.date,
          }
          : undefined,
        relatedMessageIds: [],
        userEdited: false,
        createdAt: now(),
        updatedAt: now(),
      };
      items.push(item);
      created++;
    }
  }

  return { items, created, merged, skipped };
}

const ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, WAITING: 4 };
const higher = (a: ActionItem['priority'], b: ActionItem['priority']) => (ORDER[a] <= ORDER[b] ? a : b);

const domainOf = (email: string) => email.split('@')[1] ?? email;

function trustedSenders(corrections: MailCorrection[]): Set<string> {
  const up: Record<string, number> = {};
  for (const c of corrections) {
    if (c.kind === 'priority_up' || c.kind === 'completed_now') up[c.senderDomain] = (up[c.senderDomain] ?? 0) + 1;
    if (c.kind === 'priority_down' || c.kind === 'dismissed') up[c.senderDomain] = (up[c.senderDomain] ?? 0) - 1;
  }
  return new Set(Object.entries(up).filter(([, n]) => n >= 2).map(([d]) => d));
}
