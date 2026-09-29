import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DB } from '../lib/types';
import { useNav } from '../store/nav';
import { actions, undo } from '../store/store';
import { runCommand, SUGGESTIONS, type Answer } from '../engine/assistant';
import { briefing } from '../engine/jarvis';
import { providerFrom, buildContext } from '../engine/ai';
import { Panel, SectionHeader, Empty, useMotion, useToast, Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { Orb, type OrbState } from '../components/Orb';
import { TaskRow } from './TaskRow';
import { formatMins, pluralise } from '../lib/util';

interface Turn {
  id: string;
  role: 'you' | 'assistant';
  text: string;
  answer?: Answer;
}

export function Jarvis({ db }: { db: DB }) {
  const nav = useNav();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [orb, setOrb] = useState<OrbState>('idle');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { rise, spring } = useMotion();
  const b = briefing(db);
  const provider = providerFrom(db);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { id: Math.random().toString(36).slice(2), role: 'you', text }]);
    setOrb('processing');
    setBusy(true);

    const local = runCommand(text, db);

    if (local.source === 'local') {
      setTimeout(() => {
        setTurns((t) => [...t, { id: Math.random().toString(36).slice(2), role: 'assistant', text: '', answer: local }]);
        setOrb(local.mutated ? 'celebrate' : 'responding');
        setBusy(false);
        setTimeout(() => setOrb('idle'), 1400);
      }, 180);
      return;
    }

    if (!provider.isConfigured()) {
      setTurns((t) => [
        ...t,
        {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          text: '',
          answer: {
            lines: [
              'I do not have a rule for that, and no AI endpoint is connected — so I am not going to guess.',
              'What I can answer from your data: priorities, overdue work, deadlines, what is falling behind, a plan for the day, and your weekly review. I can also add tasks, move them, and mark them complete.',
              'To handle free-form questions, connect an OpenAI-compatible endpoint in Settings → Assistant. Nothing leaves this device until you do.',
            ],
            source: 'none',
            go: { view: 'settings' },
          },
        },
      ]);
      setOrb('alert');
      setBusy(false);
      setTimeout(() => setOrb('idle'), 1800);
      return;
    }

    try {
      const reply = await provider.ask(text, buildContext(db));
      setTurns((t) => [
        ...t,
        { id: Math.random().toString(36).slice(2), role: 'assistant', text: '', answer: { lines: reply.split('\n').filter(Boolean), source: 'ai' } },
      ]);
      setOrb('responding');
    } catch (err) {
      setTurns((t) => [
        ...t,
        {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          text: '',
          answer: { lines: [`The endpoint could not be reached. ${(err as Error).message}`], source: 'none' },
        },
      ]);
      setOrb('alert');
    } finally {
      setBusy(false);
      setTimeout(() => setOrb('idle'), 1600);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Orb state={orb} size={64} />
          <div>
            <div className="label mb-1">Assistant</div>
            <h1 className="display text-[clamp(24px,3.6vw,34px)] leading-none">Ask about your own work</h1>
          </div>
        </div>
        {turns.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setTurns([])}>
            <Icon name="RotateCcw" size={14} />
            Clear
          </button>
        )}
      </header>

      {/* -------------------------- daily briefing ------------------------- */}
      {turns.length === 0 && (
        <Panel className="p-5 sm:p-6">
          <SectionHeader label={b.dateLine} title="Daily briefing" />
          <div className="mt-4 grid gap-5 sm:grid-cols-4">
            <div>
              <div className="num text-[30px] font-semibold leading-none">{b.counts.today}</div>
              <div className="label mt-1.5">tasks today</div>
            </div>
            <div>
              <div className="num text-[30px] font-semibold leading-none">{b.counts.high}</div>
              <div className="label mt-1.5">high priority</div>
            </div>
            <div>
              <div className="num text-[30px] font-semibold leading-none" style={{ color: b.counts.overdue ? 'var(--critical)' : undefined }}>
                {b.counts.overdue}
              </div>
              <div className="label mt-1.5">overdue</div>
            </div>
            <div>
              <div className="num text-[30px] font-semibold leading-none">{b.counts.deadlines}</div>
              <div className="label mt-1.5">deadlines this week</div>
            </div>
          </div>

          <p className="mt-5 text-[13.5px] text-[var(--ink-2)] leading-relaxed max-w-[64ch]">
            {b.headline} You have {formatMins(b.minutesPlanned)} of estimated work scheduled, and {b.goalsOnTrack} of{' '}
            {b.goalsTotal} active goals are keeping pace.
          </p>

          {b.top.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2">
              {b.top.map((r, i) => (
                <li key={r.scored.task.id} className="flex items-start gap-3">
                  <span className="num text-[11px] text-[var(--ink-3)] pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[13.5px]">{r.headline}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => send('What should I do now?')}>
              <Icon name="Sparkles" size={14} />
              What should I do now?
            </button>
            <button className="btn" onClick={() => send('Plan my day')}>
              Plan my day
            </button>
            <button className="btn" onClick={() => send('What is overdue?')}>
              Show overdue
            </button>
            <button className="btn" onClick={() => send('What am I falling behind on?')}>
              What is slipping?
            </button>
          </div>
        </Panel>
      )}

      {/* ----------------------------- transcript -------------------------- */}
      {turns.length > 0 && (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.div key={t.id} {...rise} transition={spring}>
                {t.role === 'you' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[42rem] rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px]" style={{ background: 'var(--accent-soft)', border: '1px solid var(--hairline)' }}>
                      {t.text}
                    </div>
                  </div>
                ) : (
                  <AnswerBlock answer={t.answer!} db={db} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      )}

      {/* ------------------------------- input ---------------------------- */}
      <Panel className="sticky bottom-[4.75rem] lg:bottom-4 p-3 z-20" style={{ boxShadow: 'var(--shadow-2)' }}>
        <div className="flex items-center gap-2">
          <Icon name="Sparkles" size={15} className="text-[var(--ink-3)] ml-1 shrink-0" />
          <input
            className="field !border-none !bg-transparent !px-1"
            placeholder={provider.isConfigured() ? 'Ask anything about your work' : 'Try: what should I do now?'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            disabled={busy}
          />
          <button className="btn btn-primary shrink-0" onClick={() => send(input)} disabled={!input.trim() || busy}>
            {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="ArrowRight" size={14} />}
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.slice(0, 6).map((s) => (
            <button key={s} className="chip row-hover" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <p className="mt-2.5 px-1 text-[11px] text-[var(--ink-3)]">
          {provider.isConfigured()
            ? `Free-form questions go to ${db.settings.aiModel} at your configured endpoint. Everything else is answered locally.`
            : 'Answered entirely on this device from your own records. No model is connected — connect one in Settings if you want free-form questions.'}
        </p>
      </Panel>
    </div>
  );
}

function AnswerBlock({ answer, db }: { answer: Answer; db: DB }) {
  const nav = useNav();
  const toast = useToast();

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <Icon name={answer.source === 'ai' ? 'Sparkles' : answer.source === 'none' ? 'Info' : 'Compass'} size={15} className="text-[var(--ink-3)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1.5">
            {answer.lines.map((l, i) => (
              <p key={i} className="text-[13.5px] leading-relaxed text-[var(--ink)]">
                {l}
              </p>
            ))}
          </div>

          {answer.recs && answer.recs.length > 1 && (
            <div className="mt-4">
              <div className="label mb-2">Then</div>
              <ol className="flex flex-col gap-1.5">
                {answer.recs.slice(1).map((r, i) => (
                  <li key={r.scored.task.id} className="flex items-center gap-3 text-[13px]">
                    <span className="num text-[11px] text-[var(--ink-3)]">{String(i + 2).padStart(2, '0')}</span>
                    <span className="flex-1 truncate">{r.headline}</span>
                    <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.startFocus(r.scored.task.id)}>
                      Start
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {answer.recs && answer.recs[0] && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => nav.startFocus(answer.recs![0].scored.task.id)}>
                <Icon name="Play" size={13} />
                Start
              </button>
              <button className="btn" onClick={() => nav.openTask(answer.recs![0].scored.task)}>
                Open
              </button>
              <button
                className="btn"
                onClick={() => {
                  actions.postponeTask(answer.recs![0].scored.task.id, 1);
                  toast({ text: 'Rescheduled to tomorrow', tone: 'info' });
                }}
              >
                Reschedule
              </button>
            </div>
          )}

          {answer.plan && answer.plan.blocks.length > 0 && (
            <ol className="mt-4 flex flex-col">
              {answer.plan.blocks.map((blk) => (
                <li key={blk.id} className="flex items-baseline gap-4 py-1.5">
                  <span className="num text-[12px] text-[var(--ink-3)] w-[7.5rem] shrink-0">{blk.label}</span>
                  <span className="text-[13px]">{blk.title}</span>
                </li>
              ))}
            </ol>
          )}

          {answer.tasks && answer.tasks.length > 0 && (
            <div className="mt-3 -mx-2.5 max-h-[24rem] overflow-y-auto">
              {answer.tasks.slice(0, 25).map((t) => (
                <TaskRow key={t.id} task={t} db={db} compact onOpen={nav.openTask} />
              ))}
            </div>
          )}

          {answer.goals && answer.goals.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {answer.goals.map((g) => (
                <button key={g.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 row-hover text-left" onClick={() => nav.go('goals', g.id)}>
                  <Icon name="Target" size={13} className="text-[var(--ink-3)]" />
                  <span className="text-[13px]">{g.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {answer.go && (
              <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go(answer.go!.view, answer.go!.id)}>
                Open the full view
                <Icon name="ArrowRight" size={12} />
              </button>
            )}
            {answer.mutated && (
              <button
                className="btn btn-ghost !py-1 !text-[12px]"
                onClick={() => {
                  undo();
                  toast({ text: 'Reverted', tone: 'info' });
                }}
              >
                <Icon name="Undo2" size={12} />
                Undo that
              </button>
            )}
            <Chip className="ml-auto">{answer.source === 'ai' ? 'via your endpoint' : 'computed locally'}</Chip>
          </div>
        </div>
      </div>
    </Panel>
  );
}
