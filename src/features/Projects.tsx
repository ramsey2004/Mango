import { useEffect, useMemo, useState } from 'react';
import type { DB, Project, ProjectStatus, KanbanColumn, Task } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { projectProgress } from '../engine/priority';
import { Panel, SectionHeader, Bar, Chip, Empty, Field, Select, Modal, ConfirmDialog, Menu, Segmented, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import { cn, relativeDay, pluralise, formatMins, daysUntil, fromISODate, toISODate, addDays } from '../lib/util';

const COLUMNS: Array<{ id: KanbanColumn; label: string; color: string }> = [
  { id: 'backlog', label: 'Backlog', color: '#616a78' },
  { id: 'planned', label: 'Planned', color: '#5784d7' },
  { id: 'inprogress', label: 'In progress', color: '#d06200' },
  { id: 'blocked', label: 'Blocked', color: '#f2555a' },
  { id: 'done', label: 'Done', color: '#029f6d' },
];

const P_STATUS: Array<{ value: ProjectStatus; label: string; color: string }> = [
  { value: 'planning', label: 'Planning', color: '#6c9bf0' },
  { value: 'active', label: 'Active', color: '#3ec08c' },
  { value: 'blocked', label: 'Blocked', color: '#f2555a' },
  { value: 'completed', label: 'Completed', color: '#029f6d' },
  { value: 'archived', label: 'Archived', color: '#616a78' },
];

export function Projects({ db, focusId }: { db: DB; focusId?: string }) {
  const nav = useNav();
  const [editing, setEditing] = useState<Project | null>(null);
  const focused = focusId ? db.projects.find((p) => p.id === focusId) : undefined;
  const projects = db.projects.filter((p) => !p.archived);

  if (focused) return <ProjectDetail db={db} project={focused} editing={editing} setEditing={setEditing} />;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">{pluralise(projects.length, 'project')}</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Projects</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(actions.addProject({ name: 'New project' }))}>
          <Icon name="Plus" size={14} />
          Project
        </button>
      </header>

      {projects.length === 0 ? (
        <Panel className="p-2">
          <Empty
            icon="Layers"
            title="No projects yet"
            body="A project is a bundle of tasks with its own board and deadline. Goals say why; projects say how."
            action={
              <button className="btn btn-primary" onClick={() => setEditing(actions.addProject({ name: 'New project' }))}>
                Create a project
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pr = projectProgress(db, p.id);
            const area = db.areas.find((a) => a.id === p.areaId);
            const goal = db.goals.find((g) => g.id === p.goalId);
            const meta = P_STATUS.find((s) => s.value === p.status) ?? P_STATUS[1];
            return (
              <Panel key={p.id} className="p-4 sm:p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => nav.go('projects', p.id)}>
                    {area && (
                      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                        {area.name}
                      </div>
                    )}
                    <h3 className="text-[15px] font-bold leading-snug hover:text-[var(--accent)] transition-colors">{p.name}</h3>
                    {goal && <div className="mt-1 text-[11.5px] text-[var(--ink-3)] truncate">↳ {goal.name}</div>}
                  </button>
                  <Menu
                    trigger={<Icon name="MoreHorizontal" size={15} />}
                    items={[
                      { label: 'Edit', icon: 'Pencil', run: () => setEditing(p) },
                      { label: 'Open board', icon: 'Kanban', run: () => nav.go('projects', p.id) },
                      'separator',
                      { label: 'Mark complete', icon: 'Check', run: () => actions.updateProject(p.id, { status: 'completed' }) },
                      { label: 'Archive', icon: 'Archive', run: () => actions.updateProject(p.id, { archived: true, status: 'archived' }) },
                      { label: 'Delete', icon: 'Trash2', danger: true, run: () => actions.deleteProject(p.id) },
                    ]}
                  />
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="num text-[12.5px] font-semibold">{pr.progress}%</span>
                    <span className="num text-[11.5px] text-[var(--ink-3)]">
                      {pr.done}/{pr.total}
                    </span>
                  </div>
                  <Bar value={pr.progress} color={area?.color ?? 'var(--cat-4)'} height={7} label={p.name} />
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <Chip color={meta.color}>{meta.label}</Chip>
                  {p.deadline && <span className="text-[11.5px] text-[var(--ink-3)]">{relativeDay(p.deadline)}</span>}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <ProjectEditor db={db} project={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProjectDetail({
  db,
  project,
  editing,
  setEditing,
}: {
  db: DB;
  project: Project;
  editing: Project | null;
  setEditing: (p: Project | null) => void;
}) {
  const nav = useNav();
  const toast = useToast();
  const [view, setView] = useState<'board' | 'list' | 'timeline'>('board');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<KanbanColumn | null>(null);

  const tasks = db.tasks.filter((t) => t.projectId === project.id && !t.parentId && !t.archived);
  const milestones = db.milestones.filter((m) => m.projectId === project.id).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  const pr = projectProgress(db, project.id);
  const area = db.areas.find((a) => a.id === project.areaId);
  const goal = db.goals.find((g) => g.id === project.goalId);

  const move = (col: KanbanColumn) => {
    if (!dragId) return;
    actions.updateTask(dragId, {
      kanban: col,
      status: col === 'done' ? 'done' : col === 'blocked' ? 'blocked' : col === 'inprogress' ? 'doing' : 'todo',
      completedAt: col === 'done' ? new Date().toISOString() : undefined,
    });
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <button className="btn btn-ghost self-start !pl-1.5" onClick={() => nav.go('projects')}>
        <Icon name="ChevronLeft" size={15} />
        All projects
      </button>

      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {area && (
                <span className="inline-flex items-center gap-1.5 label" style={{ color: area.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                  {area.name}
                </span>
              )}
              {goal && (
                <button className="text-[11.5px] text-[var(--ink-3)] hover:text-[var(--accent)]" onClick={() => nav.go('goals', goal.id)}>
                  ↳ {goal.name}
                </button>
              )}
            </div>
            <h1 className="display text-[clamp(24px,3.6vw,34px)] leading-tight">{project.name}</h1>
            {project.description && <p className="mt-2 max-w-[62ch] text-[13.5px] text-[var(--ink-2)]">{project.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board', icon: 'Kanban' },
                { value: 'list', label: 'List', icon: 'List' },
                { value: 'timeline', label: 'Timeline', icon: 'GanttChart' },
              ]}
            />
            <button className="btn" onClick={() => setEditing(project)}>
              <Icon name="Pencil" size={14} />
              Edit
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const t = actions.addTask({ title: 'New task', projectId: project.id, goalId: project.goalId, areaId: project.areaId });
                nav.openTask(t);
              }}
            >
              <Icon name="Plus" size={14} />
              Task
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between mb-2">
              <span className="label">Progress</span>
              <span className="num text-[14px] font-semibold">
                {pr.done}/{pr.total}
              </span>
            </div>
            <Bar value={pr.progress} color={area?.color ?? 'var(--cat-4)'} height={9} label="Project progress" />
          </div>
          <div>
            <div className="label mb-1.5">Deadline</div>
            <div className="text-[13.5px]">{project.deadline ? relativeDay(project.deadline) : 'None'}</div>
          </div>
          <div>
            <div className="label mb-1.5">Remaining effort</div>
            <div className="num text-[13.5px]">
              {formatMins(tasks.filter((t) => t.status !== 'done').reduce((s, t) => s + (t.effortMins || 0), 0))}
            </div>
          </div>
        </div>
      </Panel>

      {view === 'board' && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.kanban === col.id);
            return (
              <Panel
                key={col.id}
                className="flex flex-col p-3 min-h-[13rem]"
                style={{ borderColor: overCol === col.id ? 'var(--accent)' : 'var(--hairline)' }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(col.id);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                onDrop={() => move(col.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="label" style={{ color: col.color }}>
                    {col.label}
                  </span>
                  <span className="num text-[11px] text-[var(--ink-3)]">{items.length}</span>
                </div>
                <div className="mt-2.5 flex flex-col gap-1.5 flex-1">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => nav.openTask(t)}
                      className="rounded-lg p-2.5 text-left cursor-grab active:cursor-grabbing"
                      style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
                    >
                      <div className={cn('text-[12.5px] leading-snug', t.status === 'done' && 'line-through text-[var(--ink-3)]')}>
                        {t.title}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ink-3)]">
                        {t.due && <span>{relativeDay(t.due)}</span>}
                        {t.effortMins > 0 && <span className="num">{formatMins(t.effortMins)}</span>}
                      </div>
                    </button>
                  ))}
                  {items.length === 0 && (
                    <div className="grid flex-1 place-items-center text-[11px] text-[var(--ink-3)]">
                      {overCol === col.id ? 'Drop here' : '—'}
                    </div>
                  )}
                </div>
                <button
                  className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] text-[var(--ink-3)] row-hover"
                  onClick={() => {
                    const t = actions.addTask({
                      title: 'New task',
                      projectId: project.id,
                      goalId: project.goalId,
                      areaId: project.areaId,
                      kanban: col.id,
                      status: col.id === 'done' ? 'done' : col.id === 'inprogress' ? 'doing' : 'todo',
                    });
                    nav.openTask(t);
                  }}
                >
                  <Icon name="Plus" size={12} />
                  Add
                </button>
              </Panel>
            );
          })}
        </div>
      )}

      {view === 'list' && (
        <Panel className="p-4 sm:p-5">
          <div className="-mx-2.5">
            {tasks.length ? tasks.map((t) => <TaskRow key={t.id} task={t} db={db} onOpen={nav.openTask} />) : <Empty icon="ListChecks" title="No tasks in this project" />}
          </div>
        </Panel>
      )}

      {view === 'timeline' && <Timeline db={db} tasks={tasks} project={project} />}

      <Panel className="p-4 sm:p-5">
        <SectionHeader
          title="Milestones"
          right={
            <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => actions.addMilestone({ name: 'New milestone', projectId: project.id })}>
              <Icon name="Plus" size={13} />
              Add
            </button>
          }
        />
        <ul className="mt-3 flex flex-col gap-1">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover">
              <button
                onClick={() => actions.updateMilestone(m.id, { done: !m.done })}
                className="grid h-[18px] w-[18px] place-items-center rounded-[6px] shrink-0"
                style={{ border: `1.5px solid ${m.done ? 'var(--good)' : 'var(--hairline-strong)'}`, background: m.done ? 'var(--good)' : 'transparent' }}
                aria-label="Toggle milestone"
              >
                {m.done && <Icon name="Check" size={12} strokeWidth={3} style={{ color: 'var(--ground)' }} />}
              </button>
              <input
                className={cn('flex-1 bg-transparent border-none text-[13px] outline-none', m.done && 'line-through text-[var(--ink-3)]')}
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
            </li>
          ))}
          {milestones.length === 0 && <Empty icon="Flag" title="No milestones" body="Milestones mark the points where the project visibly changes state." />}
        </ul>
      </Panel>

      <ProjectEditor db={db} project={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function Timeline({ db, tasks, project }: { db: DB; tasks: Task[]; project: Project }) {
  const dated = tasks.filter((t) => t.due).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  if (!dated.length) {
    return (
      <Panel className="p-2">
        <Empty icon="GanttChart" title="Nothing to plot" body="Tasks need deadlines before they can appear on a timeline." />
      </Panel>
    );
  }
  const first = fromISODate(dated[0].due as string).getTime();
  const last = fromISODate(dated[dated.length - 1].due as string).getTime();
  const span = Math.max(1, last - first);

  return (
    <Panel className="p-4 sm:p-5 overflow-x-auto">
      <div style={{ minWidth: '36rem' }}>
        <div className="label mb-3">
          {dated[0].due} → {dated[dated.length - 1].due}
        </div>
        <div className="flex flex-col gap-2">
          {dated.map((t) => {
            const at = ((fromISODate(t.due as string).getTime() - first) / span) * 100;
            const area = db.areas.find((a) => a.id === t.areaId);
            const overdue = (daysUntil(t.due) ?? 0) < 0 && t.status !== 'done';
            return (
              <div key={t.id} className="grid items-center gap-3" style={{ gridTemplateColumns: '13rem 1fr' }}>
                <span className={cn('truncate text-[12.5px]', t.status === 'done' && 'line-through text-[var(--ink-3)]')}>{t.title}</span>
                <div className="relative h-6 rounded-md" style={{ background: 'var(--sunken)' }}>
                  <span
                    className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full"
                    style={{
                      left: `calc(${at}% - 6px)`,
                      width: 12,
                      background: t.status === 'done' ? 'var(--ink-3)' : overdue ? 'var(--critical)' : area?.color ?? 'var(--accent)',
                    }}
                    title={t.due}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function ProjectEditor({ db, project, open, onClose }: { db: DB; project: Project | null; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Project | null>(project);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft(project), [project]);
  if (!draft) return null;
  const patch = (p: Partial<Project>) => setDraft({ ...draft, ...p });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Edit project"
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
                actions.updateProject(draft.id, draft);
                onClose();
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" className="sm:col-span-2">
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
          <Field label="Goal">
            <Select
              value={draft.goalId ?? ''}
              onChange={(v) => patch({ goalId: v || undefined })}
              options={[{ value: '', label: 'None' }, ...db.goals.filter((g) => !g.archived).map((g) => ({ value: g.id, label: g.name }))]}
            />
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={(v) => patch({ status: v as ProjectStatus })} options={P_STATUS.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
          <Field label="Priority">
            <Select
              value={draft.priorityId}
              onChange={(v) => patch({ priorityId: v })}
              options={[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Deadline" className="sm:col-span-2">
            <input className="field" type="date" value={draft.deadline ?? ''} onChange={(e) => patch({ deadline: e.target.value || undefined })} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Delete this project?"
        body="Its tasks are kept but lose their project link. Milestones belonging to it are removed."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteProject(draft.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
