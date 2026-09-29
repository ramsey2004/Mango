import { useEffect, useMemo, useState } from 'react';
import type { DB, CustomModule, ModuleField, ModuleRecord, FieldType } from '../lib/types';
import { actions } from '../store/store';
import { useNav } from '../store/nav';
import { Panel, SectionHeader, Empty, Field, Select, Modal, ConfirmDialog, Menu, useToast } from '../components/ui';
import { Icon, ICON_NAMES } from '../components/Icon';
import { uid, pluralise } from '../lib/util';

/* ============================================================
   Custom modules: a small user-defined database. This is what
   keeps the app from being limited to the objects I chose —
   a reading list, an expense log, a networking CRM, whatever.
   ============================================================ */

const TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'Link' },
];

export function ModuleView({ db, moduleId }: { db: DB; moduleId: string }) {
  const nav = useNav();
  const toast = useToast();
  const mod = db.modules.find((m) => m.id === moduleId);
  const [editingSchema, setEditingSchema] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ModuleRecord | null>(null);
  const [q, setQ] = useState('');

  const records = useMemo(() => {
    if (!mod) return [];
    const needle = q.trim().toLowerCase();
    return db.moduleRecords
      .filter((r) => r.moduleId === moduleId && !r.archived)
      .filter((r) => (needle ? Object.values(r.values).some((v) => String(v).toLowerCase().includes(needle)) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [db.moduleRecords, moduleId, q, mod]);

  if (!mod) {
    return (
      <Panel className="p-2">
        <Empty icon="Box" title="Module not found" body="It may have been deleted." action={<button className="btn" onClick={() => nav.go('dashboard')}>Back to the command centre</button>} />
      </Panel>
    );
  }

  const primary = mod.fields.filter((f) => f.primary).slice(0, 4);
  const cols = primary.length ? primary : mod.fields.slice(0, 4);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${mod.color}1f`, border: `1px solid ${mod.color}44` }}>
            <Icon name={mod.icon} size={20} style={{ color: mod.color }} />
          </span>
          <div>
            <div className="label mb-1">{pluralise(records.length, 'record')} · your own module</div>
            <h1 className="display text-[clamp(24px,3.6vw,34px)] leading-none">{mod.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setEditingSchema(true)}>
            <Icon name="Settings" size={14} />
            Fields
          </button>
          <button className="btn btn-primary" onClick={() => setEditingRecord(actions.addModuleRecord(mod.id, {}))}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        </div>
      </header>

      <Panel className="p-3">
        <div className="relative">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
          <input className="field !pl-8" placeholder={`Search ${mod.name.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Panel>

      {records.length === 0 ? (
        <Panel className="p-2">
          <Empty icon={mod.icon} title="Nothing here yet" body="Add a record, or edit the fields to shape this module around what you actually track." />
        </Panel>
      ) : (
        <Panel className="p-0 overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ minWidth: `${Math.max(30, cols.length * 12)}rem` }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {cols.map((f) => (
                  <th key={f.id} className="label px-4 py-3 text-left">
                    {f.name}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="row-hover cursor-pointer" style={{ borderBottom: '1px solid var(--hairline)' }} onClick={() => setEditingRecord(r)}>
                  {cols.map((f) => (
                    <td key={f.id} className="px-4 py-2.5">
                      {f.type === 'checkbox' ? (
                        r.values[f.id] ? <Icon name="Check" size={14} style={{ color: 'var(--good)' }} /> : <span className="text-[var(--ink-3)]">—</span>
                      ) : (
                        <span className={f.type === 'number' || f.type === 'date' ? 'num' : ''}>{String(r.values[f.id] ?? '—') || '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right">
                    <Icon name="ChevronRight" size={14} className="text-[var(--ink-3)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <RecordEditor db={db} mod={mod} record={editingRecord} open={!!editingRecord} onClose={() => setEditingRecord(null)} />
      <SchemaEditor mod={mod} open={editingSchema} onClose={() => setEditingSchema(false)} />
    </div>
  );
}

function RecordEditor({ db, mod, record, open, onClose }: { db: DB; mod: CustomModule; record: ModuleRecord | null; open: boolean; onClose: () => void }) {
  const [values, setValues] = useState<ModuleRecord['values']>(record?.values ?? {});
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setValues(record?.values ?? {}), [record]);
  if (!record) return null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title={`${mod.name} record`}
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
                actions.updateModuleRecord(record.id, values);
                onClose();
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {mod.fields.map((f) => (
            <Field key={f.id} label={f.name} className={f.type === 'longtext' ? 'sm:col-span-2' : undefined} as={f.type === 'checkbox' ? 'div' : 'label'}>
              {f.type === 'longtext' ? (
                <textarea className="field min-h-[80px] resize-y" value={String(values[f.id] ?? '')} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
              ) : f.type === 'select' ? (
                <Select
                  value={String(values[f.id] ?? '')}
                  onChange={(v) => setValues({ ...values, [f.id]: v })}
                  options={[{ value: '', label: '—' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]}
                />
              ) : f.type === 'checkbox' ? (
                <button
                  className="btn"
                  onClick={() => setValues({ ...values, [f.id]: !values[f.id] })}
                  aria-pressed={!!values[f.id]}
                >
                  <Icon name={values[f.id] ? 'CheckCircle2' : 'Circle'} size={14} />
                  {values[f.id] ? 'Yes' : 'No'}
                </button>
              ) : (
                <input
                  className="field"
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                  value={String(values[f.id] ?? '')}
                  onChange={(e) => setValues({ ...values, [f.id]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="Delete this record?"
        body="It is removed from this module."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.deleteModuleRecord(record.id);
          setConfirming(false);
          onClose();
        }}
      />
    </>
  );
}

function SchemaEditor({ mod, open, onClose }: { mod: CustomModule; open: boolean; onClose: () => void }) {
  const [fields, setFields] = useState<ModuleField[]>(mod.fields);
  const [name, setName] = useState(mod.name);
  useEffect(() => {
    setFields(mod.fields);
    setName(mod.name);
  }, [mod, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Module fields"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              actions.updateModule(mod.id, { fields, name });
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Module name">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <div className="mt-4 label mb-2">Fields</div>
      <div className="flex flex-col gap-2">
        {fields.map((f, i) => (
          <div key={f.id} className="rounded-xl p-3 grid gap-2.5 sm:grid-cols-[1fr_9rem_auto]" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            <input className="field" value={f.name} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Select
              value={f.type}
              onChange={(v) => setFields(fields.map((x, j) => (j === i ? { ...x, type: v as FieldType } : x)))}
              options={TYPES}
            />
            <div className="flex items-center gap-1.5">
              <button
                className="btn btn-ghost !px-2"
                title={f.primary ? 'Shown in the table' : 'Hidden from the table'}
                onClick={() => setFields(fields.map((x, j) => (j === i ? { ...x, primary: !x.primary } : x)))}
              >
                <Icon name={f.primary ? 'Eye' : 'EyeOff'} size={14} />
              </button>
              <button className="btn btn-ghost !px-2" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label="Remove field">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
            {f.type === 'select' && (
              <input
                className="field sm:col-span-3"
                placeholder="Choices, comma separated"
                value={(f.options ?? []).join(', ')}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : x)))}
              />
            )}
          </div>
        ))}
      </div>
      <button className="btn mt-3" onClick={() => setFields([...fields, { id: uid(), name: 'New field', type: 'text' }])}>
        <Icon name="Plus" size={14} />
        Add field
      </button>
    </Modal>
  );
}

export function NewModuleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Box');
  const [color, setColor] = useState('#5784d7');

  useEffect(() => {
    if (open) {
      setName('');
      setIcon('Box');
      setColor('#5784d7');
    }
  }, [open]);

  const palette = ['#d06200', '#5784d7', '#029f6d', '#a75ddd', '#ad7c04', '#08999e'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New module"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              const m = actions.addModule({ name: name.trim(), icon, color });
              onCreated(m.id);
              onClose();
            }}
          >
            Create
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-[var(--ink-2)] mb-4 leading-relaxed">
        A module is a small table you define yourself — a reading list, an expense log, a networking record, a research tracker.
        You choose the fields after creating it.
      </p>
      <div className="grid gap-4">
        <Field label="Name">
          <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Reading list" />
        </Field>
        <Field label="Colour" as="div">
          <div className="flex gap-2">
            {palette.map((c) => (
              <button key={c} onClick={() => setColor(c)} className="h-7 w-7 rounded-lg" aria-label={c} style={{ background: c, outline: color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </Field>
        <Field label="Icon" as="div">
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
            {ICON_NAMES.slice(0, 40).map((n) => (
              <button
                key={n}
                onClick={() => setIcon(n)}
                className="grid h-8 w-8 place-items-center rounded-lg"
                style={{ background: icon === n ? 'var(--accent-soft)' : 'var(--sunken)', border: `1px solid ${icon === n ? 'var(--accent)' : 'var(--hairline)'}` }}
                aria-label={n}
              >
                <Icon name={n} size={15} />
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
