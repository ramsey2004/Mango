import { useState } from 'react';
import type { ActionItem, ActionCategory, Priority } from '../../lib/mail-types';
import type { DB } from '../../lib/types';
import { actions } from '../../store/store';
import { Modal, Field, Select, Chip, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { formatDateLong, relativeDay } from '../../lib/util';
import { threadUrl } from '../../lib/gmail';
import { PRIORITY } from './ActionCard';
import { waitingDays, followUpDue } from '../../engine/mail/actionCenter';

/* ============================================================
   The context panel.

   Its job is to make the connection back to the email
   unbreakable, and to make the priority arguable. If a user
   cannot see why something was ranked P0, they will not trust
   the P0 next to it either.
   ============================================================ */

const CATEGORIES: ActionCategory[] = [
  'work', 'personal', 'finance', 'academic', 'meetings', 'follow-up',
  'admin', 'shopping', 'travel', 'documents', 'approvals', 'other',
];

export function ActionDetail({ item, db, onClose }: { item: ActionItem; db: DB; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const p = PRIORITY[item.priority];
  const related = db.mail.items.filter(
    (i) => i.id !== item.id && i.source.threadId === item.source.threadId && i.status !== 'cancelled',
  );
  const task = item.taskId ? db.tasks.find((t) => t.id === item.taskId) : undefined;

  const save = (patch: Partial<ActionItem>) => actions.updateAction(item.id, patch);

  return (
    <Modal open onClose={onClose} title="Action" wide>
      <div className="flex flex-col gap-4">
        <Field label="Task">
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== item.title && save({ title: title.trim() })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Priority">
            <Select
              value={item.priority}
              onChange={(v) => save({ priority: v as Priority })}
              options={(Object.keys(PRIORITY) as Priority[]).map((k) => ({ value: k, label: `${PRIORITY[k].short} — ${PRIORITY[k].label}` }))}
            />
          </Field>
          <Field label="Deadline">
            <input
              type="date"
              className="field"
              value={item.deadline ?? ''}
              onChange={(e) => save({
                deadline: e.target.value || undefined,
                deadlineConfidence: e.target.value ? 'explicit' : 'none',
                deadlineOptions: undefined,
              })}
            />
          </Field>
          <Field label="Category">
            <Select
              value={item.category}
              onChange={(v) => {
                save({ category: v as ActionCategory });
                actions.recordCorrection({
                  kind: 'category',
                  senderDomain: item.source.fromEmail.split('@')[1] ?? '',
                  category: v as ActionCategory,
                });
              }}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        </div>

        {/* An ambiguous date is a question, asked once, with both answers to hand. */}
        {item.deadlineConfidence === 'ambiguous' && item.deadlineOptions && (
          <div className="panel p-3" style={{ borderColor: '#dfa62f55', background: '#dfa62f0f' }}>
            <div className="text-[13px] font-semibold">
              “{item.deadlineText}” could mean two things
            </div>
            <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
              Mango has not guessed. Pick the one the sender meant.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.deadlineOptions.map((o) => (
                <button
                  key={o.date}
                  type="button"
                  className="btn text-[12.5px]"
                  onClick={() => {
                    save({ deadline: o.date, deadlineConfidence: 'explicit', deadlineOptions: undefined });
                    toast({ text: `Deadline set to ${formatDateLong(o.date)}`, tone: 'good' });
                  }}
                >
                  {o.label} — {formatDateLong(o.date)}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.deadlineConfidence === 'ambiguous' && !item.deadlineOptions && (
          <div className="panel p-3" style={{ borderColor: '#dfa62f55', background: '#dfa62f0f' }}>
            <div className="text-[13px] font-semibold">No date could be worked out</div>
            <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
              The sender wrote “{item.deadlineText}”, which depends on something Mango cannot see.
              Set the date yourself above.
            </p>
          </div>
        )}

        {/* ---------------------------- why ---------------------------- */}
        <section>
          <div className="label mb-1.5">Why it ranks here</div>
          <div className="panel p-3">
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Chip color={p.color} glyph={p.glyph}>{p.short} — {p.label}</Chip>
              <Chip>Urgency {item.urgency}</Chip>
              <Chip>Importance {item.importance}</Chip>
              <Chip>{Math.round(item.confidence * 100)}% confident</Chip>
            </div>
            <ul className="flex flex-col gap-1 border-t pt-2 text-[12.5px]" style={{ borderColor: 'var(--hairline)' }}>
              {item.reasons.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className={r.label.startsWith('→') || /^(Urgency|Importance)/.test(r.label) ? 'font-semibold' : ''}>
                    {r.label}
                    {r.detail && <span className="text-[var(--ink-3)]"> · {r.detail}</span>}
                  </span>
                  {r.delta !== 0 && (
                    <span className="shrink-0 tabular-nums text-[var(--ink-3)]">
                      {r.delta > 0 ? '+' : ''}{Math.round(r.delta)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------- source --------------------------- */}
        <section>
          <div className="label mb-1.5">Where this came from</div>
          <div className="panel p-3 text-[12.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{item.source.from}</div>
                <div className="truncate text-[var(--ink-3)]">{item.source.subject}</div>
              </div>
              <a href={threadUrl(item.source.threadId, db.mail.account?.email)} target="_blank" rel="noreferrer" className="btn text-[12px]">
                <Icon name="ExternalLink" size={13} /> Open in Gmail
              </a>
            </div>
            <blockquote
              className="mt-2 border-l-2 pl-3 italic text-[var(--ink-2)]"
              style={{ borderColor: 'var(--hairline-strong)' }}
            >
              “{item.source.evidence}”
            </blockquote>
            <div className="mt-2 text-[var(--ink-3)]">
              {formatDateLong(item.source.receivedAt.slice(0, 10))}
              {item.source.messageCount > 1 && ` · ${item.source.messageCount} messages in this thread`}
            </div>
            <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">
              Mango keeps this quoted line and nothing else. The full email stays in Gmail.
            </p>
          </div>
        </section>

        {item.kind === 'waiting' && item.waitingOn && (
          <section>
            <div className="label mb-1.5">Waiting on</div>
            <div className="panel p-3 text-[12.5px]">
              <div className="font-semibold">{item.waitingOn.person}</div>
              <div className="text-[var(--ink-3)]">
                {waitingDays(item)} day{waitingDays(item) === 1 ? '' : 's'} · {followUpDue(item, new Date(), db.mail.settings.timezone).why}
              </div>
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <div className="label mb-1.5">Related in this thread</div>
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {related.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Chip color={PRIORITY[r.priority].color} glyph={PRIORITY[r.priority].glyph}>{PRIORITY[r.priority].short}</Chip>
                  <span className="truncate">{r.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --------------------------- actions --------------------------- */}
        <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          {item.kind !== 'waiting' && (
            <button type="button" className="btn btn-primary" onClick={() => { actions.setActionStatus(item.id, 'done'); toast({ text: 'Done', tone: 'good' }); onClose(); }}>
              <Icon name="Check" size={14} /> Mark complete
            </button>
          )}
          {task ? (
            <span className="btn" aria-disabled>
              <Icon name="ListChecks" size={14} /> In your task list
            </span>
          ) : (
            <button type="button" className="btn" onClick={() => { actions.promoteToTask(item.id); toast({ text: 'Added to your task list', tone: 'good' }); }}>
              <Icon name="ListChecks" size={14} /> Add to my tasks
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => { actions.setActionStatus(item.id, 'snoozed', new Date(Date.now() + 86400000).toISOString()); onClose(); }}>
            <Icon name="Clock" size={14} /> Snooze a day
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { actions.notATask(item.id); toast({ text: 'Removed, and the rule that found it will fire less often', tone: 'info' }); onClose(); }}>
            <Icon name="CircleSlash" size={14} /> Not a task
          </button>
        </div>

        {item.userEdited && (
          <p className="text-[11.5px] text-[var(--ink-3)]">
            You have edited this, so later messages in the thread will not change it.
          </p>
        )}
      </div>
    </Modal>
  );
}

export const dueLabel = (i: ActionItem) => (i.deadline ? relativeDay(i.deadline) : 'No deadline');
