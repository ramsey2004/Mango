import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { DB, Task } from '../lib/types';
import { actions } from '../store/store';
import { cn, relativeDay, formatMins, daysUntil, haptic } from '../lib/util';
import { Icon } from '../components/Icon';
import { Chip, Menu, useMotion, useToast } from '../components/ui';

export function Checkbox({ done, onToggle, color }: { done: boolean; onToggle: () => void; color?: string }) {
  const { off, spring } = useMotion();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        haptic(done ? 4 : 12);
        onToggle();
      }}
      aria-pressed={done}
      aria-label={done ? 'Mark not done' : 'Mark done'}
      className="relative grid shrink-0 place-items-center rounded-[6px] transition-colors"
      style={{
        width: 18,
        height: 18,
        border: `1.5px solid ${done ? color ?? 'var(--good)' : 'var(--hairline-strong)'}`,
        background: done ? color ?? 'var(--good)' : 'transparent',
      }}
    >
      {done && (
        <motion.span
          initial={off ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
          className="grid place-items-center"
        >
          <Icon name="Check" size={12} strokeWidth={3} style={{ color: 'var(--ground)' }} />
        </motion.span>
      )}
    </button>
  );
}

export function TaskRow({
  task,
  db,
  onOpen,
  compact,
  showMeta = true,
  draggable,
  onDragStart,
}: {
  task: Task;
  db: DB;
  onOpen?: (t: Task) => void;
  compact?: boolean;
  showMeta?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const toast = useToast();
  const { off, spring } = useMotion();
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const swiping = useRef(false);

  const priority = db.priorities.find((p) => p.id === task.priorityId);
  const area = db.areas.find((a) => a.id === task.areaId);
  const goal = db.goals.find((g) => g.id === task.goalId);
  const project = db.projects.find((p) => p.id === task.projectId);
  const subtasks = db.tasks.filter((t) => t.parentId === task.id);
  const subDone = subtasks.filter((t) => t.status === 'done').length;
  const n = daysUntil(task.due);
  const overdue = n !== null && n < 0 && task.status !== 'done';
  const done = task.status === 'done';

  const complete = () => {
    actions.toggleTask(task.id);
    if (!done) {
      toast({
        text: `Completed “${task.title}”`,
        tone: 'good',
        action: { label: 'Undo', run: () => actions.toggleTask(task.id) },
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    swiping.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 8) swiping.current = true;
    if (swiping.current) setDx(Math.max(-110, Math.min(110, delta)));
  };
  const onPointerUp = () => {
    if (dx > 70) {
      complete();
    } else if (dx < -70) {
      actions.postponeTask(task.id, 1);
      haptic(10);
      toast({ text: `“${task.title}” moved to tomorrow`, tone: 'info' });
    }
    setDx(0);
    startX.current = null;
    setTimeout(() => {
      swiping.current = false;
    }, 40);
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{ borderRadius: 10 }}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between px-4 text-[12px] font-semibold">
          <span style={{ color: 'var(--good)', opacity: dx > 20 ? 1 : 0.35 }}>Complete</span>
          <span style={{ color: 'var(--info)', opacity: dx < -20 ? 1 : 0.35 }}>Tomorrow</span>
        </div>
      )}
      <motion.div
        layout={!off}
        transition={spring}
        style={{ x: dx, background: dx !== 0 ? 'var(--surface)' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'group relative flex items-start gap-3 rounded-[10px] px-2.5 row-hover',
          compact ? 'py-1.5' : 'py-2.5',
          onOpen && 'cursor-pointer',
        )}
        onClick={() => {
          if (!swiping.current) onOpen?.(task);
        }}
      >
        <div className={compact ? 'pt-[1px]' : 'pt-[2px]'}>
          <Checkbox done={done} onToggle={complete} color={priority?.color} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                'text-[13.5px] leading-snug',
                done ? 'line-through text-[var(--ink-3)]' : 'text-[var(--ink)]',
                task.status === 'doing' && 'font-semibold',
              )}
            >
              {task.title || 'Untitled task'}
            </span>
            {task.recurrence && <Icon name="Repeat" size={12} className="mt-[3px] text-[var(--ink-3)] shrink-0" />}
            {task.status === 'blocked' && <Icon name="CircleSlash" size={12} className="mt-[3px] shrink-0" style={{ color: 'var(--critical)' }} />}
          </div>

          {showMeta && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--ink-3)]">
              {task.due && (
                <span className="inline-flex items-center gap-1" style={overdue ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
                  <Icon name="Calendar" size={11} />
                  {relativeDay(task.due)}
                </span>
              )}
              {task.effortMins > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="Clock" size={11} />
                  {formatMins(task.effortMins)}
                </span>
              )}
              {area && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                  {area.name}
                </span>
              )}
              {(goal || project) && (
                <span className="inline-flex items-center gap-1 truncate max-w-[16rem]">
                  <Icon name={project ? 'Layers' : 'Target'} size={11} />
                  {project?.name ?? goal?.name}
                </span>
              )}
              {subtasks.length > 0 && (
                <span className="inline-flex items-center gap-1 num">
                  <Icon name="ListChecks" size={11} />
                  {subDone}/{subtasks.length}
                </span>
              )}
              {task.tags.filter((t) => !t.startsWith('__')).map((t) => (
                <span key={t} className="text-[var(--ink-3)]">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {priority && (
            <Chip color={priority.color} glyph={priority.glyph} className="hidden sm:inline-flex">
              {priority.name}
            </Chip>
          )}
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Menu
              trigger={<Icon name="MoreHorizontal" size={15} />}
              items={[
                { label: 'Edit', icon: 'Pencil', run: () => onOpen?.(task) },
                { label: 'Duplicate', icon: 'Copy', run: () => actions.duplicateTask(task.id) },
                'separator',
                { label: 'Do today', icon: 'Zap', run: () => actions.scheduleTask(task.id, new Date().toISOString().slice(0, 10)) },
                { label: 'Tomorrow', icon: 'ArrowRight', run: () => actions.postponeTask(task.id, 1) },
                { label: 'Next week', icon: 'CalendarDays', run: () => actions.postponeTask(task.id, 7) },
                'separator',
                { label: task.archived ? 'Unarchive' : 'Archive', icon: 'Archive', run: () => actions.archiveTask(task.id, !task.archived) },
                {
                  label: 'Delete',
                  icon: 'Trash2',
                  danger: true,
                  run: () => {
                    const snapshot = task;
                    actions.deleteTask(task.id);
                    toast({
                      text: `Deleted “${snapshot.title}”`,
                      tone: 'warning',
                      action: { label: 'Undo', run: () => actions.addTask(snapshot) },
                    });
                  },
                },
              ]}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
