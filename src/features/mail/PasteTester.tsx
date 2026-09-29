import { useMemo, useState } from 'react';
import type { DB } from '../../lib/types';
import type { RawMessage } from '../../lib/mail-types';
import { actions } from '../../store/store';
import { Panel, SectionHeader, Field, Chip, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { extract } from '../../engine/mail/extract';
import { parseDeadline } from '../../engine/mail/dates';
import { score, whyLine } from '../../engine/mail/score';
import { freshBody } from '../../engine/mail/clean';
import { PRIORITY } from './ActionCard';
import { formatDateLong } from '../../lib/util';

/* ============================================================
   Paste an email and see what Mango makes of it.

   This exists because connecting Gmail is a real piece of setup —
   a Google Cloud project, an OAuth client, a redirect URI — and
   nobody should have to do all that to find out whether the thing
   works on their mail. Paste a message, see the task, the
   deadline and the reasoning, decide whether it is worth
   connecting.

   It runs the same engine the sync path runs. Nothing here is a
   simulation of the real behaviour; it IS the real behaviour,
   with the message coming from the clipboard instead of the API.
   ============================================================ */

const SAMPLE = `From: Dr. Seema Gupta <seemag@example.ac.in>
Subject: Assessment marks

Dear Students
PFA the Mid-Term assessment pertaining to the Financial Accounting course.
In case of any issue, please reach out to me by 20th September 2026.
Thereafter, no request will be entertained.

--
Dr. Seema Gupta
Associate Professor`;

/** Accepts a pasted message with or without headers. */
function parsePasted(raw: string, selfEmail: string): RawMessage {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let from = '';
  let subject = '';
  let to: string[] = [];
  let date: number | null = null;
  let i = 0;

  // Read a header block only while the lines still look like headers.
  for (; i < lines.length && i < 25; i++) {
    const l = lines[i];
    if (!l.trim()) { if (from || subject) { i++; } break; }
    const m = l.match(/^(from|subject|to|cc|date|sent)\s*:\s*(.*)$/i);
    if (!m) break;
    const key = m[1].toLowerCase();
    const v = m[2].trim();
    if (key === 'from') from = v;
    else if (key === 'subject') subject = v;
    else if (key === 'to') to = v.split(',').map((x) => x.trim().replace(/.*<|>.*/g, '')).filter(Boolean);
    else if (key === 'date' || key === 'sent') { const t = Date.parse(v); if (!Number.isNaN(t)) date = t; }
  }

  const body = lines.slice(i).join('\n').trim() || raw;
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([\w.+-]+@[\w.-]+)/);
  const fromEmail = (emailMatch?.[1] ?? 'someone@example.com').toLowerCase();

  return {
    id: 'paste',
    threadId: 'paste',
    labelIds: ['INBOX'],
    internalDate: date ?? Date.now(),
    from: from || 'Unknown sender',
    fromEmail,
    to: to.length ? to : [selfEmail],
    cc: [],
    subject: subject || '(no subject)',
    body,
    snippet: '',
    selfEmail,
  };
}

