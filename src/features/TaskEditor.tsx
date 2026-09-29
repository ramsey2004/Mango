import { useEffect, useMemo, useState } from 'react';
import type { DB, Task, Recurrence } from '../lib/types';
import { actions } from '../store/store';
import { Modal, Field, Select, Stepper, Chip, ConfirmDialog, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { scoreTask } from '../engine/priority';
import { formatMins, todayISO } from '../lib/util';
import { Checkbox } from './TaskRow';

export function TaskEditor({
  task,
  db,
  open,
  onClose,
}: {
  task: Task | null;
  db: DB;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Task | null>(task);
  const [confirming, setConfirming] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [showEngine, setShowEngine] = useState(false);

  useEffect(() => setDraft(task), [task]);

  const subtasks = useMemo(
    () => (draft ? db.tasks.filter((t) => t.parentId === draft.id) : []),
    [db.tasks, draft],
  );
  const scored = useMemo(() => (draft ? scoreTask(db, draft) : null), [db, draft]);

  if (!draft) return null;
  const patch = (p: Partial<Task>) => setDraft({ ...draft, ...p });

  const save = () => {
    if (!draft.title.trim()) {
      toast({ text: 'Give the task a name before saving.', tone: 'warning' });
      return;
    }
    actions.updateTask(draft.id, draft);
    onClose();
  };

  const rec = draft.recurrence;
  const setRec = (r: Recurrence | undefined) => patch({ recurrence: r });

  const goalsForArea = db.goals.filter((g) => !g.archived && (!draft.areaId || !g.areaId || g.areaId === draft.areaId));
  const projectsForGoal = db.projects.filter((p) => !p.archived && (!draft.goalId || !p.goalId || p.goalId === draft.goalId));
  const milestones = db.milestones.filter((m) => m.projectId === draft.projectId || m.goalId === draft.goalId);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title={
          <span className="flex items-center gap-2">
            <Icon name="SquareCheck" size={15} />
            Edit task
          </span>
        }
        footer={
          <>
            <button className="btn btn-danger mr-auto" onClick={() => setConfirming(true)}>
              <Icon name="Trash2" size={14} />
              Delete
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save}>
              Save changes
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Task" className="sm:col-span-2">
            <input
              className="field"
              value={draft.title}
              autoFocus
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="What needs doing?"
            />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className="field min-h-[72px] resize-y"
              value={draft.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Anything you will want to remember when you pick this up."
            />
          </Field>

          <Field label="Priority">
            <Select
              value={draft.priorityId}
              onChange={(v) => patch({ priorityId: v })}
              options={[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ value: p.id, label: `${p.glyph}  ${p.name}` }))}
            />
          </Field>

          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(v) => patch({ status: v as Task['status'], kanban: v === 'done' ? 'done' : v === 'doing' ? 'inprogress' : v === 'blocked' ? 'blocked' : draft.kanban })}
              options={[
                { value: 'todo', label: 'To do' },
                { value: 'doing', label: 'In progress' },
                { value: 'blocked', label: 'Blocked' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </Field>

          <Field label="Area">
            <Select
              value={draft.areaId ?? ''}
              onChange={(v) => patch({ areaId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.areas.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }))]}
            />
          </Field>

          <Field label="Goal">
            <Select
              value={draft.goalId ?? ''}
              onChange={(v) => patch({ goalId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...goalsForArea.map((g) => ({ value: g.id, label: g.name }))]}
            />
          </Field>

          <Field label="Project">
            <Select
              value={draft.projectId ?? ''}
              onChange={(v) => patch({ projectId: v || undefined, milestoneId: undefined })}
              options={[{ value: '', label: 'None' }, ...projectsForGoal.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Field>

          <Field label="Milestone">
            <Select
              value={draft.milestoneId ?? ''}
              onChange={(v) => patch({ milestoneId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...milestones.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </Field>

          <Field label="Deadline">
            <input className="field" type="date" value={draft.due ?? ''} onChange={(e) => patch({ due: e.target.value || undefined })} />
          </Field>

          <Field label="Planned for" hint="The day you intend to work on it — often earlier than the deadline.">
            <input
              className="field"
              type="date"
              value={draft.scheduledFor ?? ''}
              onChange={(e) => patch({ scheduledFor: e.target.value || undefined })}
            />
          </Field>

          <Field label="Start date">
            <input className="field" type="date" value={draft.start ?? ''} onChange={(e) => patch({ start: e.target.value || undefined })} />
          </Field>

          <Field label={`Estimated effort — ${formatMins(draft.effortMins)}`}>
            <input
              className="field"
              type="number"
              min={0}
              step={5}
              value={draft.effortMins}
              onChange={(e) => patch({ effortMins: Math.max(0, Number(e.target.value)) })}
            />
          </Field>

          <Field label="Importance" hint="How much this matters to you." as="div">
            <Stepper value={draft.importance} onChange={(v) => patch({ importance: v })} />
          </Field>

          <Field label="Impact" hint="How much changes once it is done." as="div">
            <Stepper value={draft.impact} onChange={(v) => patch({ impact: v })} />
          </Field>

          <Field label="Strategic relevance" hint="How closely it serves a live goal." as="div">
            <Stepper value={draft.strategic} onChange={(v) => patch({ strategic: v })} />
          </Field>

          <Field label="Manual adjustment" hint="Your thumb on the scale. Positive lifts it above the engine's ranking.">
            <input
              className="field"
              type="number"
              step={5}
              value={draft.manualBoost}
              onChange={(e) => patch({ manualBoost: Number(e.target.value) || 0 })}
            />
          </Field>

          <Field label="Tags" className="sm:col-span-2" hint="Comma separated.">
            <input
              className="field"
              value={draft.tags.filter((t) => !t.startsWith('__')).join(', ')}
              onChange={(e) =>
                patch({
                  tags: [
                    ...draft.tags.filter((t) => t.startsWith('__')),
                    ...e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  ],
                })
              }
              placeholder="cases, urgent"
            />
          </Field>

          {/* ------------------------- recurrence ------------------------- */}
          <div className="sm:col-span-2 rounded-xl p-3" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center justify-between">
              <div className="label">Repeats</div>
              <button
                className="btn btn-ghost !py-1 !text-[12px]"
                onClick={() => setRec(rec ? undefined : { freq: 'weekly', interval: 1, weekdays: [new Date().getDay()] })}
              >
                {rec ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            {rec && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Frequency">
                  <Select
                    value={rec.freq}
                    onChange={(v) => setRec({ ...rec, freq: v as Recurrence['freq'] })}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'weekly', label: 'Weekly' },
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'yearly', label: 'Yearly' },
                    ]}
                  />
                </Field>
                <Field label="Every">
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={rec.interval}
                    onChange={(e) => setRec({ ...rec, interval: Math.max(1, Number(e.target.value)) })}
                  />
                </Field>
                <Field label="Ends on">
                  <input className="field" type="date" value={rec.endsOn ?? ''} onChange={(e) => setRec({ ...rec, endsOn: e.target.value || undefined })} />
                </Field>
                {rec.freq === 'weekly' && (
                  <div className="sm:col-span-3">
                    <div className="label mb-1.5">On these days</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                        const on = rec.weekdays?.includes(i);
                        return (
                          <button
                            key={d}
                            onClick={() =>
                              setRec({
                                ...rec,
                                weekdays: on ? (rec.weekdays ?? []).filter((x) => x !== i) : [...(rec.weekdays ?? []), i],
                              })
                            }
                            className="chip"
                            style={on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {rec.freq === 'monthly' && (
                  <Field label="Day of month">
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={31}
                      value={rec.monthDay ?? 1}
                      onChange={(e) => setRec({ ...rec, monthDay: Number(e.target.value) })}
                    />
                  </Field>
                )}
                <p className="sm:col-span-3 text-[11.5px] text-[var(--ink-3)]">
                  The next instance is created automatically the moment you complete this one.
                </p>
              </div>
            )}
          </div>

          {/* -------------------------- subtasks -------------------------- */}
          <div className="sm:col-span-2">
            <div className="label mb-2">Subtasks</div>
            <div className="flex flex-col gap-1">
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 row-hover">
                  <Checkbox done={s.status === 'done'} onToggle={() => actions.toggleTask(s.id)} />
                  <input
                    className="flex-1 bg-transparent border-none text-[13px] outline-none"
                    value={s.title}
                    onChange={(e) => actions.updateTask(s.id, { title: e.target.value })}
                    style={s.status === 'done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}
                  />
                  <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => actions.deleteTask(s.id)} aria-label="Delete subtask">
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1">
                <input
                  className="field"
                  placeholder="Add a subtask and press Enter"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSub.trim()) {
                      actions.addTask({
                        title: newSub.trim(),
                        parentId: draft.id,
                        areaId: draft.areaId,
                        goalId: draft.goalId,
                        projectId: draft.projectId,
                        priorityId: draft.priorityId,
                        effortMins: 15,
                      });
                      setNewSub('');
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* ------------------------ dependencies ------------------------ */}
          <div className="sm:col-span-2">
            <div className="label mb-2">Waiting on</div>
            <Select
              value=""
              ariaLabel="Add a dependency"
              onChange={(v) => v && patch({ dependsOn: [...new Set([...draft.dependsOn, v])] })}
              options={[
                { value: '', label: 'Add a task this one waits for…' },
                ...db.tasks
                  .filter((t) => t.id !== draft.id && t.status !== 'done' && !t.parentId)
                  .slice(0, 60)
                  .map((t) => ({ value: t.id, label: t.title })),
              ]}
            />
            {draft.dependsOn.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.dependsOn.map((id) => {
                  const dep = db.tasks.find((t) => t.id === id);
                  return (
                    <button
                      key={id}
                      className="chip"
                      onClick={() => patch({ dependsOn: draft.dependsOn.filter((x) => x !== id) })}
                      title="Remove dependency"
                    >
                      {dep?.title ?? 'Unknown task'}
                      <Icon name="X" size={11} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* -------------------------- the score -------------------------- */}
          {scored && (
            <div className="sm:col-span-2 rounded-xl p-3" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <button className="flex w-full items-center justify-between" onClick={() => setShowEngine((s) => !s)}>
                <span className="label">Priority score — {scored.score}</span>
                <Icon name={showEngine ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-[var(--ink-3)]" />
              </button>
              {showEngine && (
                <div className="mt-2.5 flex flex-col gap-1">
                  {scored.factors.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="text-[var(--ink-2)]">
                        {f.label}
                        {f.detail && <span className="text-[var(--ink-3)]"> — {f.detail}</span>}
                      </span>
                      <span className="num" style={{ color: f.value < 0 ? 'var(--critical)' : 'var(--ink)' }}>
                        {f.value > 0 ? '+' : ''}
                        {Math.round(f.value * 10) / 10}
                      </span>
                    </div>
                  ))}
                  <p className="mt-1.5 text-[11.5px] text-[var(--ink-3)]">
                    The engine ranks; you decide. Use the manual adjustment above to override it.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title="Delete this task?"
        body={`“${draft.title}” and its subtasks will be removed. This cannot be undone from here, though Cmd/Ctrl+Z still works this session.`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteTask(draft.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}

/* ------------------------- quick "new task" sheet ------------------------- */

export function QuickTaskModal({
  open,
  onClose,
  db,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  db: DB;
  defaults?: Partial<Task>;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priorityId, setPriorityId] = useState('p_medium');
  const [areaId, setAreaId] = useState(defaults?.areaId ?? '');
  const [effort, setEffort] = useState(30);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setTitle('');
      setDue('');
      setPriorityId(defaults?.priorityId ?? 'p_medium');
      setAreaId(defaults?.areaId ?? '');
      setEffort(defaults?.effortMins ?? 30);
    }
  }, [open, defaults]);

  const create = () => {
    if (!title.trim()) return;
    actions.addTask({
      ...defaults,
      title: title.trim(),
      due: due || undefined,
      scheduledFor: due === todayISO() ? due : defaults?.scheduledFor,
      priorityId,
      areaId: areaId || undefined,
      effortMins: effort,
    });
    toast({ text: 'Task added', tone: 'good' });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create} disabled={!title.trim()}>
            Add task
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Task" className="sm:col-span-2">
          <input
            className="field"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="What needs doing?"
          />
        </Field>
        <Field label="Deadline">
          <input className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Priority">
          <Select
            value={priorityId}
            onChange={setPriorityId}
            options={[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Area">
          <Select
            value={areaId}
            onChange={setAreaId}
            options={[{ value: '', label: 'None' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
          />
        </Field>
        <Field label="Estimate (minutes)">
          <input className="field" type="number" min={0} step={5} value={effort} onChange={(e) => setEffort(Number(e.target.value))} />
        </Field>
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--ink-3)]">
        Tip: press <Chip className="!px-1.5 !py-0">⌘K</Chip> anywhere to type a task in plain English instead.
      </p>
    </Modal>
  );
}
