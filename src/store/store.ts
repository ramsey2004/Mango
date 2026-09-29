import { useSyncExternalStore } from 'react';
import type {
  DB, Task, Goal, Project, Area, Note, Application, Habit, HabitEntry, Milestone,
  Objective, CustomModule, ModuleRecord, Settings, AppNotification, PriorityLevel,
  PipelineStage, ContextPeriod, ReviewEntry, FocusSession, ID,
} from '../lib/types';
import { emptyDB, seedDemo, stripDemo } from '../lib/seed';
import { loadDB, saveDB, flushDB, wipeDB, lastLoadOutcome, type LoadOutcome } from '../lib/db';
import { uid, now, todayISO, toISODate, addDays, addMonths, fromISODate } from '../lib/util';
import type {
  ActionItem, ActionStatus, MailCorrection, MailSettings, MailSync, RawMessage,
} from '../lib/mail-types';
import { emptyMail } from '../lib/mail-types';
import { ingest } from '../engine/mail/ingest';
import { wokenUp } from '../engine/mail/actionCenter';

/* ============================================================
   A tiny external store. One document, replaced on every write,
   so component identity checks are cheap and correct.
   ============================================================ */

let state: DB = emptyDB();
let ready = false;
const subs = new Set<() => void>();

const past: DB[] = [];
const future: DB[] = [];
const HISTORY_LIMIT = 40;

const notify = () => subs.forEach((f) => f());

function commit(next: DB, opts: { history?: boolean } = {}) {
  if (opts.history !== false) {
    past.push(state);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
  }
  state = next;
  saveDB(state);
  notify();
}

export function set(fn: (d: DB) => DB, opts?: { history?: boolean }) {
  commit(fn(state), opts);
}

export const getDB = () => state;
export const isReady = () => ready;
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function undo() {
  const prev = past.pop();
  if (!prev) return false;
  future.push(state);
  state = prev;
  saveDB(state);
  notify();
  return true;
}

export function redo() {
  const next = future.pop();
  if (!next) return false;
  past.push(state);
  state = next;
  saveDB(state);
  notify();
  return true;
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}

export async function boot(): Promise<void> {
  const loaded = await loadDB();
  if (loaded) {
    state = loaded;
  } else {
    const outcome = lastLoadOutcome();
    if (outcome.kind === 'unreadable' || outcome.kind === 'newer') {
      // Something IS saved here, it just cannot be used. Seeding demo data over
      // it would destroy whatever is left, so the app starts empty, keeps the
      // original bytes for download, and says what happened.
      bootProblem = outcome;
      state = emptyDB();
      ready = true;
      notify();
      return;
    }
    state = seedDemo(emptyDB());
    saveDB(state);
  }
  ready = true;
  notify();
}

/** Set when the saved workspace could not be opened. Read by the shell. */
let bootProblem: LoadOutcome | null = null;
export const getBootProblem = () => bootProblem;
export const dismissBootProblem = () => {
  bootProblem = null;
  notify();
};

/* ------------------------------- helpers -------------------------------- */

const stamp = () => now();
const touch = <T extends { updatedAt: string }>(x: T): T => ({ ...x, updatedAt: stamp() });

const replace = <T extends { id: string }>(arr: T[], id: string, fn: (x: T) => T): T[] =>
  arr.map((x) => (x.id === id ? fn(x) : x));

/* --------------------------------- tasks -------------------------------- */

export const newTaskDraft = (over: Partial<Task> = {}): Task => ({
  id: uid(),
  title: '',
  priorityId: 'p_medium',
  importance: 3,
  impact: 3,
  strategic: 3,
  effortMins: 30,
  status: 'todo',
  kanban: 'planned',
  tags: [],
  dependsOn: [],
  manualBoost: 0,
  order: Date.now(),
  createdAt: stamp(),
  updatedAt: stamp(),
  ...over,
});