export function PasteTester({ db }: { db: DB }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [selfEmail, setSelfEmail] = useState(db.mail.account?.email ?? 'me@example.com');

  const result = useMemo(() => {
    if (!text.trim()) return null;
    const msg = parsePasted(text, selfEmail);
    const cleaned = freshBody(msg.body);
    const candidates = extract(msg, { timezone: db.mail.settings.timezone });
    const at = new Date(msg.internalDate);

    return {
      msg,
      cleaned,
      items: candidates.map((c) => {
        const s = score({
          kind: c.kind,
          category: c.category,
          deadline: c.deadline.date,
          deadlineText: c.deadline.text,
          deadlineConfidence: c.deadline.confidence,
          evidence: c.evidence,
          subject: msg.subject,
          fromEmail: msg.fromEmail,
          senderHistory: 0,
          senderTrusted: false,
          threadActive: false,
          now: at,
          timezone: db.mail.settings.timezone,
        });
        return { c, s };
      }),
    };
  }, [text, selfEmail, db.mail.settings.timezone]);

  return (
    <Panel className="p-4">
      <SectionHeader
        label="No setup required"
        title="Try it on a real email"
        right={
          <button className="btn btn-ghost !text-[12px]" onClick={() => setText(SAMPLE)}>
            Use an example
          </button>
        }
      />
      <p className="mt-2 max-w-[64ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Paste any email — headers optional — and see exactly what Mango would make of it. This runs the
        same engine the sync does, so it is a real answer, not a preview. Nothing is saved unless you
        choose to keep it.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Your own address" hint="So it can tell a request of you from one you sent.">
            <input className="field" value={selfEmail} onChange={(e) => setSelfEmail(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="The email">
            <textarea
              className="field min-h-[14rem] font-mono text-[12px] leading-relaxed"
              placeholder={'From: …\nSubject: …\n\nPaste the message here.'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </Field>
          {text && (
            <button className="btn btn-ghost !text-[12px] self-start" onClick={() => setText('')}>
              <Icon name="X" size={13} /> Clear
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {!result && (
            <div className="rounded-xl p-4 text-[12.5px] text-[var(--ink-3)]" style={{ background: 'var(--sunken)', border: '1px dashed var(--hairline-strong)' }}>
              Paste something on the left and the result appears here.
            </div>
          )}

          {result && result.items.length === 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Icon name="CircleSlash" size={14} className="text-[var(--ink-3)]" />
                Nothing actionable
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
                Mango would not create a task from this. That is the intended answer for most
                email — acknowledgements, attachments, announcements and courtesy all land here.
              </p>
            </div>
          )}

          {result?.items.map(({ c, s }, i) => {
            const p = PRIORITY[s.priority];
            return (
              <div key={i} className="panel p-3" style={{ borderLeft: `3px solid ${p.color}` }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip color={p.color} glyph={p.glyph}>{p.short}</Chip>
                  <Chip>{Math.round(c.confidence * 100)}% sure</Chip>
                  <Chip>{c.kind}</Chip>
                  <Chip>{c.category}</Chip>
                </div>
                <h3 className="mt-2 text-[14.5px] font-semibold leading-snug">{c.title}</h3>

                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                  <dt className="text-[var(--ink-3)]">Deadline</dt>
                  <dd>
                    {c.deadline.date
                      ? <>{formatDateLong(c.deadline.date)} <span className="text-[var(--ink-3)]">— read from “{c.deadline.text}”, {c.deadline.confidence}</span></>
                      : <span className="text-[var(--ink-3)]">none found{c.deadline.text ? ` — “${c.deadline.text}” could not be resolved` : ''}</span>}
                  </dd>
                  <dt className="text-[var(--ink-3)]">Urgency</dt>
                  <dd>{s.urgency}/100</dd>
                  <dt className="text-[var(--ink-3)]">Importance</dt>
                  <dd>{s.importance}/100</dd>
                  <dt className="text-[var(--ink-3)]">In short</dt>
                  <dd className="italic">{whyLine({ reasons: s.reasons, priority: s.priority, deadlineText: c.deadline.text, deadlineConfidence: c.deadline.confidence })}</dd>
                </dl>

                {c.deadline.options && (
                  <p className="mt-2 rounded-lg p-2 text-[12px]" style={{ background: 'var(--sunken)' }}>
                    “{c.deadline.text}” is ambiguous — it could be{' '}
                    {c.deadline.options.map((o) => o.label).join(' or ')}. Mango would ask rather than guess.
                  </p>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-[12px] text-[var(--ink-3)]">The full working</summary>
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
                    {s.reasons.map((r, j) => (
                      <li key={j} className="flex items-baseline justify-between gap-3">
                        <span>{r.label}{r.detail && <span className="text-[var(--ink-3)]"> · {r.detail}</span>}</span>
                        {r.delta !== 0 && <span className="shrink-0 tabular-nums text-[var(--ink-3)]">{r.delta > 0 ? '+' : ''}{Math.round(r.delta)}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <div className="label mb-1">The sentence it came from</div>
                    <blockquote className="border-l-2 pl-2 text-[12px] italic text-[var(--ink-2)]" style={{ borderColor: 'var(--hairline-strong)' }}>
                      “{c.evidence}”
                    </blockquote>
                  </div>
                </details>

                <button
                  className="btn mt-2.5 !text-[12px]"
                  onClick={() => {
                    const r = actions.runIngest([result.msg]);
                    toast({
                      text: r.created ? 'Kept — it is in your Action Centre' : 'Already there',
                      tone: 'good',
                    });
                  }}
                >
                  <Icon name="Check" size={13} /> Keep this one
                </button>
              </div>
            );
          })}

          {result && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-[var(--ink-3)]">What it read, after stripping quotes and signatures</summary>
              <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11.5px]" style={{ background: 'var(--sunken)' }}>
                {result.cleaned || '(nothing left after cleaning)'}
              </pre>
            </details>
          )}
        </div>
      </div>
    </Panel>
  );
}
