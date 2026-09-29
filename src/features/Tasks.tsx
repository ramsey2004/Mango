import { useMemo, useState } from 'react';
import type { DB } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { rankTasks } from '../engine/priority';
import { Panel, SectionHeader, Empty, Select, Segmented, Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskRow } from './TaskRow';
import { pluralise, formatMins, todayISO } from '../lib/util';

type Sort = 'engine' | 'due' | 'created' | 'alpha' | 'effort';

export function Tasks({ db }: { db: DB }) {
  const nav = useNav();
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open');
  const [sort, setSort] = useState<Sort>('engine');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = db.tasks.filter((t) => !t.archived && !t.parentId);
    if (status === 'open') list = list.filter((t) => t.status !== 'done');
    if (status === 'done') list = list.filter((t) => t.status === 'done');
    if (area) list = list.filter((t) => t.areaId === area);
    if (priority) list = list.filter((t) => t.priorityId === priority);
    if (needle)
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.notes?.toLowerCase().includes(needle) ||
          t.tags.some((x) => x.toLowerCase().includes(needle)),
      );

    switch (sort) {
      case 'due':
        return [...list].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
      case 'created':
        return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'alpha':
        return [...list].sort((a, b) => a.title.localeCompare(b.title));
      case 'effort':
        return [...list].sort((a, b) => a.effortMins - b.effortMins);
      default:
        return rankTasks(db, list).map((s) => s.task);
    }
  }, [db, q, area, priority, status, sort]);

  const mins = filtered.filter((t) => t.status !== 'done').reduce((s, t) => s + (t.effortMins || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {pluralise(filtered.length, 'task')} · {formatMins(mins)} of estimated work
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">All tasks</h1>
        </div>
        <button className="btn btn-primary" onClick={nav.openQuickAdd}>
          <Icon name="Plus" size={14} />
          Task
        </button>
      </header>

      <Panel className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
            <input
              className="field !pl-8"
              placeholder="Filter by name, note or tag"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Segmented
            value={status}
            onChange={setStatus}
            size="sm"
            options={[
              { value: 'open', label: 'Open' },
              { value: 'done', label: 'Done' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Select
            value={area}
            onChange={setArea}
            ariaLabel="Area"
            className="w-[9rem]"
            options={[{ value: '', label: 'All areas' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <Select
            value={priority}
            onChange={setPriority}
            ariaLabel="Priority"
            className="w-[9rem]"
            options={[
              { value: '', label: 'All priorities' },
              ...[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Select
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            ariaLabel="Sort"
            className="w-[10rem]"
            options={[
              { value: 'engine', label: 'Sort: priority engine' },
              { value: 'due', label: 'Sort: deadline' },
              { value: 'created', label: 'Sort: newest' },
              { value: 'effort', label: 'Sort: quickest' },
              { value: 'alpha', label: 'Sort: A–Z' },
            ]}
          />
          {(q || area || priority || status !== 'open' || sort !== 'engine') && (
            <button
              className="btn btn-ghost !text-[12px]"
              onClick={() => {
                setQ('');
                setArea('');
                setPriority('');
                setStatus('open');
                setSort('engine');
              }}
            >
              Reset
            </button>
          )}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <div className="-mx-2.5">
          {filtered.length ? (
            filtered.map((t) => <TaskRow key={t.id} task={t} db={db} onOpen={nav.openTask} />)
          ) : (
            <Empty
              icon="Search"
              title="Nothing matches"
              body={q || area || priority ? 'Try loosening the filters.' : 'Add your first task to get started.'}
              action={
                <button className="btn btn-primary" onClick={nav.openQuickAdd}>
                  Add a task
                </button>
              }
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
