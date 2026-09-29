import { useEffect, useMemo, useState } from 'react';
import type { DB, Application } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { Panel, SectionHeader, Empty, Field, Select, Modal, ConfirmDialog, Menu, Segmented, Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { relativeDay, daysUntil, pluralise, cn, formatDate } from '../lib/util';

export function Applications({ db, focusId }: { db: DB; focusId?: string }) {
  const nav = useNav();
  const [editing, setEditing] = useState<Application | null>(null);
  const [view, setView] = useState<'board' | 'table'>('board');
  const [kind, setKind] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  useEffect(() => {
    if (focusId) {
      const a = db.applications.find((x) => x.id === focusId);
      if (a) setEditing(a);
    }
  }, [focusId, db.applications]);

  const stages = [...db.stages].sort((a, b) => a.order - b.order);
  const kinds = [...new Set(db.applications.map((a) => a.kind))].filter(Boolean);
  const items = db.applications.filter((a) => !a.archived).filter((a) => (kind ? a.kind === kind : true));
  const live = items.filter((a) => !stages.find((s) => s.id === a.stageId)?.terminal);

  const drop = (stageId: string) => {
    if (!dragId) return;
    const patch: Partial<Application> = { stageId };
    if (db.stages.find((s) => s.id === stageId)?.name.toLowerCase() === 'applied') {
      patch.appliedOn = new Date().toISOString().slice(0, 10);
    }
    actions.updateApplication(dragId, patch);
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {pluralise(live.length, 'opportunity', 'opportunities')} in play · {items.length} tracked
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Applications</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} size="sm" options={[{ value: 'board', label: 'Board', icon: 'Kanban' }, { value: 'table', label: 'Table', icon: 'List' }]} />
          {kinds.length > 1 && (
            <Select
              value={kind}
              onChange={setKind}
              ariaLabel="Type"
              className="w-[10rem]"
              options={[{ value: '', label: 'All types' }, ...kinds.map((k) => ({ value: k, label: k }))]}
            />
          )}
          <button className="btn btn-primary" onClick={() => setEditing(actions.addApplication({ org: 'New organisation', role: 'Role' }))}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <Panel className="p-2">
          <Empty
            icon="Building2"
            title="Nothing tracked yet"
            body="This pipeline is generic — internships, jobs, scholarships, competitions, freelance briefs. Rename the stages in Settings to match how you actually work."
            action={
              <button className="btn btn-primary" onClick={() => setEditing(actions.addApplication({ org: 'New organisation', role: 'Role' }))}>
                Track the first one
              </button>
            }
          />
        </Panel>
      ) : view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => {
            const list = items.filter((a) => a.stageId === s.id);
            return (
              <Panel
                key={s.id}
                className="flex w-[15rem] shrink-0 flex-col p-3"
                style={{ borderColor: overStage === s.id ? 'var(--accent)' : 'var(--hairline)' }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(s.id);
                }}
                onDragLeave={() => setOverStage((x) => (x === s.id ? null : x))}
                onDrop={() => drop(s.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="label" style={{ color: s.color }}>
                    {s.name}
                  </span>
                  <span className="num text-[11px] text-[var(--ink-3)]">{list.length}</span>
                </div>
                <div className="mt-2.5 flex flex-col gap-1.5 min-h-[6rem]">
                  {list.map((a) => {
                    const n = daysUntil(a.deadline);
                    return (
                      <button
                        key={a.id}
                        draggable
                        onDragStart={() => setDragId(a.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setEditing(a)}
                        className="rounded-lg p-2.5 text-left cursor-grab active:cursor-grabbing"
                        style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
                      >
                        <div className="text-[12.5px] font-semibold truncate">{a.org}</div>
                        <div className="text-[11px] text-[var(--ink-3)] truncate">{a.role}</div>
                        {a.deadline && (
                          <div className="mt-1.5 num text-[10.5px]" style={{ color: n !== null && n < 0 ? 'var(--critical)' : n !== null && n <= 3 ? 'var(--warning)' : 'var(--ink-3)' }}>
                            {relativeDay(a.deadline)}
                          </div>
                        )}
                        {a.nextAction && <div className="mt-1 text-[10.5px] text-[var(--ink-3)] truncate">→ {a.nextAction}</div>}
                      </button>
                    );
                  })}
                  {list.length === 0 && (
                    <div className="grid flex-1 place-items-center py-4 text-[11px] text-[var(--ink-3)]">{overStage === s.id ? 'Drop here' : '—'}</div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel className="p-0 overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ minWidth: '52rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {['Organisation', 'Role', 'Type', 'Stage', 'Deadline', 'Next action', ''].map((h) => (
                  <th key={h} className="label px-4 py-3 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const s = stages.find((x) => x.id === a.stageId);
                const n = daysUntil(a.deadline);
                return (
                  <tr key={a.id} className="row-hover cursor-pointer" style={{ borderBottom: '1px solid var(--hairline)' }} onClick={() => setEditing(a)}>
                    <td className="px-4 py-2.5 font-semibold">{a.org}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{a.role}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-3)]">{a.kind}</td>
                    <td className="px-4 py-2.5">{s && <Chip color={s.color}>{s.name}</Chip>}</td>
                    <td className="px-4 py-2.5 num" style={{ color: n !== null && n < 0 ? 'var(--critical)' : 'var(--ink-2)' }}>
                      {a.deadline ? formatDate(a.deadline, db.settings.dateFormat) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)] truncate max-w-[14rem]">{a.nextAction ?? '—'}</td>
                    <td className="px-2 py-2.5">
                      <Icon name="ChevronRight" size={14} className="text-[var(--ink-3)]" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <ApplicationEditor db={db} application={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ApplicationEditor({ db, application, open, onClose }: { db: DB; application: Application | null; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Application | null>(application);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft(application), [application]);
  if (!draft) return null;
  const patch = (p: Partial<Application>) => setDraft({ ...draft, ...p });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title={`${draft.org || 'Application'} — ${draft.role || ''}`}
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
                actions.updateApplication(draft.id, draft);
                onClose();
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation">
            <input className="field" autoFocus value={draft.org} onChange={(e) => patch({ org: e.target.value })} />
          </Field>
          <Field label="Role">
            <input className="field" value={draft.role} onChange={(e) => patch({ role: e.target.value })} />
          </Field>
          <Field label="Type" hint="Internship, job, scholarship, competition — anything.">
            <input className="field" value={draft.kind} onChange={(e) => patch({ kind: e.target.value })} list="app-kinds" />
          </Field>
          <datalist id="app-kinds">
            {['Internship', 'Job', 'Scholarship', 'Competition', 'Programme', 'Freelance'].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <Field label="Location">
            <input className="field" value={draft.location ?? ''} onChange={(e) => patch({ location: e.target.value })} />
          </Field>
          <Field label="Stage">
            <Select
              value={draft.stageId}
              onChange={(v) => patch({ stageId: v })}
              options={[...db.stages].sort((a, b) => a.order - b.order).map((s) => ({ value: s.id, label: s.name }))}
            />
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
          <Field label="Date applied">
            <input className="field" type="date" value={draft.appliedOn ?? ''} onChange={(e) => patch({ appliedOn: e.target.value || undefined })} />
          </Field>
          <Field label="Source">
            <input className="field" value={draft.source ?? ''} onChange={(e) => patch({ source: e.target.value })} placeholder="Campus process, referral, LinkedIn…" />
          </Field>
          <Field label="Contact">
            <input className="field" value={draft.contact ?? ''} onChange={(e) => patch({ contact: e.target.value })} />
          </Field>
          <Field label="Next action">
            <input className="field" value={draft.nextAction ?? ''} onChange={(e) => patch({ nextAction: e.target.value })} />
          </Field>
          <Field label="Next action date">
            <input className="field" type="date" value={draft.nextActionDate ?? ''} onChange={(e) => patch({ nextActionDate: e.target.value || undefined })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className="field min-h-[80px] resize-y" value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => {
              actions.addTask({
                title: draft.nextAction || `Follow up: ${draft.org}`,
                due: draft.nextActionDate ?? draft.deadline,
                priorityId: draft.priorityId,
                effortMins: 30,
                tags: ['application'],
              });
              onClose();
            }}
          >
            <Icon name="Plus" size={13} />
            Turn next action into a task
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title="Delete this application?"
        body="The record and its notes are removed. Any task you created from it stays."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteApplication(draft.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}
