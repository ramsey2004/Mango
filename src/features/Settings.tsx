import { useRef, useState } from 'react';
import type { DB, Settings as S, WidgetType } from '../lib/types';
import { actions, canUndo } from '../store/store';
import { useNav } from '../store/nav';
import { Panel, SectionHeader, Field, Select, Toggle, Segmented, ConfirmDialog, useToast, Chip, Empty } from '../components/ui';
import { MailSettingsPanel } from './mail/MailConnect';
import { Icon, ICON_NAMES } from '../components/Icon';
import { NewModuleModal } from './Modules';
import { nutrition } from '../store/store';
import { targetsFor, bmi, bmiBand } from '../engine/calories';
import { checkEndpoint } from '../engine/ai';
import { DIET_LABELS, NutritionProfilePanel, IntegrationsPanel, PricingPanel } from './nutrition/NutritionSettings';
import { download, uid, cn } from '../lib/util';

const WIDGET_LABELS: Record<WidgetType, string> = {
  jarvis: 'Assistant recommendations',
  today: 'Today',
  goals: 'Active goals',
  deadlines: 'Upcoming deadlines',
  atrisk: 'At risk',
  projects: 'Projects',
  habits: 'Habits',
  snapshot: 'Snapshot',
  insights: 'Insights',
  applications: 'Applications',
  mail_brief: 'Email actions',
  nut_meal: "Today's meal",
  nut_macros: 'Calories and macros',
  nut_consistency: 'Consistency score',
  nut_grocery: 'Grocery list',
  nut_activity: 'Activity',
};

type Tab = 'general' | 'appearance' | 'widgets' | 'taxonomy' | 'periods' | 'modules' | 'assistant' | 'mail' | 'nutrition' | 'integrations' | 'plan' | 'data';

export function SettingsView({ db, focusId }: { db: DB; focusId?: string }) {
  const nav = useNav();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((focusId as Tab) ?? 'general');
  const s = db.settings;
  const set = (p: Partial<S>) => actions.updateSettings(p);

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'general', label: 'General', icon: 'User' },
    { id: 'appearance', label: 'Appearance', icon: 'Sun' },
    { id: 'widgets', label: 'Dashboard', icon: 'Grid3x3' },
    { id: 'taxonomy', label: 'Areas & priorities', icon: 'Layers' },
    { id: 'periods', label: 'Seasons', icon: 'Compass' },
    { id: 'modules', label: 'Custom modules', icon: 'Box' },
    { id: 'assistant', label: 'Assistant', icon: 'Sparkles' },
    { id: 'mail', label: 'Email actions', icon: 'Mail' },
    { id: 'nutrition', label: 'Nutrition profile', icon: 'Heart' },
    { id: 'integrations', label: 'Integrations', icon: 'Link2' },
    { id: 'plan', label: 'Plans & pricing', icon: 'Star' },
    { id: 'data', label: 'Data & privacy', icon: 'Lock' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="label mb-2">Everything here is yours to change</div>
        <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Settings</h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-left transition-colors')}
              style={tab === t.id ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 } : undefined}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-4">
          {tab === 'general' && <General db={db} />}
          {tab === 'appearance' && <Appearance db={db} />}
          {tab === 'widgets' && <Widgets db={db} />}
          {tab === 'taxonomy' && <Taxonomy db={db} />}
          {tab === 'periods' && <Periods db={db} />}
          {tab === 'modules' && <ModulesSettings db={db} />}
          {tab === 'assistant' && <Assistant db={db} />}
          {tab === 'mail' && <MailSettingsPanel db={db} />}
          {tab === 'nutrition' && <NutritionProfilePanel db={db} />}
          {tab === 'integrations' && <IntegrationsPanel db={db} />}
          {tab === 'plan' && <PricingPanel db={db} />}
          {tab === 'data' && <Data db={db} />}
        </div>
      </div>
    </div>
  );
}