export const actions = {
  /* ---- tasks ---- */
  addTask(t: Partial<Task>): Task {
    const task = newTaskDraft(t);
    set((d) => ({ ...d, tasks: [...d.tasks, task] }));
    return task;
  },
  updateTask(id: ID, patch: Partial<Task>) {
    set((d) => ({ ...d, tasks: replace(d.tasks, id, (t) => touch({ ...t, ...patch })) }));
  },
  deleteTask(id: ID) {
    set((d) => ({
      ...d,
      tasks: d.tasks.filter((t) => t.id !== id && t.parentId !== id),
    }));
  },
  duplicateTask(id: ID) {
    const src = state.tasks.find((t) => t.id === id);
    if (!src) return;
    const copy: Task = {
      ...src,
      id: uid(),
      title: `${src.title} (copy)`,
      status: 'todo',
      completedAt: undefined,
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    set((d) => ({ ...d, tasks: [...d.tasks, copy] }));
  },
  toggleTask(id: ID) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'done') {
      actions.updateTask(id, { status: 'todo', kanban: 'planned', completedAt: undefined });
      return;
    }
    actions.updateTask(id, { status: 'done', kanban: 'done', completedAt: stamp() });
    // A recurring task spawns its next instance the moment this one closes.
    if (t.recurrence) {
      const next = nextOccurrence(t);
      if (next) {
        set((d) => ({
          ...d,
          tasks: [
            ...d.tasks,
            {
              ...t,
              id: uid(),
              status: 'todo',
              kanban: 'planned',
              completedAt: undefined,
              due: next,
              scheduledFor: t.scheduledFor ? next : undefined,
              createdAt: stamp(),
              updatedAt: stamp(),
            },
          ],
        }), { history: false });
      }
    }
  },
  postponeTask(id: ID, days = 1) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const base = t.scheduledFor ?? t.due ?? todayISO();
    const to = toISODate(addDays(base, days));
    actions.updateTask(id, { scheduledFor: to, due: t.due ? toISODate(addDays(t.due, days)) : undefined });
  },
  scheduleTask(id: ID, date: string | undefined) {
    actions.updateTask(id, { scheduledFor: date });
  },
  reorderTask(id: ID, order: number) {
    actions.updateTask(id, { order });
  },
  archiveTask(id: ID, archived = true) {
    actions.updateTask(id, { archived });
  },

  /* ---- goals ---- */
  addGoal(g: Partial<Goal>): Goal {
    const goal: Goal = {
      id: uid(), name: '', priorityId: 'p_medium', importance: 3, status: 'active',
      progressMode: 'auto', manualProgress: 0, tags: [], createdAt: stamp(), updatedAt: stamp(), ...g,
    };
    set((d) => ({ ...d, goals: [...d.goals, goal] }));
    return goal;
  },
  updateGoal(id: ID, patch: Partial<Goal>) {
    set((d) => ({ ...d, goals: replace(d.goals, id, (g) => touch({ ...g, ...patch })) }));
  },
  deleteGoal(id: ID) {
    set((d) => ({
      ...d,
      goals: d.goals.filter((g) => g.id !== id),
      projects: d.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
      tasks: d.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
      milestones: d.milestones.filter((m) => m.goalId !== id),
    }));
  },

  /* ---- projects ---- */
  addProject(p: Partial<Project>): Project {
    const proj: Project = {
      id: uid(), name: '', priorityId: 'p_medium', status: 'active', tags: [],
      createdAt: stamp(), updatedAt: stamp(), ...p,
    };
    set((d) => ({ ...d, projects: [...d.projects, proj] }));
    return proj;
  },
  updateProject(id: ID, patch: Partial<Project>) {
    set((d) => ({ ...d, projects: replace(d.projects, id, (p) => touch({ ...p, ...patch })) }));
  },
  deleteProject(id: ID) {
    set((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      tasks: d.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined, milestoneId: undefined } : t)),
      milestones: d.milestones.filter((m) => m.projectId !== id),
    }));
  },

  /* ---- milestones ---- */
  addMilestone(m: Partial<Milestone>): Milestone {
    const ms: Milestone = { id: uid(), name: '', done: false, order: Date.now(), ...m };
    set((d) => ({ ...d, milestones: [...d.milestones, ms] }));
    return ms;
  },
  updateMilestone(id: ID, patch: Partial<Milestone>) {
    set((d) => ({ ...d, milestones: replace(d.milestones, id, (m) => ({ ...m, ...patch })) }));
  },
  deleteMilestone(id: ID) {
    set((d) => ({
      ...d,
      milestones: d.milestones.filter((m) => m.id !== id),
      tasks: d.tasks.map((t) => (t.milestoneId === id ? { ...t, milestoneId: undefined } : t)),
    }));
  },

  /* ---- areas & objectives ---- */
  addArea(a: Partial<Area>): Area {
    const area: Area = {
      id: uid(), name: 'New area', icon: 'Circle', color: '#6c9bf0',
      order: state.areas.length, ...a,
    };
    set((d) => ({ ...d, areas: [...d.areas, area] }));
    return area;
  },
  updateArea(id: ID, patch: Partial<Area>) {
    set((d) => ({ ...d, areas: replace(d.areas, id, (a) => ({ ...a, ...patch })) }));
  },
  deleteArea(id: ID) {
    set((d) => ({
      ...d,
      areas: d.areas.filter((a) => a.id !== id),
      goals: d.goals.map((g) => (g.areaId === id ? { ...g, areaId: undefined } : g)),
      projects: d.projects.map((p) => (p.areaId === id ? { ...p, areaId: undefined } : p)),
      tasks: d.tasks.map((t) => (t.areaId === id ? { ...t, areaId: undefined } : t)),
      objectives: d.objectives.map((o) => (o.areaId === id ? { ...o, areaId: undefined } : o)),
    }));
  },
  reorderAreas(ids: ID[]) {
    set((d) => ({ ...d, areas: d.areas.map((a) => ({ ...a, order: Math.max(0, ids.indexOf(a.id)) })) }));
  },
  addObjective(o: Partial<Objective>): Objective {
    const obj: Objective = { id: uid(), name: 'New objective', order: state.objectives.length, ...o };
    set((d) => ({ ...d, objectives: [...d.objectives, obj] }));
    return obj;
  },
  updateObjective(id: ID, patch: Partial<Objective>) {
    set((d) => ({ ...d, objectives: replace(d.objectives, id, (o) => ({ ...o, ...patch })) }));
  },
  deleteObjective(id: ID) {
    set((d) => ({
      ...d,
      objectives: d.objectives.filter((o) => o.id !== id),
      goals: d.goals.map((g) => (g.objectiveId === id ? { ...g, objectiveId: undefined } : g)),
    }));
  },

  /* ---- priorities & stages (user-definable taxonomies) ---- */
  addPriority(p: Partial<PriorityLevel>) {
    const lvl: PriorityLevel = {
      id: uid(), name: 'New level', rank: state.priorities.length, color: '#98a1ae', glyph: '•', ...p,
    };
    set((d) => ({ ...d, priorities: [...d.priorities, lvl] }));
  },
  updatePriority(id: ID, patch: Partial<PriorityLevel>) {
    set((d) => ({ ...d, priorities: replace(d.priorities, id, (p) => ({ ...p, ...patch })) }));
  },
  deletePriority(id: ID) {
    const fallback = state.priorities.find((p) => p.id !== id)?.id ?? 'p_medium';
    set((d) => ({
      ...d,
      priorities: d.priorities.filter((p) => p.id !== id),
      tasks: d.tasks.map((t) => (t.priorityId === id ? { ...t, priorityId: fallback } : t)),
      goals: d.goals.map((g) => (g.priorityId === id ? { ...g, priorityId: fallback } : g)),
      projects: d.projects.map((p) => (p.priorityId === id ? { ...p, priorityId: fallback } : p)),
      applications: d.applications.map((a) => (a.priorityId === id ? { ...a, priorityId: fallback } : a)),
    }));
  },
  addStage(s: Partial<PipelineStage>) {
    const st: PipelineStage = { id: uid(), name: 'New stage', color: '#98a1ae', order: state.stages.length, ...s };
    set((d) => ({ ...d, stages: [...d.stages, st] }));
  },
  updateStage(id: ID, patch: Partial<PipelineStage>) {
    set((d) => ({ ...d, stages: replace(d.stages, id, (s) => ({ ...s, ...patch })) }));
  },
  deleteStage(id: ID) {
    const fallback = state.stages.find((s) => s.id !== id)?.id ?? '';
    set((d) => ({
      ...d,
      stages: d.stages.filter((s) => s.id !== id),
      applications: d.applications.map((a) => (a.stageId === id ? { ...a, stageId: fallback } : a)),
    }));
  },

  /* ---- habits ---- */
  addHabit(h: Partial<Habit>): Habit {
    const habit: Habit = {
      id: uid(), name: 'New habit', icon: 'Circle', color: '#3ec08c',
      cadence: 'daily', target: 1, createdAt: stamp(), ...h,
    };
    set((d) => ({ ...d, habits: [...d.habits, habit] }));
    return habit;
  },
  updateHabit(id: ID, patch: Partial<Habit>) {
    set((d) => ({ ...d, habits: replace(d.habits, id, (h) => ({ ...h, ...patch })) }));
  },
  deleteHabit(id: ID) {
    set((d) => ({
      ...d,
      habits: d.habits.filter((h) => h.id !== id),
      habitEntries: d.habitEntries.filter((e) => e.habitId !== id),
    }));
  },
  toggleHabitDay(habitId: ID, date: string) {
    const existing = state.habitEntries.find((e) => e.habitId === habitId && e.date === date);
    if (existing) {
      set((d) => ({ ...d, habitEntries: d.habitEntries.filter((e) => e.id !== existing.id) }));
    } else {
      const entry: HabitEntry = { id: uid(), habitId, date, count: 1 };
      set((d) => ({ ...d, habitEntries: [...d.habitEntries, entry] }));
    }
  },

  /* ---- notes ---- */
  addNote(n: Partial<Note>): Note {
    const note: Note = {
      id: uid(), title: 'Untitled note', body: '', tags: [], pinned: false, links: [],
      createdAt: stamp(), updatedAt: stamp(), ...n,
    };
    set((d) => ({ ...d, notes: [...d.notes, note] }));
    return note;
  },
  updateNote(id: ID, patch: Partial<Note>) {
    set((d) => ({ ...d, notes: replace(d.notes, id, (n) => touch({ ...n, ...patch })) }));
  },
  deleteNote(id: ID) {
    set((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }));
  },
  addNoteFolder(name: string) {
    set((d) => ({ ...d, noteFolders: [...d.noteFolders, { id: uid(), name, order: d.noteFolders.length }] }));
  },
  deleteNoteFolder(id: ID) {
    set((d) => ({
      ...d,
      noteFolders: d.noteFolders.filter((f) => f.id !== id),
      notes: d.notes.map((n) => (n.folderId === id ? { ...n, folderId: undefined } : n)),
    }));
  },

  /* ---- applications ---- */
  addApplication(a: Partial<Application>): Application {
    const app: Application = {
      id: uid(), org: '', role: '', kind: 'Internship',
      stageId: state.stages[0]?.id ?? '', priorityId: 'p_medium', tags: [],
      createdAt: stamp(), updatedAt: stamp(), ...a,
    };
    set((d) => ({ ...d, applications: [...d.applications, app] }));
    return app;
  },
  updateApplication(id: ID, patch: Partial<Application>) {
    set((d) => ({ ...d, applications: replace(d.applications, id, (a) => touch({ ...a, ...patch })) }));
  },
  deleteApplication(id: ID) {
    set((d) => ({ ...d, applications: d.applications.filter((a) => a.id !== id) }));
  },

  /* ---- custom modules ---- */
  addModule(m: Partial<CustomModule>): CustomModule {
    const mod: CustomModule = {
      id: uid(), name: 'New module', icon: 'Box', color: '#6c9bf0',
      fields: [{ id: uid(), name: 'Name', type: 'text', primary: true }],
      createdAt: stamp(), ...m,
    };
    set((d) => ({ ...d, modules: [...d.modules, mod] }));
    return mod;
  },
  updateModule(id: ID, patch: Partial<CustomModule>) {
    set((d) => ({ ...d, modules: replace(d.modules, id, (m) => ({ ...m, ...patch })) }));
  },
  deleteModule(id: ID) {
    set((d) => ({
      ...d,
      modules: d.modules.filter((m) => m.id !== id),
      moduleRecords: d.moduleRecords.filter((r) => r.moduleId !== id),
    }));
  },
  addModuleRecord(moduleId: ID, values: ModuleRecord['values'] = {}): ModuleRecord {
    const rec: ModuleRecord = { id: uid(), moduleId, values, createdAt: stamp(), updatedAt: stamp() };
    set((d) => ({ ...d, moduleRecords: [...d.moduleRecords, rec] }));
    return rec;
  },
  updateModuleRecord(id: ID, values: ModuleRecord['values']) {
    set((d) => ({
      ...d,
      moduleRecords: replace(d.moduleRecords, id, (r) => touch({ ...r, values: { ...r.values, ...values } })),
    }));
  },
  deleteModuleRecord(id: ID) {
    set((d) => ({ ...d, moduleRecords: d.moduleRecords.filter((r) => r.id !== id) }));
  },

  /* ---- context periods ---- */
  addPeriod(p: Partial<ContextPeriod>) {
    const period: ContextPeriod = {
      id: uid(), name: 'New period', start: todayISO(),
      end: toISODate(addDays(new Date(), 30)), weights: {}, active: true, ...p,
    };
    set((d) => ({ ...d, periods: [...d.periods, period] }));
  },
  updatePeriod(id: ID, patch: Partial<ContextPeriod>) {
    set((d) => ({ ...d, periods: replace(d.periods, id, (p) => ({ ...p, ...patch })) }));
  },
  deletePeriod(id: ID) {
    set((d) => ({ ...d, periods: d.periods.filter((p) => p.id !== id) }));
  },

  /* ---- reviews & focus ---- */
  saveReview(r: Omit<ReviewEntry, 'id' | 'createdAt'>) {
    set((d) => ({
      ...d,
      reviews: [
        ...d.reviews.filter((x) => !(x.kind === r.kind && x.periodKey === r.periodKey)),
        { ...r, id: uid(), createdAt: stamp() },
      ],
    }));
  },
  logFocus(s: Omit<FocusSession, 'id'>) {
    const session: FocusSession = { ...s, id: uid() };
    set((d) => ({ ...d, focusSessions: [...d.focusSessions, session] }), { history: false });
  },

  /* ---- notifications ---- */
  pushNotification(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) {
    const note: AppNotification = { ...n, id: uid(), createdAt: stamp(), read: false };
    set((d) => ({ ...d, notifications: [note, ...d.notifications].slice(0, 60) }), { history: false });
  },
  markNotificationsRead() {
    set((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }), { history: false });
  },
  clearNotifications() {
    set((d) => ({ ...d, notifications: [] }), { history: false });
  },

  /* ---- settings ---- */
  updateSettings(patch: Partial<Settings>) {
    set((d) => ({ ...d, settings: { ...d.settings, ...patch } }), { history: false });
  },
  setWidgets(widgets: Settings['widgets']) {
    actions.updateSettings({ widgets });
  },

  /* ---- data management ---- */
  /* ---------------------------------- mail --------------------------------- */

  setMailSettings(patch: Partial<MailSettings>) {
    set((d) => ({ ...d, mail: { ...d.mail, settings: { ...d.mail.settings, ...patch } } }), { history: false });
  },

  /** Called after a successful Google sign-in. The token is never logged. */
  connectMail(email: string, auth: { accessToken: string; expiresAt: number; scope: string }) {
    set((d) => ({
      ...d,
      mail: {
        ...d.mail,
        account: d.mail.account?.email === email ? d.mail.account : { email, connectedAt: now() },
        auth,
        sync: { ...d.mail.sync, status: 'idle', lastError: undefined },
      },
    }), { history: false });
  },

  /** Drops the token but keeps the extracted work, which is the user's. */
  disconnectMail() {
    set((d) => ({
      ...d,
      mail: { ...d.mail, auth: null, account: null, sync: { ...d.mail.sync, status: 'never', historyId: undefined } },
    }), { history: false });
  },

  setMailSync(patch: Partial<MailSync>) {
    set((d) => ({ ...d, mail: { ...d.mail, sync: { ...d.mail.sync, ...patch } } }), { history: false });
  },

  /**
   * Runs extraction over freshly fetched messages and folds the result in.
   * The raw messages are the argument and nothing more — they are never
   * written to the document, so a body cannot outlive this call.
   */
  runIngest(messages: RawMessage[], historyId?: string): { created: number; merged: number; skipped: number } {
    const d = state;
    const r = ingest(messages, { items: d.mail.items, corrections: d.mail.corrections, settings: d.mail.settings });
    const seen = [...new Set([...d.mail.sync.seen, ...messages.map((m) => m.id)])].slice(-4000);
    set((x) => ({
      ...x,
      mail: {
        ...x.mail,
        items: r.items,
        sync: {
          ...x.mail.sync,
          status: 'idle',
          lastSyncAt: now(),
          lastError: undefined,
          historyId: historyId ?? x.mail.sync.historyId,
          seen,
        },
      },
    }), { history: false });
    return { created: r.created, merged: r.merged, skipped: r.skipped };
  },

  /** Wakes anything whose snooze has elapsed. Cheap, and safe to call on open. */
  wakeSnoozed() {
    const woken = wokenUp(state.mail.items);
    if (woken.some((w, i) => w !== state.mail.items[i])) {
      set((d) => ({ ...d, mail: { ...d.mail, items: woken } }), { history: false });
    }
  },

  /** Any edit by hand freezes the item against later machine rewrites. */
  updateAction(id: ID, patch: Partial<ActionItem>, byUser = true) {
    set((d) => ({
      ...d,
      mail: {
        ...d.mail,
        items: d.mail.items.map((i) =>
          i.id === id ? { ...i, ...patch, userEdited: i.userEdited || byUser, updatedAt: now() } : i),
      },
    }));
  },

  setActionStatus(id: ID, status: ActionStatus, snoozedUntil?: string) {
    const item = state.mail.items.find((i) => i.id === id);
    set((d) => ({
      ...d,
      mail: {
        ...d.mail,
        items: d.mail.items.map((i) =>
          i.id === id ? { ...i, status, snoozedUntil, userEdited: true, updatedAt: now() } : i),
      },
    }));
    // Completing something within minutes of seeing it is a signal that this
    // sender's mail deserves to rank higher. Dismissing it says the opposite.
    if (item && (status === 'done' || status === 'cancelled')) {
      actions.recordCorrection({
        kind: status === 'done' ? 'completed_now' : 'dismissed',
        senderDomain: item.source.fromEmail.split('@')[1] ?? '',
        category: item.category,
        patternId: undefined,
      });
    }
  },

  /** "This was never a task." Stronger than dismissing — it damps the rule. */
  notATask(id: ID, patternId?: string) {
    const item = state.mail.items.find((i) => i.id === id);
    set((d) => ({ ...d, mail: { ...d.mail, items: d.mail.items.filter((i) => i.id !== id) } }));
    if (item) {
      actions.recordCorrection({
        kind: 'not_a_task',
        senderDomain: item.source.fromEmail.split('@')[1] ?? '',
        category: item.category,
        patternId,
      });
    }
  },

  recordCorrection(c: Omit<MailCorrection, 'id' | 'at'>) {
    set((d) => ({
      ...d,
      mail: {
        ...d.mail,
        // Corrections are a rolling window. Behaviour from six months ago is
        // not evidence about behaviour now.
        corrections: [...d.mail.corrections, { ...c, id: uid(), at: now() }].slice(-300),
      },
    }), { history: false });
  },

  /**
   * Turn an extracted item into a first-class Mango task, so it ranks in the
   * planner alongside everything else rather than living in a parallel world.
   */
  promoteToTask(id: ID): Task | null {
    const item = state.mail.items.find((i) => i.id === id);
    if (!item || item.taskId) return null;

    const priorityId =
      item.priority === 'P0' ? 'p_critical'
        : item.priority === 'P1' ? 'p_high'
          : item.priority === 'P2' ? 'p_medium'
            : 'p_low';

    const task = newTaskDraft({
      title: item.title,
      notes: `From email — ${item.source.from}: “${item.source.subject}”\n\n“${item.source.evidence}”`,
      priorityId,
      importance: Math.max(1, Math.min(5, Math.round(item.importance / 20))),
      impact: Math.max(1, Math.min(5, Math.round(item.importance / 22))),
      strategic: 3,
      due: item.deadline,
      status: item.status === 'doing' ? 'doing' : 'todo',
      kanban: item.status === 'doing' ? 'inprogress' : 'planned',
      tags: ['email', item.category],
      effortMins: 30,
    });

    set((d) => ({
      ...d,
      tasks: [...d.tasks, task],
      mail: {
        ...d.mail,
        items: d.mail.items.map((i) =>
          i.id === id ? { ...i, taskId: task.id, status: 'todo' as ActionStatus, updatedAt: now() } : i),
      },
    }));
    return task;
  },

  /** Removes every email-derived record. The connection is dropped with it. */
  eraseMailData() {
    set((d) => ({ ...d, mail: emptyMail() }));
  },

  async exportJSON(): Promise<string> {
    await flushDB(state);
    // The API key is a credential, and a backup file gets emailed, synced and
    // shared. It does not belong in one, so it is stripped on the way out and
    // the user is told to re-enter it after a restore.
    // The Gmail access token is a live credential to a mailbox. It is worth
    // even less in a backup than the AI key — it expires within the hour — and
    // costs far more if the file is shared, so it goes the same way.
    const safe: DB = {
      ...state,
      settings: { ...state.settings, aiKey: '' },
      mail: { ...state.mail, auth: null },
    };
    return JSON.stringify(safe, null, 2);
  },
  importJSON(raw: string): { ok: true } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'That file does not contain a Mango backup.' };
    const p = parsed as Partial<DB>;
    if (!Array.isArray(p.tasks) || !Array.isArray(p.areas) || !p.settings) {
      return { ok: false, error: 'That file is missing the core Mango collections (tasks, areas, settings).' };
    }
    const merged: DB = { ...emptyDB(), ...(p as DB) };
    commit(merged);
    return { ok: true };
  },
  async resetAll() {
    await wipeDB();
    commit(emptyDB());
  },
  loadDemo() {
    commit(seedDemo(state));
  },
  /** Clears every seeded record and hands the user an empty workspace. */
  startClean() {
    commit({ ...stripDemo(state), demo: false });
  },
  /** Keeps the sample records but stops calling them demo data. */
  adoptDemoData() {
    commit({ ...state, demo: false });
  },
  removeDemo() {
    commit(stripDemo(state));
  },
};

