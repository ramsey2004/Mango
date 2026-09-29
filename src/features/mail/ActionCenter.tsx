import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { DB } from '../../lib/types';
import type { ActionItem } from '../../lib/mail-types';
import { actions } from '../../store/store';
import { Panel, SectionHeader, Empty, Chip, Segmented, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { cn, formatDateLong } from '../../lib/util';
import {
  buckets, brief, parseQuery, search, followUpDue, waitingDays, meetingPrep,
} from '../../engine/mail/actionCenter';
import { ActionCard, SuggestionCard, PRIORITY } from './ActionCard';
import { ActionDetail } from './ActionDetail';
import { MailConnect } from './MailConnect';
import { useMail } from './useMail';

/* ============================================================
   Action Center.

   The hierarchy answers one question before anything else:
   what needs my attention today? Everything below the fold is
   for when that question has been answered.
   ============================================================ */

type Tab = 'today' | 'waiting' | 'all' | 'attention';

export function ActionCenter({ db }: { db: DB }) {
  const toast = useToast();
  const mail = useMail(db);
  const [tab, setTab] = useState<Tab>('today');
  const [open, setOpen] = useState<ActionItem | null>(null);
  const [query, setQuery] = useState('');

  // Snoozed items that have come due are folded back in on open, quietly.
  useEffect(() => { actions.wakeSnoozed(); }, []);

  const now = new Date();
  const b = useMemo(() => buckets(db.mail, now), [db.mail]);
  const br = useMemo(() => brief(db, now), [db]);
  const meetings = useMemo(() => meetingPrep(db, now), [db]);

  const parsed = useMemo(() => (query.trim() ? parseQuery(query) : null), [query]);
  const results = useMemo(
    () => (parsed ? search(db.mail.items, parsed, now, db.mail.settings.timezone) : []),
    [parsed, db.mail],
  );

  const fresh = open ? db.mail.items.find((i) => i.id === open.id) ?? null : null;

  if (!db.mail.account) {
    return <MailConnect db={db} mail={mail} />;
  }

  const total = b.mustDo.length + b.shouldDo.length + b.canDo.length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label mb-2">Action centre</div>
          <h1 className="display text-[clamp(24px,4vw,36px)] leading-none">
            {br.greeting}{db.settings.userName ? `, ${db.settings.userName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--ink-2)]">
            {br.quiet
              ? 'Nothing is asking for you right now.'
              : `${total} thing${total === 1 ? '' : 's'} on your plate${br.counts.overdue ? `, ${br.counts.overdue} overdue` : ''}${br.counts.waiting ? ` · waiting on ${br.counts.waiting}` : ''}.`}
          </p>
        </div>
        <SyncButton mail={mail} db={db} />
      </header>

      {mail.sync.error && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-3" style={{ borderColor: '#f2555a55', background: '#f2555a0f' }}>
          <div className="flex items-start gap-2 text-[13px]">
            <Icon name="AlertTriangle" size={15} className="mt-0.5 shrink-0" style={{ color: '#f2555a' }} />
            <span>{mail.sync.error.message}</span>
          </div>
          <div className="flex gap-2">
            {mail.sync.error.kind === 'auth' && (
              <button type="button" className="btn" onClick={() => mail.connect()}>Reconnect</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={mail.clearError}>Dismiss</button>
          </div>
        </Panel>
      )}

      {!mail.tokenLive && !mail.sync.error && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-[13px]">
            <span className="font-semibold">Gmail access has lapsed.</span>{' '}
            <span className="text-[var(--ink-3)]">
              Browser sign-ins last about an hour. Your actions are all still here.
            </span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => mail.connect()}>
            <Icon name="RefreshCw" size={14} /> Reconnect
          </button>
        </Panel>
      )}

      {/* ------------------------------ search ------------------------------ */}
      <Panel className="p-3">
        <label className="flex items-center gap-2">
          <Icon name="Search" size={15} className="shrink-0 text-[var(--ink-3)]" />
          <span className="sr-only">Search your actions</span>
          <input
            className="field !border-0 !bg-transparent !px-0"
            placeholder="Try: things I need to send this week · waiting on Rahul · overdue finance"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="shrink-0 text-[var(--ink-3)] hover:text-[var(--ink-1)]" aria-label="Clear search">
              <Icon name="X" size={14} />
            </button>
          )}
        </label>
        {parsed && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: 'var(--hairline)' }}>
            <span className="text-[11.5px] text-[var(--ink-3)]">Reading that as</span>
            {parsed.interpreted.length
              ? parsed.interpreted.map((x) => <Chip key={x}>{x}</Chip>)
              : <Chip>everything</Chip>}
            <span className="ml-auto text-[11.5px] text-[var(--ink-3)]">{results.length} match{results.length === 1 ? '' : 'es'}</span>
          </div>
        )}
      </Panel>

      {parsed ? (
        <section className="flex flex-col gap-2">
          {results.length
            ? results.map((i) => <ActionCard key={i.id} item={i} db={db} onOpen={setOpen} />)
            : <Empty icon="Search" title="Nothing matches" body="Try fewer words, or clear the search to see everything." />}
        </section>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            ariaLabel="Action centre sections"
            options={[
              { value: 'today', label: `Today${total ? ` (${total})` : ''}`, icon: 'Zap' },
              { value: 'waiting', label: `Waiting${b.waitingFor.length ? ` (${b.waitingFor.length})` : ''}`, icon: 'Hourglass' },
              { value: 'attention', label: `Read${b.needsAttention.length ? ` (${b.needsAttention.length})` : ''}`, icon: 'Info' },
              { value: 'all', label: 'Everything', icon: 'List' },
            ]}
          />

          {tab === 'today' && (
            <TodayTab b={b} db={db} meetings={meetings} onOpen={setOpen} />
          )}

          {tab === 'waiting' && (
            <Group
              title="Waiting for other people"
              hint="Nothing here needs doing by you — it needs chasing, and only when chasing is reasonable."
              items={b.waitingFor}
              db={db}
              onOpen={setOpen}
              empty={{ icon: 'Hourglass', title: 'Nothing is waiting on someone else', body: 'When a reply is promised and does not arrive, it will show up here.' }}
              renderExtra={(i) => {
                const f = followUpDue(i, now, db.mail.settings.timezone);
                return (
                  <div className={cn('flex items-center gap-2 px-3 pb-2 text-[12px]', f.due ? 'text-[var(--warning,#dfa62f)]' : 'text-[var(--ink-3)]')}>
                    <Icon name={f.due ? 'AlarmClock' : 'Clock'} size={12} />
                    <span>{waitingDays(i, now)} day{waitingDays(i, now) === 1 ? '' : 's'} · {f.why}</span>
                    {f.due && (
                      <button
                        type="button"
                        className="btn btn-ghost ml-auto text-[11.5px]"
                        onClick={() => { actions.promoteToTask(i.id); toast({ text: 'Added a follow-up task', tone: 'good' }); }}
                      >
                        Add follow-up task
                      </button>
                    )}
                  </div>
                );
              }}
            />
          )}

          {tab === 'attention' && (
            <Group
              title="Worth knowing, not worth a task"
              hint="Decisions, cancellations, deadline changes. Kept out of the task list on purpose."
              items={b.needsAttention}
              db={db}
              onOpen={setOpen}
              empty={{ icon: 'Info', title: 'Nothing needs reading', body: 'Changes, decisions and escalations land here.' }}
            />
          )}

          {tab === 'all' && (
            <div className="flex flex-col gap-5">
              <Group title="Must do" items={b.mustDo} db={db} onOpen={setOpen} empty={{ icon: 'CheckCircle2', title: 'Nothing critical', body: 'No overdue work and nothing due today.' }} />
              <Group title="Should do" items={b.shouldDo} db={db} onOpen={setOpen} empty={{ icon: 'CheckCircle2', title: 'Nothing pressing' }} />
              <Group title="Can do" items={b.canDo} db={db} onOpen={setOpen} empty={{ icon: 'CheckCircle2', title: 'Nothing queued' }} />
              <Group title="Later" items={b.upcoming} db={db} onOpen={setOpen} empty={{ icon: 'CalendarDays', title: 'No upcoming deadlines', body: 'Nothing with a date in the next few weeks.' }} />
            </div>
          )}

          {b.suggestions.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader
                label="Not sure about these"
                title="Suggestions"
                right={<span className="text-[12px] text-[var(--ink-3)]">{b.suggestions.length} to confirm</span>}
              />
              <p className="text-[12.5px] text-[var(--ink-3)]">
                Mango was not confident enough to add these on its own. Keep the ones that are real —
                dismissing the rest teaches it what to ignore.
              </p>
              {b.suggestions.slice(0, 8).map((i) => (
                <SuggestionCard key={i.id} item={i} onOpen={setOpen} />
              ))}
            </section>
          )}
        </>
      )}

      <AnimatePresence>
        {fresh && <ActionDetail key={fresh.id} item={fresh} db={db} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ today tab ------------------------------- */

function TodayTab({
  b, db, meetings, onOpen,
}: {
  b: ReturnType<typeof buckets>;
  db: DB;
  meetings: ReturnType<typeof meetingPrep>;
  onOpen: (i: ActionItem) => void;
}) {
  const nothing = !b.mustDo.length && !b.shouldDo.length && !b.canDo.length && !meetings.length;

  if (nothing) {
    return (
      <Panel>
        <Empty
          icon="CheckCircle2"
          title="You’re clear for now"
          body={
            b.waitingFor.length
              ? `Nothing needs doing by you. You are waiting on ${b.waitingFor.length} ${b.waitingFor.length === 1 ? 'person' : 'people'} — that is under Waiting.`
              : 'No deadlines, no open requests, nothing promised. Sync again when new mail arrives.'
          }
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {meetings.length > 0 && <MeetingPrepPanel meetings={meetings} />}

      <Group
        title="Must do"
        badge={{ color: PRIORITY.P0.color, glyph: PRIORITY.P0.glyph, label: 'Critical' }}
        items={b.mustDo}
        db={db}
        onOpen={onOpen}
        empty={{ icon: 'CheckCircle2', title: 'Nothing critical today' }}
      />
      <Group
        title="Should do"
        badge={{ color: PRIORITY.P1.color, glyph: PRIORITY.P1.glyph, label: 'High' }}
        items={b.shouldDo}
        db={db}
        onOpen={onOpen}
        empty={{ icon: 'CheckCircle2', title: 'Nothing pressing' }}
      />
      {b.canDo.length > 0 && (
        <Group
          title="Can do"
          badge={{ color: PRIORITY.P2.color, glyph: PRIORITY.P2.glyph, label: 'Medium' }}
          items={b.canDo}
          db={db}
          onOpen={onOpen}
          compact
        />
      )}
    </div>
  );
}

function MeetingPrepPanel({ meetings }: { meetings: ReturnType<typeof meetingPrep> }) {
  return (
    <Panel className="p-4">
      <SectionHeader label="Before you walk in" title="Meeting preparation" />
      <div className="mt-3 flex flex-col gap-3">
        {meetings.map((m) => (
          <div key={`${m.date}-${m.title}`} className="panel-flat p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip glyph="◷">{m.when}</Chip>
              <span className="text-[13.5px] font-semibold">{m.title}</span>
              <span className="text-[12px] text-[var(--ink-3)]">{formatDateLong(m.date)}</span>
            </div>
            {m.related.length + m.commitments.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-[var(--ink-3)]">Nothing outstanding from this thread.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
                {m.commitments.map((i) => (
                  <li key={i.id} className="flex items-start gap-2">
                    <Icon name="Send" size={12} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
                    <span><span className="text-[var(--ink-3)]">You said you would</span> {lower(i.title)}</span>
                  </li>
                ))}
                {m.related.map((i) => (
                  <li key={i.id} className="flex items-start gap-2">
                    <Icon name="Inbox" size={12} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
                    <span>{i.title}</span>
                  </li>
                ))}
                {m.waiting.map((i) => (
                  <li key={i.id} className="flex items-start gap-2">
                    <Icon name="Hourglass" size={12} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
                    <span className="text-[var(--ink-3)]">Still waiting: {i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/* -------------------------------- groups -------------------------------- */

function Group({
  title, hint, items, db, onOpen, empty, compact, badge, renderExtra,
}: {
  title: string;
  hint?: string;
  items: ActionItem[];
  db: DB;
  onOpen: (i: ActionItem) => void;
  empty?: { icon?: string; title: string; body?: string };
  compact?: boolean;
  badge?: { color: string; glyph: string; label: string };
  renderExtra?: (i: ActionItem) => React.ReactNode;
}) {
  if (!items.length && !empty) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        label={badge ? undefined : title}
        title={
          badge ? (
            <span className="flex items-center gap-2">
              <Chip color={badge.color} glyph={badge.glyph}>{badge.label}</Chip>
              {title}
            </span>
          ) : undefined
        }
        right={items.length ? <span className="text-[12px] text-[var(--ink-3)]">{items.length}</span> : undefined}
      />
      {hint && <p className="text-[12.5px] text-[var(--ink-3)]">{hint}</p>}
      {items.length ? (
        items.map((i) => (
          <div key={i.id}>
            <ActionCard item={i} db={db} onOpen={onOpen} compact={compact} />
            {renderExtra?.(i)}
          </div>
        ))
      ) : (
        empty && <Panel><Empty icon={empty.icon} title={empty.title} body={empty.body} /></Panel>
      )}
    </section>
  );
}

/* ------------------------------ sync button ----------------------------- */

function SyncButton({ mail, db }: { mail: ReturnType<typeof useMail>; db: DB }) {
  const last = db.mail.sync.lastSyncAt;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {mail.sync.busy ? (
          <button type="button" className="btn" onClick={mail.cancel}>
            <Icon name="Loader2" size={14} className="animate-spin" /> Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => mail.run()}>
            <Icon name="RefreshCw" size={14} /> Sync
          </button>
        )}
      </div>
      <div className="text-[11.5px] text-[var(--ink-3)]" aria-live="polite">
        {mail.sync.busy
          ? `${mail.sync.phase}${mail.sync.total ? ` ${mail.sync.done}/${mail.sync.total}` : ''}`
          : mail.sync.last
            ? mail.sync.last.scanned === 0
              ? 'Nothing new'
              : `${mail.sync.last.created} new · ${mail.sync.last.merged} updated · ${mail.sync.last.scanned} read`
            : last
              ? `Last synced ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Not synced yet'}
      </div>
    </div>
  );
}
