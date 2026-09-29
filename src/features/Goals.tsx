import { useEffect, useMemo, useState } from 'react';
import type { DB, Goal, GoalStatus } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { goalHealth } from '../engine/priority';
import { Panel, SectionHeader, Bar, Chip, Empty, Field, Select, Stepper, Modal, ConfirmDialog, Menu, Segmented, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import { cn, relativeDay, pluralise, formatDateLong } from '../lib/util';

const STATUS: Array<{ value: GoalStatus; label: string; color: string }> = [
  { value: 'not_started', label: 'Not started', color: '#616a78' },
  { value: 'planning', label: 'Planning', color: '#6c9bf0' },
  { value: 'active', label: 'Active', color: '#3ec08c' },
  { value: 'at_risk', label: 'At risk', color: '#dfa62f' },
  { value: 'blocked', label: 'Blocked', color: '#f2555a' },
  { value: 'completed', label: 'Completed', color: '#3ec08c' },
  { value: 'paused', label: 'Paused', color: '#98a1ae' },
  { value: 'archived', label: 'Archived', color: '#616a78' },
];

const statusMeta = (s: GoalStatus) => STATUS.find((x) => x.value === s) ?? STATUS[0];

export function Goals({ db, focusId }: { db: DB; focusId?: string }) {
  const nav = useNav();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<'live' | 'all' | 'done'>('live');
  const [areaFilter, setAreaFilter] = useState('');

  const goals = db.goals
    .filter((g) => !g.archived)
    .filter((g) => (areaFilter ? g.areaId === areaFilter : true))
    .filter((g) =>
      filter === 'all' ? true : filter === 'done' ? g.status === 'completed' : !['completed', 'archived'].includes(g.status),
    );

  const byObjective = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = g.objectiveId ?? '__none';
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    return map;
  }, [goals]);

  const focused = focusId ? db.goals.find((g) => g.id === focusId) : undefined;

  if (focused) return <GoalDetail db={db} goal={focused} onEdit={() => setEditing(focused)} editing={editing} setEditing={setEditing} />;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">{pluralise(goals.length, 'goal')} · what you are actually trying to achieve</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Goals</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'live', label: 'In play' },
              { value: 'done', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Select
            value={areaFilter}
            onChange={setAreaFilter}
            ariaLabel="Filter by area"
            options={[{ value: '', label: 'All areas' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
            className="w-[10rem]"
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              const g = actions.addGoal({ name: 'New goal' });
              setEditing(g);
            }}
          >
            <Icon name="Plus" size={14} />
            Goal
          </button>
        </div>
      </header>

      {goals.length === 0 ? (
        <Panel className="p-2">
          <Empty
            icon="Target"
            title="No goals here yet"
            body="A goal is the thing tasks are in service of. Without one, the priority engine has nothing to weigh work against."
            action={
              <button className="btn btn-primary" onClick={() => setEditing(actions.addGoal({ name: 'New goal' }))}>
                Create the first goal
              </button>
            }
          />
        </Panel>
      ) : (
        [...byObjective.entries()].map(([objId, list]) => {
          const obj = db.objectives.find((o) => o.id === objId);
          return (
            <section key={objId} className="flex flex-col gap-3">
              {obj && (
                <div className="flex items-baseline gap-2">
                  <h2 className="label">{obj.name}</h2>
                  <span className="num text-[11px] text-[var(--ink-3)]">{list.length}</span>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {list.map((g) => (
                  <GoalCard key={g.id} db={db} goal={g} onEdit={() => setEditing(g)} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <GoalEditor db={db} goal={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function GoalCard({ db, goal, onEdit }: { db: DB; goal: Goal; onEdit: () => void }) {
  const nav = useNav();
  const h = goalHealth(db, goal);
  const area = db.areas.find((a) => a.id === goal.areaId);
  const meta = statusMeta(goal.status);
  const priority = db.priorities.find((p) => p.id === goal.priorityId);
  const riskColor =
    h.risk === 'at_risk' ? 'var(--critical)' : h.risk === 'watch' ? 'var(--warning)' : h.risk === 'done' ? 'var(--good)' : 'var(--ink-3)';

  return (
    <Panel className="p-4 sm:p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => nav.go('goals', goal.id)}>
          <div className="flex items-center gap-2 mb-1.5">
            {area && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                {area.name}
              </span>
            )}
            {priority && <Chip color={priority.color} glyph={priority.glyph}>{priority.name}</Chip>}
          </div>
          <h3 className="text-[15.5px] font-bold leading-snug tracking-tight hover:text-[var(--accent)] transition-colors">
            {goal.name}
          </h3>
          {goal.description && <p className="mt-1 text-[12.5px] text-[var(--ink-3)] line-clamp-2">{goal.description}</p>}
        </button>
        <Menu
          trigger={<Icon name="MoreHorizontal" size={15} />}
          items={[
            { label: 'Edit', icon: 'Pencil', run: onEdit },
            { label: 'Open', icon: 'ArrowRight', run: () => nav.go('goals', goal.id) },
            'separator',
            { label: 'Mark complete', icon: 'Check', run: () => actions.updateGoal(goal.id, { status: 'completed' }) },
            { label: 'Archive', icon: 'Archive', run: () => actions.updateGoal(goal.id, { archived: true, status: 'archived' }) },
            { label: 'Delete', icon: 'Trash2', danger: true, run: () => actions.deleteGoal(goal.id) },
          ]}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="num text-[13px] font-semibold">{h.progress}%</span>
          <span className="text-[11.5px] text-[var(--ink-3)]">
            {goal.progressMode === 'manual' ? 'set by hand' : `${h.done}/${h.total} tasks`}
          </span>
        </div>
        <Bar value={h.progress} color={area?.color ?? 'var(--accent)'} height={8} label={goal.name} />
        {h.expected !== null && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: riskColor }}>
            <Icon name={h.drift !== null && h.drift < 0 ? 'AlertTriangle' : 'TrendingUp'} size={11} />
            {h.drift !== null && h.drift < 0
              ? `${Math.abs(h.drift)} points behind pace`
              : `${h.drift} points ahead of pace`}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip color={meta.color}>{meta.label}</Chip>
        {goal.deadline && (
          <span className="text-[11.5px] text-[var(--ink-3)] inline-flex items-center gap-1">
            <Icon name="Calendar" size={11} />
            {relativeDay(goal.deadline)}
          </span>
        )}
        {h.lastMovedDays !== null && (
          <span className="text-[11.5px] text-[var(--ink-3)]">last moved {h.lastMovedDays}d ago</span>
        )}
      </div>
    </Panel>
  );
}

function GoalDetail({
  db,
  goal,
  onEdit,
  editing,
  setEditing,
}: {
  db: DB;
  goal: Goal;
  onEdit: () => void;
  editing: Goal | null;
  setEditing: (g: Goal | null) => void;
}) {
  const nav = useNav();
  const h = goalHealth(db, goal);
  const area = db.areas.find((a) => a.id === goal.areaId);
  const tasks = db.tasks.filter((t) => t.goalId === goal.id && !t.parentId && !t.archived);
  const projects = db.projects.filter((p) => p.goalId === goal.id && !p.archived);
  const milestones = db.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const notes = db.notes.filter((n) => n.links.some((l) => l.kind === 'goal' && l.id === goal.id));

  return (
    <div className="flex flex-col gap-5">
      <button className="btn btn-ghost self-start !pl-1.5" onClick={() => nav.go('goals')}>
        <Icon name="ChevronLeft" size={15} />
        All goals
      </button>

      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {area && (
                <span className="inline-flex items-center gap-1.5 label" style={{ color: area.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                  {area.name}
                </span>
              )}
              <Chip color={statusMeta(goal.status).color}>{statusMeta(goal.status).label}</Chip>
            </div>
            <h1 className="display text-[clamp(24px,3.6vw,34px)] leading-tight">{goal.name}</h1>
            {goal.description && <p className="mt-2 max-w-[62ch] text-[13.5px] text-[var(--ink-2)] leading-relaxed">{goal.description}</p>}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={onEdit}>
              <Icon name="Pencil" size={14} />
              Edit
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const t = actions.addTask({ title: 'New task', goalId: goal.id, areaId: goal.areaId });
                nav.openTask(t);
              }}
            >
              <Icon name="Plus" size={14} />
              Task
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between mb-2">
              <span className="label">Progress</span>
              <span className="num text-[15px] font-semibold">{h.progress}%</span>
            </div>
            <Bar value={h.progress} color={area?.color ?? 'var(--accent)'} height={10} label="Goal progress" />
            {h.expected !== null && (
              <div className="mt-2 text-[11.5px] text-[var(--ink-3)]">
                Calendar pace says {h.expected}% by now — you are {h.drift! < 0 ? `${Math.abs(h.drift!)} behind` : `${h.drift} ahead`}.
              </div>
            )}
          </div>
          <div>
            <div className="label mb-1.5">Deadline</div>
            <div className="text-[13.5px]">{goal.deadline ? formatDateLong(goal.deadline) : 'None set'}</div>
            {goal.deadline && <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{relativeDay(goal.deadline)}</div>}
          </div>
          <div>
            <div className="label mb-1.5">Importance</div>
            <div className="num text-[13.5px]">{goal.importance} / 5</div>
            <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">lifts every task under it</div>
          </div>
        </div>
      </Panel>

      {milestones.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Milestones" />
          <ul className="mt-3 flex flex-col gap-1">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
                <button
                  onClick={() => actions.updateMilestone(m.id, { done: !m.done })}
                  className="grid h-[18px] w-[18px] place-items-center rounded-[6px] shrink-0"
                  style={{ border: `1.5px solid ${m.done ? 'var(--good)' : 'var(--hairline-strong)'}`, background: m.done ? 'var(--good)' : 'transparent' }}
                  aria-label={m.done ? 'Mark not done' : 'Mark done'}
                >
                  {m.done && <Icon name="Check" size={12} strokeWidth={3} style={{ color: 'var(--ground)' }} />}
                </button>
                <span className={cn('flex-1 text-[13px]', m.done && 'line-through text-[var(--ink-3)]')}>{m.name}</span>
                {m.due && <span className="num text-[11.5px] text-[var(--ink-3)]">{relativeDay(m.due)}</span>}
                <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => actions.deleteMilestone(m.id)} aria-label="Delete milestone">
                  <Icon name="X" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {projects.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Projects under this goal" />
          <div className="mt-3 flex flex-col gap-1">
            {projects.map((p) => (
              <button key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left" onClick={() => nav.go('projects', p.id)}>
                <Icon name="Layers" size={14} className="text-[var(--ink-3)]" />
                <span className="flex-1 text-[13px]">{p.name}</span>
                <Icon name="ChevronRight" size={14} className="text-[var(--ink-3)]" />
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-4 sm:p-5">
        <SectionHeader
          title="Tasks"
          right={
            <button
              className="btn btn-ghost !py-1 !text-[12px]"
              onClick={() => {
                const t = actions.addTask({ title: 'New task', goalId: goal.id, areaId: goal.areaId });
                nav.openTask(t);
              }}
            >
              <Icon name="Plus" size={13} />
              Add
            </button>
          }
        />
        <div className="mt-2 -mx-2.5">
          {tasks.length ? (
            tasks.map((t) => <TaskRow key={t.id} task={t} db={db} onOpen={nav.openTask} />)
          ) : (
            <Empty icon="ListChecks" title="No tasks yet" body="A goal with no tasks cannot make progress automatically." />
          )}
        </div>
      </Panel>

      {notes.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Linked notes" />
          <div className="mt-3 flex flex-col gap-1">
            {notes.map((n) => (
              <button key={n.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left" onClick={() => nav.go('notes', n.id)}>
                <Icon name="StickyNote" size={14} className="text-[var(--ink-3)]" />
                <span className="flex-1 text-[13px] truncate">{n.title}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <GoalEditor db={db} goal={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

export function GoalEditor({ db, goal, open, onClose }: { db: DB; goal: Goal | null; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Goal | null>(goal);
  const [confirming, setConfirming] = useState(false);
  const [newMilestone, setNewMilestone] = useState('');
  const toast = useToast();

  useEffect(() => setDraft(goal), [goal]);
  if (!draft) return null;
  const patch = (p: Partial<Goal>) => setDraft({ ...draft, ...p });
  const milestones = db.milestones.filter((m) => m.goalId === draft.id);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title="Edit goal"
        footer={
          <>
            <button className="btn btn-danger mr-auto" onClick={() => setConfirming(true)}>
              Delete
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!draft.name.trim()) {
                  toast({ text: 'Give the goal a name.', tone: 'warning' });
                  return;
                }
                actions.updateGoal(draft.id, draft);
                onClose();
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal" className="sm:col-span-2">
            <input className="field" autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className="field min-h-[70px] resize-y" value={draft.description ?? ''} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
          <Field label="Area">
            <Select
              value={draft.areaId ?? ''}
              onChange={(v) => patch({ areaId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </Field>
          <Field label="Objective" hint="An optional layer above goals.">
            <Select
              value={draft.objectiveId ?? ''}
              onChange={(v) => patch({ objectiveId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.objectives.map((o) => ({ value: o.id, label: o.name }))]}
            />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={(v) => patch({ status: v as GoalStatus })} options={STATUS.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
          <Field label="Priority">
            <Select
              value={draft.priorityId}
              onChange={(v) => patch({ priorityId: v })}
              options={[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Deadline">
            <input className="field" type="date" value={draft.deadline ?? ''} onChange={(e) => patch({ deadline: e.target.value || undefined })} />
          </Field>
          <Field label="Importance" as="div">
            <Stepper value={draft.importance} onChange={(v) => patch({ importance: v })} />
          </Field>
          <Field label="Progress" className="sm:col-span-2" hint="Automatic counts completed tasks. Manual lets you set the number yourself." as="div">
            <div className="flex items-center gap-3">
              <Segmented
                value={draft.progressMode}
                onChange={(v) => patch({ progressMode: v })}
                options={[
                  { value: 'auto', label: 'From tasks' },
                  { value: 'manual', label: 'By hand' },
                ]}
              />
              {draft.progressMode === 'manual' && (
                <input
                  className="field !w-24"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.manualProgress}
                  onChange={(e) => patch({ manualProgress: Number(e.target.value) })}
                />
              )}
            </div>
          </Field>

          <div className="sm:col-span-2">
            <div className="label mb-2">Milestones</div>
            <div className="flex flex-col gap-1">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 row-hover">
                  <input
                    className="flex-1 bg-transparent border-none text-[13px] outline-none"
                    value={m.name}
                    onChange={(e) => actions.updateMilestone(m.id, { name: e.target.value })}
                  />
                  <input
                    className="field !w-[8.5rem] !py-1"
                    type="date"
                    value={m.due ?? ''}
                    onChange={(e) => actions.updateMilestone(m.id, { due: e.target.value || undefined })}
                  />
                  <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => actions.deleteMilestone(m.id)} aria-label="Delete">
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
              <input
                className="field mt-1"
                placeholder="Add a milestone and press Enter"
                value={newMilestone}
                onChange={(e) => setNewMilestone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newMilestone.trim()) {
                    actions.addMilestone({ name: newMilestone.trim(), goalId: draft.id });
                    setNewMilestone('');
                  }
                }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title="Delete this goal?"
        body="Tasks and projects under it are kept, but they lose their link to this goal — and with it, the goal pull in the priority engine."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteGoal(draft.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
