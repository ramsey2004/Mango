import type { ID, ISODate, ISOStamp } from './types';

/* ============================================================
   Mail → Action Center domain model.

   Two deliberate constraints shape everything here.

   1. We do not keep email bodies. A body is read once, in memory,
      at ingestion; what is stored is the derived action plus a
      short quoted snippet as evidence. Nothing else about the
      message survives. This is §24 taken literally rather than
      decoratively — the app physically cannot leak a body it
      never wrote down.

   2. Every judgement is a sum of named reasons, the same shape
      the priority and nutrition engines already use. There is no
      opaque score anywhere in this feature.
   ============================================================ */

/** What kind of obligation this is. The distinction is the whole point. */
export type ActionKind =
  /** someone wants something from the user */
  | 'request'
  /** the user promised something to someone */
  | 'commitment'
  /** the user is waiting on someone else */
  | 'waiting'
  /** matters, but is not a task — a decision, an escalation, a change */
  | 'attention';

export type ActionStatus =
  | 'inbox'
  | 'todo'
  | 'doing'
  | 'waiting'
  | 'done'
  | 'snoozed'
  | 'cancelled';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'WAITING';

/**
 * How much we trust the deadline. "ambiguous" is not a failure — it is the
 * honest answer to "send this Friday" and it must reach the user as a question
 * rather than a silently invented date.
 */
export type DeadlineConfidence = 'explicit' | 'inferred' | 'ambiguous' | 'none';

export type ActionCategory =
  | 'work' | 'personal' | 'finance' | 'academic' | 'meetings' | 'follow-up'
  | 'admin' | 'shopping' | 'travel' | 'documents' | 'approvals' | 'other';

/** One named contribution to a score. Displayed verbatim to the user. */
export interface Reason {
  label: string;
  /** signed contribution in points */
  delta: number;
  detail?: string;
}

/** What ignoring this would actually cost. Drives importance, not urgency. */
export type Consequence =
  | 'missed_deadline' | 'financial' | 'relationship' | 'blocks_others'
  | 'missed_meeting' | 'compliance' | 'project_delay' | 'none';

/**
 * The stored trace back to the email. Deliberately minimal: enough to open
 * the original in Gmail and to show the user why this exists, and no more.
 */
export interface ActionSource {
  messageId: string;
  threadId: string;
  /** display name if the header had one, else the address */
  from: string;
  fromEmail: string;
  subject: string;
  receivedAt: ISOStamp;
  /** the sentence the action was drawn from, quoted. Capped on write. */
  evidence: string;
  /** how many messages in this thread have contributed so far */
  messageCount: number;
}

export interface ActionItem {
  id: ID;
  kind: ActionKind;
  /** imperative, short. Never the raw email sentence. */
  title: string;
  /** one line of plain context, when the title alone is not enough */
  summary?: string;

  source: ActionSource;

  deadline?: ISODate;
  /** the words the deadline came from — "by Thursday", "EOD" */
  deadlineText?: string;
  deadlineConfidence: DeadlineConfidence;
  /** competing readings, when the phrase genuinely has more than one */
  deadlineOptions?: Array<{ date: ISODate; label: string }>;

  /** 0–100, how soon */
  urgency: number;
  /** 0–100, how much it matters */
  importance: number;
  priority: Priority;
  consequence: Consequence;
  /** the full working, shown in the detail panel */
  reasons: Reason[];

  category: ActionCategory;
  /** 0–1. Below the floor nothing is created at all. */
  confidence: number;

  status: ActionStatus;
  snoozedUntil?: ISOStamp;

  /** set on kind === 'waiting' */
  waitingOn?: { person: string; email: string; since: ISOStamp; expected?: ISODate };

  /** set once the user promotes this into a real Mango task */
  taskId?: ID;
  /** other actions from the same thread, folded into this one */
  relatedMessageIds: string[];

  /** true once the user has edited any field, which freezes AI overwrites */
  userEdited: boolean;
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
}

/**
 * A correction the user made. Used to bias future extraction, and nothing
 * else. Stores the signal, not the email.
 */
export interface MailCorrection {
  id: ID;
  at: ISOStamp;
  /** what the user changed */
  kind: 'dismissed' | 'not_a_task' | 'priority_up' | 'priority_down' | 'category' | 'completed_now';
  /** sender domain, not the address — enough to learn from, less to store */
  senderDomain: string;
  category?: ActionCategory;
  /** the extraction pattern that fired, so we can damp it */
  patternId?: string;
}

export interface MailAccount {
  email: string;
  connectedAt: ISOStamp;
}

/** OAuth state. Treated as a credential everywhere: never exported, never logged. */
export interface MailAuth {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
  scope: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'never';

export interface MailSync {
  status: SyncStatus;
  lastSyncAt?: ISOStamp;
  /** Gmail's incremental cursor. Absent means the next sync is a full backfill. */
  historyId?: string;
  /** message ids already processed, so a re-sync is cheap and idempotent */
  seen: string[];
  lastError?: string;
  /** set when Gmail told us to slow down */
  retryAfter?: number;
}

export interface MailSettings {
  /** Google OAuth client id, supplied by the user. Not a secret. */
  clientId: string;
  /** create tasks automatically above the high-confidence line */
  autoCreate: boolean;
  /** below this nothing is created at all. 0–1. */
  confidenceFloor: number;
  /** Gmail labels to scan. Empty means INBOX. */
  labels: string[];
  /** how far back the first sync reaches */
  lookbackDays: number;
  /** IANA zone used to resolve "tomorrow" and "EOD" */
  timezone: string;
  /** show the morning brief on open */
  morningBrief: boolean;
}

export interface MailState {
  account: MailAccount | null;
  auth: MailAuth | null;
  items: ActionItem[];
  corrections: MailCorrection[];
  sync: MailSync;
  settings: MailSettings;
}

export const emptyMail = (): MailState => ({
  account: null,
  auth: null,
  items: [],
  corrections: [],
  sync: { status: 'never', seen: [] },
  settings: {
    clientId: '',
    autoCreate: true,
    confidenceFloor: 0.45,
    labels: ['INBOX'],
    lookbackDays: 14,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    morningBrief: true,
  },
});

/* ---------------------------------------------------------------
   The in-memory shape of a fetched message. This type exists only
   between "fetched" and "extracted" — it is never persisted.
   --------------------------------------------------------------- */
export interface RawMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  /** epoch ms */
  internalDate: number;
  from: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  /** plain text, quoted trailers and signatures already stripped */
  body: string;
  snippet: string;
  /** the mailbox owner, for "is this addressed to me" */
  selfEmail: string;
  /** set when this message is a reply */
  inReplyTo?: string;
}