function General({ db }: { db: DB }) {
  const s = db.settings;
  const set = (p: Partial<S>) => actions.updateSettings(p);
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="General" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Your name" hint="Used in the greeting and the daily briefing.">
          <input className="field" value={s.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Leave blank for none" />
        </Field>
        <Field label="Week starts on">
          <Select
            value={String(s.firstDayOfWeek)}
            onChange={(v) => set({ firstDayOfWeek: Number(v) as 0 | 1 })}
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
          />
        </Field>
        <Field label="Date format">
          <Select
            value={s.dateFormat}
            onChange={(v) => set({ dateFormat: v as S['dateFormat'] })}
            options={[
              { value: 'dmy', label: 'DD/MM/YYYY' },
              { value: 'mdy', label: 'MM/DD/YYYY' },
              { value: 'iso', label: 'YYYY-MM-DD' },
            ]}
          />
        </Field>
        <Field label="Clock" as="div">
          <Segmented
            value={s.time24h ? '24' : '12'}
            onChange={(v) => set({ time24h: v === '24' })}
            options={[
              { value: '24', label: '24 hour' },
              { value: '12', label: '12 hour' },
            ]}
          />
        </Field>
        <Field label="Focus session length (minutes)">
          <input className="field" type="number" min={1} value={s.pomodoroWork} onChange={(e) => set({ pomodoroWork: Number(e.target.value) })} />
        </Field>
        <Field label="Break length (minutes)">
          <input className="field" type="number" min={1} value={s.pomodoroBreak} onChange={(e) => set({ pomodoroBreak: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="mt-6">
        <SectionHeader title="Notifications" label="Browser notifications, granted by you" />
        <div className="mt-2">
          <Toggle
            label="Enable notifications"
            hint={
              typeof Notification === 'undefined'
                ? 'This browser does not support notifications.'
                : Notification.permission === 'denied'
                  ? 'Blocked in your browser settings — Mango cannot re-request it.'
                  : 'Mango asks the browser for permission when you turn this on.'
            }
            checked={s.notifications.enabled}
            onChange={async (v) => {
              if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                const res = await Notification.requestPermission();
                if (res !== 'granted') {
                  actions.updateSettings({ notifications: { ...s.notifications, enabled: false } });
                  return;
                }
              }
              actions.updateSettings({ notifications: { ...s.notifications, enabled: v } });
            }}
          />
          {s.notifications.enabled && (
            <div className="pl-1">
              <Toggle label="Deadlines approaching" checked={s.notifications.deadlines} onChange={(v) => actions.updateSettings({ notifications: { ...s.notifications, deadlines: v } })} />
              <Toggle label="Overdue tasks" checked={s.notifications.overdue} onChange={(v) => actions.updateSettings({ notifications: { ...s.notifications, overdue: v } })} />
              <Toggle label="Goals falling behind" checked={s.notifications.atRiskGoals} onChange={(v) => actions.updateSettings({ notifications: { ...s.notifications, atRiskGoals: v } })} />
              <Toggle label="Daily briefing" hint="Fires once a day while Mango is open." checked={s.notifications.dailyBriefing} onChange={(v) => actions.updateSettings({ notifications: { ...s.notifications, dailyBriefing: v } })} />
              <Toggle label="Weekly review reminder" checked={s.notifications.weeklyReview} onChange={(v) => actions.updateSettings({ notifications: { ...s.notifications, weeklyReview: v } })} />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Appearance({ db }: { db: DB }) {
  const s = db.settings;
  const set = (p: Partial<S>) => actions.updateSettings(p);
  const accents = [
    { name: 'Mango', dark: '#ff8a3d' },
    { name: 'Ember', dark: '#f2555a' },
    { name: 'Jade', dark: '#3ec08c' },
    { name: 'Cobalt', dark: '#6c9bf0' },
    { name: 'Iris', dark: '#b07ce8' },
    { name: 'Brass', dark: '#dfa62f' },
  ];
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Appearance" />
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Field label="Theme" as="div">
          <Segmented
            value={s.theme}
            onChange={(v) => set({ theme: v as S['theme'] })}
            options={[
              { value: 'dark', label: 'Dark', icon: 'Moon' },
              { value: 'light', label: 'Light', icon: 'Sun' },
              { value: 'system', label: 'System', icon: 'Gauge' },
            ]}
          />
        </Field>
        <Field label="Density" as="div">
          <Segmented
            value={s.density}
            onChange={(v) => set({ density: v as S['density'] })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </Field>
        <Field label="Accent" className="sm:col-span-2" as="div">
          <div className="flex flex-wrap gap-2">
            {accents.map((a) => (
              <button
                key={a.name}
                onClick={() => set({ accent: a.dark })}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
                style={{
                  background: s.accent === a.dark ? 'var(--accent-soft)' : 'var(--sunken)',
                  border: `1px solid ${s.accent === a.dark ? a.dark : 'var(--hairline)'}`,
                }}
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.dark }} />
                {a.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Animation" className="sm:col-span-2" hint="Reduced-motion in your operating system always wins over this." as="div">
          <Segmented
            value={s.animation}
            onChange={(v) => set({ animation: v as S['animation'] })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'subtle', label: 'Subtle' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Field>
      </div>
    </Panel>
  );
}

function Widgets({ db }: { db: DB }) {
  const widgets = [...db.settings.widgets].sort((a, b) => a.order - b.order);
  const move = (id: string, dir: -1 | 1) => {
    const idx = widgets.findIndex((w) => w.id === id);
    const to = idx + dir;
    if (to < 0 || to >= widgets.length) return;
    const copy = [...widgets];
    [copy[idx], copy[to]] = [copy[to], copy[idx]];
    actions.setWidgets(copy.map((w, i) => ({ ...w, order: i })));
  };
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Dashboard widgets" label="Order, visibility and width" />
      <div className="mt-4 flex flex-col gap-1.5">
        {widgets.map((w, i) => (
          <div key={w.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            <div className="flex flex-col">
              <button className="btn btn-ghost !p-0.5" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label="Move up">
                <Icon name="ChevronUp" size={13} />
              </button>
              <button className="btn btn-ghost !p-0.5" onClick={() => move(w.id, 1)} disabled={i === widgets.length - 1} aria-label="Move down">
                <Icon name="ChevronDown" size={13} />
              </button>
            </div>
            <span className="min-w-0 flex-1 basis-[9rem] text-[13px]">
              {WIDGET_LABELS[w.type]}
              {String(w.type).startsWith('nut_') && <span className="ml-2 text-[11px] text-[var(--ink-3)]">nutrition</span>}
            </span>
            <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={String(w.span)}
              onChange={(v) => actions.setWidgets(db.settings.widgets.map((x) => (x.id === w.id ? { ...x, span: Number(v) as 1 | 2 } : x)))}
              options={[
                { value: '1', label: 'Half' },
                { value: '2', label: 'Full' },
              ]}
            />
            <button
              className="btn btn-ghost !px-2"
              onClick={() => actions.setWidgets(db.settings.widgets.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)))}
              aria-label={w.visible ? 'Hide' : 'Show'}
            >
              <Icon name={w.visible ? 'Eye' : 'EyeOff'} size={15} style={{ color: w.visible ? 'var(--ink)' : 'var(--ink-3)' }} />
            </button>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Taxonomy({ db }: { db: DB }) {
  const [confirm, setConfirm] = useState<{ kind: 'area' | 'priority' | 'stage'; id: string; name: string } | null>(null);
  const palette = ['#d06200', '#5784d7', '#029f6d', '#a75ddd', '#ad7c04', '#08999e', '#f2555a', '#98a1ae'];

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Areas of life" label="Rename, recolour, reorder or remove — none of these are fixed" right={<button className="btn" onClick={() => actions.addArea({})}><Icon name="Plus" size={14} />Add</button>} />
        <div className="mt-4 flex flex-col gap-1.5">
          {[...db.areas].sort((a, b) => a.order - b.order).map((a, i, arr) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <div className="flex flex-col">
                <button className="btn btn-ghost !p-0.5" disabled={i === 0} aria-label="Move up" onClick={() => { const ids = arr.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; actions.reorderAreas(ids); }}>
                  <Icon name="ChevronUp" size={13} />
                </button>
                <button className="btn btn-ghost !p-0.5" disabled={i === arr.length - 1} aria-label="Move down" onClick={() => { const ids = arr.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; actions.reorderAreas(ids); }}>
                  <Icon name="ChevronDown" size={13} />
                </button>
              </div>
              <input className="field !w-40 flex-1 min-w-[8rem]" value={a.name} onChange={(e) => actions.updateArea(a.id, { name: e.target.value })} />
              <Select
                value={a.icon}
                onChange={(v) => actions.updateArea(a.id, { icon: v })}
                ariaLabel="Icon"
                className="w-[9rem]"
                options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
              />
              <div className="flex gap-1">
                {palette.map((c) => (
                  <button key={c} onClick={() => actions.updateArea(a.id, { color: c })} className="h-6 w-6 rounded-md" aria-label={c} style={{ background: c, outline: a.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 1 }} />
                ))}
              </div>
              <button className="btn btn-ghost !px-2" onClick={() => setConfirm({ kind: 'area', id: a.id, name: a.name })} aria-label="Delete area">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Priority levels" label="The engine ranks by the order here — top is most important" right={<button className="btn" onClick={() => actions.addPriority({})}><Icon name="Plus" size={14} />Add</button>} />
        <div className="mt-4 flex flex-col gap-1.5">
          {[...db.priorities].sort((a, b) => a.rank - b.rank).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <input className="field !w-14 text-center" value={p.glyph} onChange={(e) => actions.updatePriority(p.id, { glyph: e.target.value.slice(0, 2) })} aria-label="Glyph" />
              <input className="field flex-1 min-w-[7rem]" value={p.name} onChange={(e) => actions.updatePriority(p.id, { name: e.target.value })} />
              <input className="field !w-20" type="number" value={p.rank} onChange={(e) => actions.updatePriority(p.id, { rank: Number(e.target.value) })} aria-label="Rank" />
              <div className="flex gap-1">
                {palette.map((c) => (
                  <button key={c} onClick={() => actions.updatePriority(p.id, { color: c })} className="h-6 w-6 rounded-md" aria-label={c} style={{ background: c, outline: p.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 1 }} />
                ))}
              </div>
              <button className="btn btn-ghost !px-2" disabled={db.priorities.length <= 2} onClick={() => setConfirm({ kind: 'priority', id: p.id, name: p.name })} aria-label="Delete level">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Application stages" label="The pipeline in the Applications view" right={<button className="btn" onClick={() => actions.addStage({})}><Icon name="Plus" size={14} />Add</button>} />
        <div className="mt-4 flex flex-col gap-1.5">
          {[...db.stages].sort((a, b) => a.order - b.order).map((st) => (
            <div key={st.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <input className="field flex-1 min-w-[8rem]" value={st.name} onChange={(e) => actions.updateStage(st.id, { name: e.target.value })} />
              <input className="field !w-20" type="number" value={st.order} onChange={(e) => actions.updateStage(st.id, { order: Number(e.target.value) })} aria-label="Order" />
              <button
                className="btn !text-[12px]"
                onClick={() => actions.updateStage(st.id, { terminal: !st.terminal })}
                title="A terminal stage means the opportunity is no longer in play"
              >
                {st.terminal ? 'Closed stage' : 'In play'}
              </button>
              <div className="flex gap-1">
                {palette.map((c) => (
                  <button key={c} onClick={() => actions.updateStage(st.id, { color: c })} className="h-6 w-6 rounded-md" aria-label={c} style={{ background: c, outline: st.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 1 }} />
                ))}
              </div>
              <button className="btn btn-ghost !px-2" disabled={db.stages.length <= 2} onClick={() => setConfirm({ kind: 'stage', id: st.id, name: st.name })} aria-label="Delete stage">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Objectives" label="An optional layer between an area and its goals" right={<button className="btn" onClick={() => actions.addObjective({})}><Icon name="Plus" size={14} />Add</button>} />
        <div className="mt-4 flex flex-col gap-1.5">
          {db.objectives.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <input className="field flex-1 min-w-[9rem]" value={o.name} onChange={(e) => actions.updateObjective(o.id, { name: e.target.value })} />
              <Select
                value={o.areaId ?? ''}
                onChange={(v) => actions.updateObjective(o.id, { areaId: v || undefined })}
                ariaLabel="Area"
                className="w-[11rem]"
                options={[{ value: '', label: 'No area' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]}
              />
              <button className="btn btn-ghost !px-2" onClick={() => actions.deleteObjective(o.id)} aria-label="Delete objective">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          ))}
          {db.objectives.length === 0 && <p className="text-[12.5px] text-[var(--ink-3)] py-2">None yet. Most people never need this layer — add one only if goals start feeling crowded.</p>}
        </div>
      </Panel>

      <ConfirmDialog
        open={!!confirm}
        title={`Delete “${confirm?.name}”?`}
        body={
          confirm?.kind === 'area'
            ? 'Anything assigned to this area keeps existing, but loses its area.'
            : confirm?.kind === 'priority'
              ? 'Tasks at this level are moved to the next available level.'
              : 'Applications at this stage are moved to the first remaining stage.'
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'area') actions.deleteArea(confirm.id);
          if (confirm.kind === 'priority') actions.deletePriority(confirm.id);
          if (confirm.kind === 'stage') actions.deleteStage(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}

function Periods({ db }: { db: DB }) {
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader
        title="Seasons"
        label="Temporarily re-weight whole areas of life"
        right={
          <button className="btn" onClick={() => actions.addPeriod({ name: 'New season' })}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        }
      />
      <p className="mt-3 text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-[62ch]">
        During a season, tasks in the listed areas are scored higher or lower. Set a multiplier above 1 to raise an area, below 1 to damp it.
        Outside the dates, the season has no effect at all.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {db.periods.map((p) => (
          <div key={p.id} className="rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="field flex-1 min-w-[9rem]" value={p.name} onChange={(e) => actions.updatePeriod(p.id, { name: e.target.value })} />
              <input className="field !w-[9.5rem]" type="date" value={p.start} onChange={(e) => actions.updatePeriod(p.id, { start: e.target.value })} aria-label="Start" />
              <input className="field !w-[9.5rem]" type="date" value={p.end} onChange={(e) => actions.updatePeriod(p.id, { end: e.target.value })} aria-label="End" />
              <button className="btn !text-[12px]" onClick={() => actions.updatePeriod(p.id, { active: !p.active })}>
                {p.active ? 'Active' : 'Paused'}
              </button>
              <button className="btn btn-ghost !px-2" onClick={() => actions.deletePeriod(p.id)} aria-label="Delete season">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {db.areas.map((a) => {
                const w = p.weights[a.id] ?? 1;
                return (
                  <label key={a.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: a.color }} />
                    <span className="flex-1 truncate">{a.name}</span>
                    <input
                      className="field !w-[4.5rem] !py-1"
                      type="number"
                      step={0.1}
                      min={0}
                      max={3}
                      value={w}
                      onChange={(e) => actions.updatePeriod(p.id, { weights: { ...p.weights, [a.id]: Number(e.target.value) } })}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {db.periods.length === 0 && (
          <Empty icon="Compass" title="No seasons defined" body="Placement season, exam week, a project sprint, a holiday — each one changes what should rank first." />
        )}
      </div>
    </Panel>
  );
}

function ModulesSettings({ db }: { db: DB }) {
  const nav = useNav();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader
          title="Custom modules"
          label="Anything Mango does not already model"
          right={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="Plus" size={14} />
              New module
            </button>
          }
        />
        <div className="mt-4 flex flex-col gap-1.5">
          {db.modules.filter((m) => !m.archived).map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <span className="grid h-8 w-8 place-items-center rounded-lg shrink-0" style={{ background: `${m.color}1f`, border: `1px solid ${m.color}44` }}>
                <Icon name={m.icon} size={15} style={{ color: m.color }} />
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-semibold">{m.name}</span>
                <span className="block text-[11.5px] text-[var(--ink-3)]">
                  {m.fields.length} fields · {db.moduleRecords.filter((r) => r.moduleId === m.id).length} records
                </span>
              </span>
              <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go(`module:${m.id}`)}>
                Open
              </button>
              <button className="btn btn-ghost !px-2" onClick={() => actions.deleteModule(m.id)} aria-label="Delete module">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          ))}
          {db.modules.length === 0 && (
            <Empty icon="Box" title="No custom modules" body="A finance tracker, a reading list, a networking record, a course log — define the fields and Mango gives you the table." />
          )}
        </div>
      </Panel>
      <NewModuleModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => nav.go(`module:${id}`)} />
    </>
  );
}

function Assistant({ db }: { db: DB }) {
  const s = db.settings;
  const set = (p: Partial<S>) => actions.updateSettings(p);
  const endpoint = checkEndpoint(s.aiEndpoint);
  const configured = Boolean(s.aiEndpoint && s.aiModel) && endpoint.ok;
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Assistant" label={configured ? 'An endpoint is configured' : 'Running on local rules only'} />
      <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
        <p className="text-[var(--ink-2)]">
          Mango's assistant answers questions about your own records — priorities, overdue work, what is slipping, a plan for the day, your
          weekly review — entirely on this device, with no model involved. That part always works.
        </p>
        <p className="mt-2 text-[var(--ink-2)]">
          Free-form questions need a language model, and Mango does not ship one. Point it at any OpenAI-compatible endpoint below and those
          questions are sent there, along with a summary of your goals and open tasks. Leave it blank and nothing ever leaves this device.
        </p>
      </div>
      <div className="mt-4 grid gap-4">
        <Field label="Endpoint URL" hint="For example https://api.openai.com/v1/chat/completions, or a local server.">
          <input className="field" value={s.aiEndpoint} onChange={(e) => set({ aiEndpoint: e.target.value })} placeholder="https://…" />
        </Field>
        {s.aiEndpoint.trim() !== '' && !endpoint.ok && (
          <div className="rounded-xl p-3 text-[12.5px] leading-relaxed" style={{ background: 'var(--sunken)', border: '1px solid var(--critical)' }}>
            {endpoint.why} Nothing will be sent until this is fixed.
          </div>
        )}
        {endpoint.ok && (
          <div className="rounded-xl p-3 text-[12.5px] leading-relaxed text-[var(--ink-2)]" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
            Your questions and a summary of your goals, open tasks and today's nutrition will be sent to{' '}
            <strong>{endpoint.host}</strong>. Mango has no way to check what that host does with them.
          </div>
        )}
        <Field label="Model">
          <input className="field" value={s.aiModel} onChange={(e) => set({ aiModel: e.target.value })} placeholder="model name" />
        </Field>
        <Field label="API key" hint="Stored in this browser only, in the same local database as your tasks. Anyone with access to this device can read it — and it is deliberately left out of backup exports.">
          <input className="field" type="password" value={s.aiKey} onChange={(e) => set({ aiKey: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Chip color={configured ? 'var(--good)' : 'var(--ink-3)'}>{configured ? 'Connected' : 'Not connected'}</Chip>
        {configured && (
          <button className="btn btn-ghost !text-[12px]" onClick={() => set({ aiEndpoint: '', aiModel: '', aiKey: '' })}>
            Disconnect
          </button>
        )}
      </div>
    </Panel>
  );
}

function Data({ db }: { db: DB }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<'reset' | 'demo' | null>(null);

  const counts = [
    ['Tasks', db.tasks.length],
    ['Goals', db.goals.length],
    ['Projects', db.projects.length],
    ['Habits', db.habits.length],
    ['Notes', db.notes.length],
    ['Applications', db.applications.length],
    ['Module records', db.moduleRecords.length],
    ['Reviews', db.reviews.length],
  ] as const;

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Your data" label="Stored in this browser, in IndexedDB" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {counts.map(([label, n]) => (
            <div key={label}>
              <div className="num text-[20px] font-semibold leading-none">{n}</div>
              <div className="label mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-[64ch]">
          Nothing here is sent anywhere. It lives in this browser on this device, which also means clearing site data deletes it — so export a
          backup now and then, especially before switching browsers.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={async () => {
              const json = await actions.exportJSON();
              download(`mango-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
              toast({ text: 'Backup downloaded — your API key is not included in it', tone: 'good' });
            }}
          >
            <Icon name="Download" size={14} />
            Export everything
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="Upload" size={14} />
            Import a backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const res = actions.importJSON(text);
              if (res.ok) toast({ text: 'Backup restored', tone: 'good' });
              else toast({ text: res.error, tone: 'critical' });
              e.target.value = '';
            }}
          />
          {db.settings.seeded ? (
            <button className="btn" onClick={() => setConfirm('demo')}>
              <Icon name="Trash2" size={14} />
              Remove demo data
            </button>
          ) : (
            <button className="btn" onClick={() => actions.loadDemo()}>
              <Icon name="Sparkles" size={14} />
              Load demo data
            </button>
          )}
          <button className="btn btn-danger" onClick={() => setConfirm('reset')}>
            Reset everything
          </button>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirm === 'demo'}
        title="Remove the demo data?"
        body="Only the records Mango created as examples are deleted. Anything you have added or edited yourself is kept."
        confirmLabel="Remove demo data"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          actions.removeDemo();
          setConfirm(null);
          toast({ text: 'Demo data removed', tone: 'info' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Delete everything?"
        body="Every task, goal, project, note, habit, application and review is permanently deleted from this browser. Export a backup first if there is any chance you want it back."
        confirmLabel="Delete everything"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await actions.resetAll();
          setConfirm(null);
          toast({ text: 'Everything reset', tone: 'warning' });
        }}
      />
    </>
  );
}
