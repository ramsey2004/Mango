/* ============================================================
   Mango — domain model
   Every user-facing taxonomy (areas, priorities, statuses, stages,
   modules) is DATA, not code. Nothing about one person's life is
   hard-coded into these types.
   ============================================================ */

export type ID = string;
export type ISODate = string; // yyyy-mm-dd
export type ISOStamp = string; // full ISO timestamp

export interface PriorityLevel {
  id: ID;
  name: string;
  /** 0 = most important. Lower sorts first. */
  rank: number;
  color: string;
  glyph: string;
  builtIn?: boolean;
}

export interface Area {
  id: ID;
  name: string;
  icon: string;
  color: string;
  order: number;
  description?: string;
  archived?: boolean;
}

export interface Objective {
  id: ID;
  name: string;
  areaId?: ID;
  description?: string;
  order: number;
  archived?: boolean;
}

export type GoalStatus =
  | 'not_started'
  | 'planning'
  | 'active'
  | 'at_risk'
  | 'blocked'
  | 'completed'
  | 'paused'
  | 'archived';

export interface Goal {
  id: ID;
  name: string;
  description?: string;
  areaId?: ID;
  objectiveId?: ID;
  priorityId: ID;
  /** 1–5, the user's own sense of how much this matters. */
  importance: number;
  deadline?: ISODate;
  status: GoalStatus;
  progressMode: 'auto' | 'manual';
  manualProgress: number; // 0–100, used when progressMode === 'manual'
  tags: string[];
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export type ProjectStatus = 'planning' | 'active' | 'blocked' | 'completed' | 'archived';

export interface Project {
  id: ID;
  name: string;
  description?: string;
  areaId?: ID;
  goalId?: ID;
  priorityId: ID;
  status: ProjectStatus;
  deadline?: ISODate;
  tags: string[];
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export interface Milestone {
  id: ID;
  name: string;
  projectId?: ID;
  goalId?: ID;
  due?: ISODate;
  done: boolean;
  order: number;
}

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export type KanbanColumn = 'backlog' | 'planned' | 'inprogress' | 'blocked' | 'done';

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** every N periods */
  interval: number;
  /** 0 = Sunday … 6 = Saturday, for weekly */
  weekdays?: number[];
  /** day of month for monthly/yearly */
  monthDay?: number;
  month?: number; // 0–11 for yearly
  endsOn?: ISODate;
}

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  areaId?: ID;
  goalId?: ID;
  projectId?: ID;
  milestoneId?: ID;
  /** set when this task is a subtask of another */
  parentId?: ID;

  priorityId: ID;
  importance: number; // 1–5
  impact: number; // 1–5
  strategic: number; // 1–5 — relevance to a live goal
  effortMins: number;

  due?: ISODate;
  start?: ISODate;
  /** the day the user planned to work on it (may differ from due) */
  scheduledFor?: ISODate;

  status: TaskStatus;
  kanban: KanbanColumn;
  completedAt?: ISOStamp;

  tags: string[];
  dependsOn: ID[];
  recurrence?: Recurrence;
  /** user's thumb on the scale: added to the computed score */
  manualBoost: number;
  /** when set, the engine's score is ignored entirely */
  pinnedRank?: number;

