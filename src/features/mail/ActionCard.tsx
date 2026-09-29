import { motion } from 'framer-motion';
import type { ActionItem, Priority } from '../../lib/mail-types';
import { actions } from '../../store/store';
import { Chip, Menu, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { cn, relativeDay, addDays, toISODate } from '../../lib/util';
import { whyLine } from '../../engine/mail/score';
import { threadUrl } from '../../lib/gmail';
import { daysOut } from '../../engine/mail/dates';

/* ============================================================
   One row in the Action Center.

   Colour is never the only signal. Every priority also carries a
   glyph and a word, because a red dot means nothing to a
   colour-blind reader and nothing at all to a screen reader.
   ============================================================ */

export const PRIORITY: Record<Priority, { label: string; short: string; color: string; glyph: string }> = {
  P0: { label: 'Critical', short: 'P0', color: '#f2555a', glyph: '▲' },
  P1: { label: 'High', short: 'P1', color: '#dfa62f', glyph: '◆' },
  P2: { label: 'Medium', short: 'P2', color: '#6c9bf0', glyph: '○' },
  P3: { label: 'Low', short: 'P3', color: '#616a78', glyph: '·' },
  WAITING: { label: 'Waiting', short: 'Waiting', color: '#3ec08c', glyph: '◷' },
};

const KIND_ICON: Record<ActionItem['kind'], string> = {
  request: 'Inbox',
  commitment: 'Send',
  waiting: 'Hourglass',
  attention: 'Info',
};

export function ActionCard({
  item, db, onOpen, compact,
}: {
  item: ActionItem;
  db: { mail: { settings: { timezone: string } }; };
  onOpen: (i: ActionItem) => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const p = PRIORITY[item.priority];
  const tz = db.mail.settings.timezone;
  const n = daysOut(item.deadline, new Date(), tz);
  const overdue = n !== null && n < 0;

  const complete = () => {
    actions.setActionStatus(item.id, 'done');
    toast({ text: `Done — ${item.title}`, tone: 'good' });
  };

  const snooze = (days: number, label: string) => {
    actions.setActionStatus(item.id, 'snoozed', addDays(new Date(), days).toISOString());
    toast({ text: `Snoozed until ${label}`, tone: 'info' });
  };

  return (
    <motion.article
      layout="position"
      className={cn(
        'panel group relative flex gap-3 p-3 text-left transition-colors',
        'hover:border-[var(--hairline-strong)]',
      )}
      style={{ borderLeft: `3px solid ${p.color}` }}
    >
      {item.kind !== 'waiting' && item.kind !== 'attention' && (
        <button
          type="button"
          onClick={complete}
          aria-label={`Mark “${item.title}” complete`}
          className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-[var(--hairline-strong)] text-transparent transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)]"
        >
          <Icon name="Check" size={13} />
        </button>
      )}

      <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip color={p.color} glyph={p.glyph}>
            <span className="sr-only">Priority </span>{p.short}
          </Chip>
          {item.deadline && (
            <Chip
              color={overdue ? '#f2555a' : undefined}
              glyph={overdue ? '!' : undefined}
              title={item.deadlineText ? `From “${item.deadlineText}”` : undefined}
            >
              {overdue ? `${Math.abs(n!)}d overdue` : relativeDay(item.deadline)}
            </Chip>
          )}
          {item.deadlineConfidence === 'ambiguous' && (
            <Chip color="#dfa62f" glyph="?">Date unclear</Chip>
          )}
          {item.source.messageCount > 1 && (
            <Chip glyph="↻" title="The sender has followed up">{item.source.messageCount} msgs</Chip>
          )}
        </div>

        <h3 className={cn('mt-1.5 font-semibold leading-snug', compact ? 'text-[13.5px]' : 'text-[14.5px]')}>
          {item.title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1">
            <Icon name={KIND_ICON[item.kind]} size={11} />
            {item.kind === 'waiting' ? `${item.waitingOn?.person ?? item.source.from}` : item.source.from}
          </span>
          <span aria-hidden>·</span>
          <span className="truncate max-w-[22ch]">{item.source.subject}</span>
        </div>

        {!compact && (
          <p className="mt-1 text-[12px] italic text-[var(--ink-3)]">{whyLine(item)}</p>
        )}
      </button>

      <div className="flex shrink-0 items-start gap-1">
        <a
          href={threadUrl(item.source.threadId)}
          target="_blank"
          rel="noreferrer"
          title="Open the original email in Gmail"
          aria-label="Open the original email in Gmail"
          className="rounded-md p-1.5 text-[var(--ink-3)] hover:bg-[var(--sunken)] hover:text-[var(--ink-1)]"
        >
          <Icon name="ExternalLink" size={14} />
        </a>
        <Menu
          trigger={
            <span className="block rounded-md p-1.5 text-[var(--ink-3)] hover:bg-[var(--sunken)] hover:text-[var(--ink-1)]">
              <Icon name="MoreHorizontal" size={14} />
            </span>
          }
          items={[
            { label: 'Open details', icon: 'Eye', run: () => onOpen(item) },
            ...(item.taskId ? [] : [{ label: 'Add to my tasks', icon: 'ListChecks', run: () => { actions.promoteToTask(item.id); toast({ text: 'Added to your task list', tone: 'good' }); } }]),
            { label: 'Snooze to tomorrow', icon: 'Clock', run: () => snooze(1, 'tomorrow') },
            { label: 'Snooze a week', icon: 'Clock', run: () => snooze(7, 'next week') },
            { label: 'Not a task', icon: 'CircleSlash', run: () => { actions.notATask(item.id); toast({ text: 'Removed — the rule that found it will fire less often', tone: 'info' }); } },
            { label: 'Dismiss', icon: 'X', run: () => { actions.setActionStatus(item.id, 'cancelled'); toast({ text: 'Dismissed', tone: 'info' }); } },
          ]}
        />
      </div>
    </motion.article>
  );
}

/** Suggestions look different on purpose — they are proposals, not work. */
export function SuggestionCard({ item, onOpen }: { item: ActionItem; onOpen: (i: ActionItem) => void }) {
  const toast = useToast();
  return (
    <div className="panel flex items-start gap-3 border-dashed p-3">
      <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <Chip glyph="?">{Math.round(item.confidence * 100)}% sure</Chip>
          {item.deadline && <Chip>{relativeDay(item.deadline)}</Chip>}
        </div>
        <h3 className="mt-1.5 text-[13.5px] font-semibold leading-snug">{item.title}</h3>
        <div className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
          {item.source.from} · {item.source.subject}
        </div>
      </button>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className="btn text-[12px]"
          onClick={() => { actions.setActionStatus(item.id, 'todo'); toast({ text: 'Added', tone: 'info' }); }}
        >
          Keep
        </button>
        <button
          type="button"
          className="btn btn-ghost text-[12px]"
          onClick={() => { actions.notATask(item.id); toast({ text: 'Dismissed', tone: 'info' }); }}
        >
          No
        </button>
      </div>
    </div>
  );
}

export const todayISOFor = () => toISODate(new Date());