/* --------------------------- recurrence helper --------------------------- */

export function nextOccurrence(t: Task): string | undefined {
  const r = t.recurrence;
  if (!r) return undefined;
  const base = t.due ?? t.scheduledFor ?? todayISO();
  let next: Date;
  switch (r.freq) {
    case 'daily':
      next = addDays(base, r.interval || 1);
      break;
    case 'weekly': {
      if (r.weekdays?.length) {
        const start = fromISODate(base);
        next = addDays(start, 1);
        for (let i = 0; i < 21; i++) {
          if (r.weekdays.includes(next.getDay())) break;
          next = addDays(next, 1);
        }
      } else {
        next = addDays(base, 7 * (r.interval || 1));
      }
      break;
    }
    case 'monthly':
      next = addMonths(base, r.interval || 1);
      if (r.monthDay) next.setDate(r.monthDay);
      break;
    case 'yearly':
      next = addMonths(base, 12 * (r.interval || 1));
      break;
    default:
      return undefined;
  }
  const iso = toISODate(next);
  if (r.endsOn && iso > r.endsOn) return undefined;
  return iso;
}

/* ============================================================
   Nutrition actions.

   Kept in their own namespace so the productivity model and the
   nutrition model never reach into each other by accident.
   ============================================================ */

import type {
  NutritionProfile, NutritionState, FoodLogEntry, WaterLogEntry, ExerciseEntry, WeightEntry,
  DayPlan, MealFeedback, GroceryItem, CoachTurn, MealSlot, FoodItem, Recipe, FeedbackVerdict,
  FeedbackReason, PlannedMeal, PantryItem,
} from '../lib/nutrition-types';
import { emptyNutrition, seedNutritionDemo, DEMO_PROFILE } from '../lib/nutrition-seed';
import { buildDayPlan } from '../engine/mealRecommender';
import { recipeById, RECIPES } from '../lib/recipe-db';
import { ingredientCost, sameIngredient } from '../lib/ingredient-db';
import { entitlements } from '../engine/entitlements';
import { kcalBurned } from '../engine/calories';