  order: number;
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export interface Habit {
  id: ID;
  name: string;
  icon: string;
  color: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  /** how many completions make a period a success */
  target: number;
  areaId?: ID;
  createdAt: ISOStamp;
  archived?: boolean;
}

export interface HabitEntry {
  id: ID;
  habitId: ID;
  date: ISODate;
  count: number;
}

export type LinkTarget =
  | { kind: 'task'; id: ID }
  | { kind: 'goal'; id: ID }
  | { kind: 'project'; id: ID }
  | { kind: 'area'; id: ID }
  | { kind: 'application'; id: ID };

export interface NoteFolder {
  id: ID;
  name: string;
  order: number;
}

export interface Note {
  id: ID;
  title: string;
  body: string;
  folderId?: ID;
  tags: string[];
  pinned: boolean;
  links: LinkTarget[];
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export interface PipelineStage {
  id: ID;
  name: string;
  /** terminal stages don't count as "in play" */
  terminal?: boolean;
  color: string;
  order: number;
}

export interface Application {
  id: ID;
  org: string;
  role: string;
  kind: string; // Internship / Job / Scholarship / Competition / … user-editable
  location?: string;
  deadline?: ISODate;
  stageId: ID;
  priorityId: ID;
  source?: string;
  contact?: string;
  nextAction?: string;
  nextActionDate?: ISODate;
  appliedOn?: ISODate;
  notes?: string;
  tags: string[];
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export interface ReviewEntry {
  id: ID;
  kind: 'daily' | 'weekly' | 'monthly';
  periodKey: string; // 2026-09-08 | 2026-W37 | 2026-09
  answers: Record<string, string>;
  stats: Record<string, number>;
  createdAt: ISOStamp;
}

/** A temporary re-weighting of life: "Placement Season", "Exam Week". */
export interface ContextPeriod {
  id: ID;
  name: string;
  start: ISODate;
  end: ISODate;
  /** areaId -> multiplier (0.5 damps, 2 amplifies) */
  weights: Record<ID, number>;
  active: boolean;
}

export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'select' | 'checkbox' | 'url';

export interface ModuleField {
  id: ID;
  name: string;
  type: FieldType;
  options?: string[];
  /** shown in the compact table view */
  primary?: boolean;
}

export interface CustomModule {
  id: ID;
  name: string;
  icon: string;
  color: string;
  fields: ModuleField[];
  createdAt: ISOStamp;
  archived?: boolean;
}

export interface ModuleRecord {
  id: ID;
  moduleId: ID;
  values: Record<ID, string | number | boolean>;
  createdAt: ISOStamp;
  updatedAt: ISOStamp;
  archived?: boolean;
}

export interface FocusSession {
  id: ID;
  taskId?: ID;
  startedAt: ISOStamp;
  endedAt?: ISOStamp;
  /** minutes actually focused */
  minutes: number;
  mode: string;
}

export type WidgetType =
  | 'jarvis'
  | 'today'
  | 'goals'
  | 'deadlines'
  | 'atrisk'
  | 'projects'
  | 'habits'
  | 'snapshot'
  | 'insights'
  | 'applications'
  | 'mail_brief'
  /* nutrition */
  | 'nut_meal'
  | 'nut_macros'
  | 'nut_consistency'
  | 'nut_grocery'
  | 'nut_activity';

export interface WidgetConfig {
  id: ID;
  type: WidgetType;
  visible: boolean;
  order: number;
  span: 1 | 2;
}

export interface NotificationPrefs {
  enabled: boolean;
  deadlines: boolean;
  overdue: boolean;
  atRiskGoals: boolean;
  dailyBriefing: boolean;
  briefingHour: number;
  weeklyReview: boolean;
}

export interface Settings {
  userName: string;
  theme: 'dark' | 'light' | 'system';
  accent: string;
  animation: 'off' | 'subtle' | 'full';
  density: 'comfortable' | 'compact';
  firstDayOfWeek: 0 | 1;
  dateFormat: 'dmy' | 'mdy' | 'iso';
  time24h: boolean;
  pomodoroWork: number;
  pomodoroBreak: number;
  widgets: WidgetConfig[];
  notifications: NotificationPrefs;
  /** Optional, user-supplied. Empty means the assistant runs on local rules only. */
  aiEndpoint: string;
  aiModel: string;
  aiKey: string;
  seeded: boolean;
  onboarded: boolean;
}

export interface AppNotification {
  id: ID;
  title: string;
  body: string;
  tone: 'info' | 'good' | 'warning' | 'critical';
  createdAt: ISOStamp;
  read: boolean;
  /** deep link */
  go?: { view: string; id?: ID };
}

import type { NutritionState } from './nutrition-types';
import type { MailState } from './mail-types';

export interface DB {
  version: number;
  areas: Area[];
  objectives: Objective[];
  goals: Goal[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  notes: Note[];
  noteFolders: NoteFolder[];
  applications: Application[];
  stages: PipelineStage[];
  priorities: PriorityLevel[];
  reviews: ReviewEntry[];
  periods: ContextPeriod[];
  modules: CustomModule[];
  moduleRecords: ModuleRecord[];
  focusSessions: FocusSession[];
  notifications: AppNotification[];
  nutrition: NutritionState;
  /** Email-derived actions. Empty and inert until a mailbox is connected. */
  mail: MailState;
  settings: Settings;
  /**
   * True while the workspace still holds seeded demo records. Drives the
   * banner, so nobody in an audience mistakes sample data for real data.
   */
  demo: boolean;
}
