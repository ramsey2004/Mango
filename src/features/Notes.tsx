import { useMemo, useState } from 'react';
import type { DB, Note } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { Panel, Empty, Menu, Select, Segmented, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { cn, pluralise } from '../lib/util';

export function Notes({ db, focusId }: { db: DB; focusId?: string }) {
  const nav = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [selected, setSelected] = useState<string | null>(focusId ?? null);
  const [scope, setScope] = useState<'live' | 'archived'>('live');

  const notes = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.notes
      .filter((n) => (scope === 'live' ? !n.archived : n.archived))
      .filter((n) => (folder ? n.folderId === folder : true))
      .filter((n) => (needle ? n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle) || n.tags.some((t) => t.toLowerCase().includes(needle)) : true))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [db.notes, q, folder, scope]);

  const active = db.notes.find((n) => n.id === selected) ?? notes[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">{pluralise(notes.length, 'note')}</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Notes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={scope} onChange={setScope} size="sm" options={[{ value: 'live', label: 'Notes' }, { value: 'archived', label: 'Archived' }]} />
          <button
            className="btn btn-primary"
            onClick={() => {
              const n = actions.addNote({ folderId: folder || undefined });
              setSelected(n.id);
            }}
          >
            <Icon name="Plus" size={14} />
            Note
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-3">
          <Panel className="p-3">
            <div className="relative">
              <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
              <input className="field !pl-8" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Select
                value={folder}
                onChange={setFolder}
                ariaLabel="Folder"
                className="flex-1"
                options={[{ value: '', label: 'All folders' }, ...db.noteFolders.map((f) => ({ value: f.id, label: f.name }))]}
              />
              <button
                className="btn btn-ghost !px-2"
                aria-label="New folder"
                onClick={() => {
                  const name = prompt('Folder name');
                  if (name?.trim()) actions.addNoteFolder(name.trim());
                }}
              >
                <Icon name="Plus" size={14} />
              </button>
            </div>
          </Panel>

          <Panel className="p-2 max-h-[60vh] overflow-y-auto">
            {notes.length ? (
              notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                  className={cn('flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left row-hover')}
                  style={active?.id === n.id ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {n.pinned && <Icon name="Pin" size={11} style={{ color: 'var(--accent)' }} />}
                    <span className="text-[13px] font-semibold truncate">{n.title || 'Untitled'}</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--ink-3)] line-clamp-2">{n.body.slice(0, 120) || 'Empty note'}</span>
                </button>
              ))
            ) : (
              <Empty icon="StickyNote" title="No notes here" />
            )}
          </Panel>
        </div>

        {active ? (
          <Panel className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-start gap-3">
              <input
                className="flex-1 bg-transparent border-none text-[20px] font-bold outline-none display"
                value={active.title}
                onChange={(e) => actions.updateNote(active.id, { title: e.target.value })}
                placeholder="Untitled"
              />
              <Menu
                trigger={<Icon name="MoreHorizontal" size={16} />}
                items={[
                  { label: active.pinned ? 'Unpin' : 'Pin', icon: 'Pin', run: () => actions.updateNote(active.id, { pinned: !active.pinned }) },
                  { label: active.archived ? 'Unarchive' : 'Archive', icon: 'Archive', run: () => actions.updateNote(active.id, { archived: !active.archived }) },
                  'separator',
                  {
                    label: 'Delete',
                    icon: 'Trash2',
                    danger: true,
                    run: () => {
                      const snap = active;
                      actions.deleteNote(active.id);
                      setSelected(null);
                      toast({ text: 'Note deleted', tone: 'warning', action: { label: 'Undo', run: () => actions.addNote(snap) } });
                    },
                  },
                ]}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                value={active.folderId ?? ''}
                onChange={(v) => actions.updateNote(active.id, { folderId: v || undefined })}
                ariaLabel="Folder"
                className="w-[10rem]"
                options={[{ value: '', label: 'No folder' }, ...db.noteFolders.map((f) => ({ value: f.id, label: f.name }))]}
              />
              <input
                className="field flex-1 min-w-[10rem]"
                placeholder="Tags, comma separated"
                value={active.tags.filter((t) => !t.startsWith('__')).join(', ')}
                onChange={(e) =>
                  actions.updateNote(active.id, {
                    tags: [...active.tags.filter((t) => t.startsWith('__')), ...e.target.value.split(',').map((s) => s.trim()).filter(Boolean)],
                  })
                }
              />
            </div>

            <textarea
              className="field mt-3 flex-1 min-h-[46vh] resize-y leading-relaxed"
              value={active.body}
              onChange={(e) => actions.updateNote(active.id, { body: e.target.value })}
              placeholder="Write anything. This note can be linked to a goal, project or application below."
            />

            <div className="mt-4">
              <div className="label mb-2">Linked to</div>
              <div className="flex flex-wrap gap-1.5">
                {active.links.map((l, i) => {
                  const name =
                    l.kind === 'goal'
                      ? db.goals.find((g) => g.id === l.id)?.name
                      : l.kind === 'project'
                        ? db.projects.find((p) => p.id === l.id)?.name
                        : l.kind === 'area'
                          ? db.areas.find((a) => a.id === l.id)?.name
                          : l.kind === 'application'
                            ? db.applications.find((a) => a.id === l.id)?.org
                            : db.tasks.find((t) => t.id === l.id)?.title;
                  return (
                    <button
                      key={`${l.kind}-${l.id}-${i}`}
                      className="chip"
                      onClick={() => actions.updateNote(active.id, { links: active.links.filter((_, j) => j !== i) })}
                      title="Remove link"
                    >
                      <Icon name={l.kind === 'goal' ? 'Target' : l.kind === 'project' ? 'Layers' : l.kind === 'application' ? 'Building2' : 'SquareCheck'} size={11} />
                      {name ?? 'Missing'}
                      <Icon name="X" size={10} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Select
                  value=""
                  ariaLabel="Link a goal"
                  className="w-[13rem]"
                  onChange={(v) => v && actions.updateNote(active.id, { links: [...active.links, { kind: 'goal', id: v }] })}
                  options={[{ value: '', label: 'Link a goal…' }, ...db.goals.filter((g) => !g.archived).map((g) => ({ value: g.id, label: g.name }))]}
                />
                <Select
                  value=""
                  ariaLabel="Link a project"
                  className="w-[13rem]"
                  onChange={(v) => v && actions.updateNote(active.id, { links: [...active.links, { kind: 'project', id: v }] })}
                  options={[{ value: '', label: 'Link a project…' }, ...db.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name }))]}
                />
                <Select
                  value=""
                  ariaLabel="Link an application"
                  className="w-[13rem]"
                  onChange={(v) => v && actions.updateNote(active.id, { links: [...active.links, { kind: 'application', id: v }] })}
                  options={[{ value: '', label: 'Link an application…' }, ...db.applications.filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.org} — ${a.role}` }))]}
                />
              </div>
            </div>
          </Panel>
        ) : (
          <Panel className="p-2 grid place-items-center">
            <Empty icon="StickyNote" title="No note selected" body="Pick one on the left, or create a new note." />
          </Panel>
        )}
      </div>
    </div>
  );
}
