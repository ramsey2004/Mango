import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { DB } from '../lib/types';
import { actions } from '../store/store';
import { rankTasks } from '../engine/priority';
import { openTasks } from '../engine/jarvis';
import { Ring, Segmented, useMotion, useToast, Select } from '../components/ui';
import { Icon } from '../components/Icon';
import { Orb } from '../components/Orb';
import { formatMins, haptic } from '../lib/util';

export function FocusMode({ db, taskId, onExit }: { db: DB; taskId?: string; onExit: () => void }) {
  const toast = useToast();
  const { off } = useMotion();
  const ranked = rankTasks(db, openTasks(db));
  const [currentId, setCurrentId] = useState<string | undefined>(taskId ?? ranked[0]?.task.id);
  const task = db.tasks.find((t) => t.id === currentId);
  const goal = db.goals.find((g) => g.id === task?.goalId);
  const project = db.projects.find((p) => p.id === task?.projectId);

  const [preset, setPreset] = useState<'25' | '50' | 'custom'>('25');
  const [customMin, setCustomMin] = useState(db.settings.pomodoroWork);
  const workMin = preset === '25' ? 25 : preset === '50' ? 50 : customMin;
  const breakMin = preset === '25' ? 5 : preset === '50' ? 10 : db.settings.pomodoroBreak;

  const [phase, setPhase] = useState<'work' | 'break'>('work');
  const [left, setLeft] = useState(workMin * 60);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<string | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    setLeft((phase === 'work' ? workMin : breakMin) * 60);
  }, [workMin, breakMin, phase]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          haptic(30);
          if (phase === 'work') {
            elapsedRef.current += workMin;
            if (startedAt.current) {
              actions.logFocus({ taskId: currentId, startedAt: startedAt.current, endedAt: new Date().toISOString(), minutes: workMin, mode: `${workMin}/${breakMin}` });
              startedAt.current = null;
            }
            setPhase('break');
            toast({ text: 'Session complete — take the break.', tone: 'good' });
            return breakMin * 60;
          }
          setPhase('work');
          return workMin * 60;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, workMin, breakMin, currentId, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const toggle = () => {
    setRunning((r) => {
      if (!r && phase === 'work' && !startedAt.current) startedAt.current = new Date().toISOString();
      return !r;
    });
  };

  const total = (phase === 'work' ? workMin : breakMin) * 60;
  const progress = ((total - left) / total) * 100;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: 'var(--ground)' }}>
      <div className="ambient" />
      <div className="relative flex items-center justify-between p-4 safe-t">
        <span className="label">Focus</span>
        <button className="btn btn-ghost" onClick={onExit}>
          <Icon name="X" size={16} />
          Exit
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 text-center">
        <Orb state={running ? 'processing' : 'idle'} size={112} />

        <div className="max-w-[42rem]">
          {task ? (
            <>
              <div className="label mb-3">{phase === 'work' ? 'Working on' : 'On a break — next up'}</div>
              <h1 className="display text-[clamp(26px,5vw,44px)] leading-tight text-balance">{task.title}</h1>
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--ink-3)]">
                {goal && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="Target" size={12} />
                    {goal.name}
                  </span>
                )}
                {project && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="Layers" size={12} />
                    {project.name}
                  </span>
                )}
                {task.effortMins > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="Clock" size={12} />
                    estimated {formatMins(task.effortMins)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <h1 className="display text-[clamp(24px,4vw,36px)]">Nothing open to focus on</h1>
          )}
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <Ring value={progress} size={168} stroke={5} color={phase === 'work' ? 'var(--accent)' : 'var(--good)'}>
              <span className="num text-[34px] font-semibold tracking-tight">
                {mm}:{ss}
              </span>
            </Ring>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button className="btn btn-primary !px-5 !py-2.5" onClick={toggle}>
              <Icon name={running ? 'Pause' : 'Play'} size={15} />
              {running ? 'Pause' : 'Start'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setRunning(false);
                setLeft((phase === 'work' ? workMin : breakMin) * 60);
              }}
            >
              <Icon name="RotateCcw" size={14} />
              Reset
            </button>
            {task && (
              <button
                className="btn"
                onClick={() => {
                  actions.toggleTask(task.id);
                  const next = ranked.find((s) => s.task.id !== task.id);
                  setCurrentId(next?.task.id);
                  setRunning(false);
                  toast({ text: 'Completed — next task loaded', tone: 'good' });
                }}
              >
                <Icon name="Check" size={14} />
                Done
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Segmented
              value={preset}
              onChange={setPreset}
              size="sm"
              options={[
                { value: '25', label: '25 / 5' },
                { value: '50', label: '50 / 10' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {preset === 'custom' && (
              <input
                className="field !w-24 !py-1.5"
                type="number"
                min={1}
                max={180}
                value={customMin}
                onChange={(e) => setCustomMin(Math.max(1, Number(e.target.value)))}
                aria-label="Custom minutes"
              />
            )}
          </div>

          {ranked.length > 1 && (
            <Select
              value={currentId ?? ''}
              onChange={(v) => {
                setCurrentId(v);
                setRunning(false);
              }}
              ariaLabel="Choose a different task"
              className="w-[min(90vw,26rem)]"
              options={ranked.slice(0, 25).map((s) => ({ value: s.task.id, label: s.task.title }))}
            />
          )}

          {elapsedRef.current > 0 && (
            <div className="text-[12px] text-[var(--ink-3)]">{formatMins(elapsedRef.current)} logged this session</div>
          )}
        </div>
      </div>

      <div className="relative pb-5 text-center text-[11.5px] text-[var(--ink-3)] safe-b">
        Space to start or pause · Esc to leave
      </div>
    </div>
  );
}