const SLOT_SEQ: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Which meal the clock says we are at. */
function currentSlotNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

const setN = (fn: (n: NutritionState) => NutritionState, opts?: { history?: boolean }) =>
  set((d) => ({ ...d, nutrition: fn(d.nutrition) }), opts);

export const nutrition = {
  saveProfile(p: NutritionProfile) {
    setN((n) => ({ ...n, profile: { ...p, onboardedAt: p.onboardedAt ?? stamp() } }));
    nutrition.regeneratePlan();
  },
  /** Marks the energy-method change as read, so the notice stops appearing. */
  dismissEnergyNotice() {
    setN((n) => ({ ...n, energyMethodNotice: 'seen' }), { history: false });
  },

  updateProfile(patch: Partial<NutritionProfile>) {
    setN((n) => (n.profile ? { ...n, profile: { ...n.profile, ...patch } } : n));
  },
  loadDemoProfile() {
    set((d) => ({ ...d, demo: true, nutrition: seedNutritionDemo({ ...emptyNutrition(), profile: DEMO_PROFILE }) }));
  },
  resetNutrition() {
    setN(() => emptyNutrition());
  },

  /* ------------------------------- planning ------------------------------- */
  /**
   * Rebuilds the slots still ahead of you after something is logged, and
   * records what moved. Eating a big lunch should visibly change dinner —
   * that is the whole loop, and until now it happened silently.
   */
  replanRemaining(date = todayISO(), trigger = 'what you logged') {
    const before = state.nutrition.plans.find((p) => p.date === date);
    if (!before) return;
    nutrition.regeneratePlan(date, true, currentSlotNow());
    const after = state.nutrition.plans.find((p) => p.date === date);
    if (!after) return;
    const nameOf = (id?: string) => (id ? recipeById(id, state.nutrition.customRecipes)?.name : undefined);
    const slots: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
    const changes = slots
      .map((slot) => {
        const was = before.meals.find((x) => x.slot === slot);
        const now = after.meals.find((x) => x.slot === slot);
        // A meal already eaten is history, not a change.
        if (was?.eaten) return null;
        if (was?.recipeId === now?.recipeId) return null;
        if (!was && !now) return null;
        return { slot, fromName: nameOf(was?.recipeId), toName: nameOf(now?.recipeId) };
      })
      .filter(Boolean) as Array<{ slot: MealSlot; fromName?: string; toName?: string }>;
    setN((x) => ({ ...x, lastReplan: changes.length ? { at: stamp(), trigger, changes } : undefined }), { history: false });
  },
  dismissReplan() {
    setN((x) => ({ ...x, lastReplan: undefined }), { history: false });
  },

  regeneratePlan(date = todayISO(), keepLocked = true, replanFrom?: MealSlot) {
    const n = state.nutrition;
    if (!n.profile) return;
    const existing = n.plans.find((p) => p.date === date);
    const consumed = n.logs
      .filter((l) => l.date === date)
      .reduce(
        (a, l) => ({ kcal: a.kcal + l.kcal, protein: a.protein + l.protein, carbs: a.carbs + l.carbs, fat: a.fat + l.fat, fibre: a.fibre + l.fibre }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
      );
    const plan = buildDayPlan(
      {
        profile: n.profile,
        consumed,
        burnedToday: n.exercise.filter((e) => e.date === date && (e.simulated ? n.dataConsent.wearable : n.dataConsent.activity)).reduce((sum, e) => sum + e.kcalBurned, 0),
        spent: (existing?.meals ?? [])
          .filter((m) => m.eaten)
          .reduce((sum, m) => sum + (recipeById(m.recipeId, n.customRecipes)?.costRupees ?? 0), 0),
        pantry: n.pantry.map((p) => p.name),
        useSoon: n.pantry.filter((p) => p.expiresOn && p.expiresOn <= toISODate(addDays(new Date(), 3))).map((p) => p.name),
        trainedToday: n.exercise.some((e) => e.date === date && e.minutes >= 20),
        recentRecipeIds: n.plans.flatMap((p) => (p.date !== date ? p.meals.map((m) => m.recipeId) : [])),
        feedback: n.feedback,
        rejected: n.rejected,
        pool: [...RECIPES, ...n.customRecipes],
        replanFrom,
        // Past slots come along untouched; the engine is told not to rebuild them.
        keep: keepLocked
          ? existing?.meals.filter((m) => m.locked || m.eaten || (replanFrom ? SLOT_SEQ.indexOf(m.slot) < SLOT_SEQ.indexOf(replanFrom) : false))
          : undefined,
      },
      date,
    );
    setN((x) => ({ ...x, plans: [...x.plans.filter((p) => p.date !== date), plan] }));
  },
  swapMeal(date: string, slot: MealSlot, recipeId: string) {
    setN((n) => {
      const plan = n.plans.find((p) => p.date === date);
      if (!plan) return n;
      const previous = plan.meals.find((m) => m.slot === slot)?.recipeId;
      const meals = plan.meals.map((m) => (m.slot === slot ? { ...m, recipeId, eaten: false } : m));
      return {
        ...n,
        plans: n.plans.map((p) => (p.date === date ? { ...p, meals } : p)),
        rejected: previous && previous !== recipeId ? [previous, ...n.rejected.filter((r) => r !== previous)].slice(0, 40) : n.rejected,
      };
    });
  },
  toggleMealLock(date: string, slot: MealSlot) {
    setN((n) => ({
      ...n,
      plans: n.plans.map((p) =>
        p.date === date ? { ...p, meals: p.meals.map((m) => (m.slot === slot ? { ...m, locked: !m.locked } : m)) } : p,
      ),
    }));
  },
  /** Marks a planned meal eaten and writes it into the food log in one step. */
  eatPlannedMeal(date: string, slot: MealSlot) {
    const n = state.nutrition;
    const plan = n.plans.find((p) => p.date === date);
    const meal = plan?.meals.find((m) => m.slot === slot);
    if (!meal) return;
    const r = recipeById(meal.recipeId, n.customRecipes);
    if (!r) return;
    const entry: FoodLogEntry = {
      id: uid(), date, slot, sourceId: r.id, sourceKind: 'recipe', name: r.name, servings: 1,
      kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fibre: r.fibre, loggedAt: stamp(),
    };
    setN((x) => ({
      ...x,
      logs: [...x.logs, entry],
      plans: x.plans.map((p) => (p.date === date ? { ...p, meals: p.meals.map((m) => (m.slot === slot ? { ...m, eaten: true } : m)) } : p)),
    }));
    if (date === todayISO()) nutrition.replanRemaining(date, `${r.name} eaten`);
  },

  /* -------------------------------- logging ------------------------------- */
  addLog(entry: Omit<FoodLogEntry, 'id' | 'loggedAt'>) {
    const e: FoodLogEntry = { ...entry, id: uid(), loggedAt: stamp() };
    setN((n) => ({ ...n, logs: [...n.logs, e] }));
    // What you just ate changes what is left, so the rest of the day moves.
    if (entry.date === todayISO()) nutrition.replanRemaining(entry.date, `${entry.name} logged`);
    return e;
  },
  addLogs(entries: Array<Omit<FoodLogEntry, 'id' | 'loggedAt'>>) {
    const made = entries.map((e) => ({ ...e, id: uid(), loggedAt: stamp() }));
    setN((n) => ({ ...n, logs: [...n.logs, ...made] }));
    const today = made.filter((e) => e.date === todayISO());
    if (today.length) {
      const label = today.length === 1 ? today[0].name : `${today.length} items`;
      nutrition.replanRemaining(today[0].date, `${label} logged`);
    }
    return made;
  },
  updateLog(id: ID, patch: Partial<FoodLogEntry>) {
    setN((n) => ({ ...n, logs: n.logs.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  },
  deleteLog(id: ID) {
    setN((n) => ({ ...n, logs: n.logs.filter((l) => l.id !== id) }));
  },

  /* --------------------------- water and activity ------------------------- */
  addWater(ml: number, date = todayISO()) {
    const w: WaterLogEntry = { id: uid(), date, ml, at: stamp() };
    setN((n) => ({ ...n, water: [...n.water, w] }), { history: false });
  },
  undoWater(date = todayISO()) {
    setN((n) => {
      const today = n.water.filter((w) => w.date === date);
      const last = today[today.length - 1];
      return last ? { ...n, water: n.water.filter((w) => w.id !== last.id) } : n;
    }, { history: false });
  },
  setWaterGoal(ml: number) {
    setN((n) => ({ ...n, waterGoalMl: Math.max(500, ml) }));
  },
  addExercise(e: Omit<ExerciseEntry, 'id' | 'at' | 'kcalBurned'> & { kcalBurned?: number }) {
    const n = state.nutrition;
    const kcal = e.kcalBurned ?? kcalBurned(e.kind, e.minutes, n.profile?.weightKg ?? 70);
    const entry: ExerciseEntry = { ...e, kcalBurned: kcal, id: uid(), at: stamp() };
    setN((x) => ({ ...x, exercise: [...x.exercise, entry] }));
    return entry;
  },
  deleteExercise(id: ID) {
    setN((n) => ({ ...n, exercise: n.exercise.filter((e) => e.id !== id) }));
  },
  addWeight(kg: number, date = todayISO()) {
    setN((n) => ({
      ...n,
      weights: [...n.weights.filter((w) => w.date !== date), { id: uid(), date, kg }],
      profile: n.profile ? { ...n.profile, weightKg: kg } : n.profile,
    }));
  },

  /* -------------------------------- pantry -------------------------------- */
  /** Reconciles a typed list of names against the existing items, so editing
      the text box never loses the quantities and expiries already recorded. */
  setPantry(names: string[]) {
    setN((n) => {
      const wanted = names.map((s) => s.trim()).filter(Boolean);
      const seen = new Set<string>();
      const out: PantryItem[] = [];
      for (const name of wanted) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const kept = n.pantry.find((p) => p.name.toLowerCase() === key);
        out.push(kept ?? { id: uid(), name, addedAt: stamp() });
      }
      return { ...n, pantry: out };
    });
  },
  addPantryItem(item: Omit<PantryItem, 'id' | 'addedAt'>) {
    setN((n) => {
      const key = item.name.trim().toLowerCase();
      if (!key) return n;
      const rest = n.pantry.filter((p) => p.name.toLowerCase() !== key);
      return { ...n, pantry: [{ ...item, name: item.name.trim(), id: uid(), addedAt: stamp() }, ...rest] };
    });
  },
  updatePantryItem(id: string, patch: Partial<Omit<PantryItem, 'id'>>) {
    setN((n) => ({ ...n, pantry: n.pantry.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  removePantryItem(id: string) {
    setN((n) => ({ ...n, pantry: n.pantry.filter((p) => p.id !== id) }));
  },

  /* ------------------------------- feedback ------------------------------- */
  rateMeal(recipeId: ID, verdict: FeedbackVerdict, reason?: FeedbackReason) {
    const f: MealFeedback = { id: uid(), recipeId, verdict, reason, at: stamp() };
    setN((n) => ({
      ...n,
      feedback: [...n.feedback, f],
      rejected: verdict === 'disliked' ? [recipeId, ...n.rejected.filter((r) => r !== recipeId)].slice(0, 40) : n.rejected,
    }));
  },

  /* -------------------------------- grocery ------------------------------- */
  generateGrocery(date = todayISO()) {
    const n = state.nutrition;
    const plan = n.plans.find((p) => p.date === date);
    if (!plan) return;
    const items: GroceryItem[] = [];
    for (const m of plan.meals) {
      const r = recipeById(m.recipeId, n.customRecipes);
      if (!r) continue;
      for (const ing of r.ingredients) {
        // Same name under a different word is the same shopping line.
        const existing = items.find((x) => sameIngredient(x.name, ing.name));
        if (existing) continue;
        // Already in the kitchen, so it does not belong on a shopping list.
        if (n.dataConsent.grocery && n.pantry.some((p) => sameIngredient(p.name, ing.name))) continue;
        items.push({
          id: uid(), name: ing.name, qty: ing.qty, group: ing.group, checked: false,
          estCost: ingredientCost(ing.name, ing.qty),
        });
      }
    }
    // Anything the user added by hand survives regeneration.
    setN((x) => ({ ...x, grocery: [...items, ...x.grocery.filter((g) => g.manual)] }));
  },
  addGroceryItem(item: Omit<GroceryItem, 'id' | 'checked'>) {
    setN((n) => ({ ...n, grocery: [...n.grocery, { ...item, id: uid(), checked: false, manual: true }] }));
  },
  updateGroceryItem(id: ID, patch: Partial<GroceryItem>) {
    setN((n) => ({ ...n, grocery: n.grocery.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  },
  deleteGroceryItem(id: ID) {
    setN((n) => ({ ...n, grocery: n.grocery.filter((g) => g.id !== id) }));
  },
  clearChecked() {
    setN((n) => ({ ...n, grocery: n.grocery.filter((g) => !g.checked) }));
  },

  /* --------------------------------- coach -------------------------------- */
  pushCoachTurn(t: Omit<CoachTurn, 'id' | 'at'>) {
    setN((n) => ({ ...n, coach: [...n.coach, { ...t, id: uid(), at: stamp() }].slice(-60) }), { history: false });
  },
  clearCoach() {
    setN((n) => ({ ...n, coach: [] }), { history: false });
  },

  /* ----------------------------- integrations ----------------------------- */
  toggleIntegration(id: string) {
    setN((n) => ({ ...n, integrations: n.integrations.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)) }));
  },
  /** Writes one day of clearly-marked simulated wearable data. */
  syncSimulatedWearable(date = todayISO()) {
    const n = state.nutrition;
    // Consent is enforced here, not just in the UI.
    if (!n.dataConsent.wearable) return 0;
    const w = n.profile?.weightKg ?? 70;
    const steps = 6000 + Math.floor(Math.random() * 5000);
    const minutes = Math.round(steps / 110);
    setN((x) => ({
      ...x,
      exercise: [
        ...x.exercise.filter((e) => !(e.date === date && e.simulated)),
        {
          id: uid(), date, kind: 'walking', label: `${steps.toLocaleString('en-IN')} steps (simulated)`,
          minutes, kcalBurned: kcalBurned('walking', minutes, w), simulated: true, at: stamp(),
        },
      ],
    }));
    return steps;
  },

  setPlanTier(plan: 'free' | 'premium') {
    setN((n) => ({ ...n, plan }));
  },

  /**
   * Counts one use of a metered free-tier allowance. Returns false when the
   * allowance is already spent, so the caller can stop rather than do the work
   * and then hide it — a limit that runs the engine anyway is theatre.
   */
  useAllowance(kind: 'rec' | 'swap'): boolean {
    const n = state.nutrition;
    const e = entitlements(n);
    if (e.tier === 'premium') return true;
    const left = kind === 'rec' ? e.recommendationsLeft : e.swapsLeft;
    if (left <= 0) return false;

    const today = todayISO();
    setN((x) => {
      // Only the last week of counters is worth keeping.
      const cutoff = toISODate(addDays(new Date(), -7));
      const kept = Object.fromEntries(Object.entries(x.usage ?? {}).filter(([d]) => d >= cutoff));
      const day = kept[today] ?? {};
      return {
        ...x,
        usage: {
          ...kept,
          [today]: kind === 'rec'
            ? { ...day, recommendations: (day.recommendations ?? 0) + 1 }
            : { ...day, swaps: (day.swaps ?? 0) + 1 },
        },
      };
    }, { history: false });
    return true;
  },

  /* -------------------------- saved meals & consent ------------------------ */
  toggleSaved(recipeId: string) {
    let nowSaved = false;
    setN((n) => {
      const has = n.saved.includes(recipeId);
      nowSaved = !has;
      return { ...n, saved: has ? n.saved.filter((r) => r !== recipeId) : [recipeId, ...n.saved].slice(0, 100) };
    });
    return nowSaved;
  },
  /** Puts a swapped-away recipe back in circulation. */
  unreject(recipeId: string) {
    setN((n) => ({ ...n, rejected: n.rejected.filter((r) => r !== recipeId) }));
  },
  setConsent(key: 'wearable' | 'grocery' | 'activity' | 'health', on: boolean) {
    setN((n) => ({
      ...n,
      dataConsent: { ...n.dataConsent, [key]: on },
      // Withdrawing consent must actually disconnect the thing, not just hide it.
      integrations: on ? n.integrations : n.integrations.map((i) => (String(i.kind) === key ? { ...i, connected: false } : i)),
    }));
  },
  /** Deletes every row of one kind. Used by the trust centre. */
  eraseData(kind: 'logs' | 'exercise' | 'weights' | 'coach' | 'feedback' | 'all') {
    setN((n) => {
      if (kind === 'all') return { ...n, logs: [], exercise: [], weights: [], coach: [], feedback: [], plans: [], grocery: [] };
      return { ...n, [kind]: [] } as typeof n;
    });
  },

  /* ------------------------------ custom data ----------------------------- */
  addCustomFood(f: Omit<FoodItem, 'id'>) {
    const item = { ...f, id: uid() } as FoodItem;
    setN((n) => ({ ...n, customFoods: [...n.customFoods, item] }));
    return item;
  },
};
