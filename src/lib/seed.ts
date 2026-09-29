import type { DB, PriorityLevel, PipelineStage, Area, Settings, WidgetConfig, WidgetType } from './types';
import { uid, now, todayISO, toISODate, addDays } from './util';
import { emptyNutrition, seedNutritionDemo } from './nutrition-seed';
import { emptyMail } from './mail-types';

export const DEMO_TAG = '__demo';

export const defaultPriorities = (): PriorityLevel[] => [
  { id: 'p_critical', name: 'Critical', rank: 0, color: '#f2555a', glyph: '🔥', builtIn: true },
  { id: 'p_high', name: 'High', rank: 1, color: '#dfa62f', glyph: '⚡', builtIn: true },
  { id: 'p_medium', name: 'Medium', rank: 2, color: '#6c9bf0', glyph: '○', builtIn: true },
  { id: 'p_low', name: 'Low', rank: 3, color: '#3ec08c', glyph: '·', builtIn: true },
  { id: 'p_someday', name: 'Someday', rank: 4, color: '#616a78', glyph: '◦', builtIn: true },
];

export const defaultStages = (): PipelineStage[] => [
  { id: 's_research', name: 'Research', color: '#616a78', order: 0 },
  { id: 's_toapply', name: 'To Apply', color: '#6c9bf0', order: 1 },
  { id: 's_applied', name: 'Applied', color: '#5784d7', order: 2 },
  { id: 's_short', name: 'Shortlisted', color: '#a75ddd', order: 3 },
  { id: 's_assess', name: 'Assessment', color: '#08999e', order: 4 },
  { id: 's_interview', name: 'Interview', color: '#dfa62f', order: 5 },
  { id: 's_final', name: 'Final Round', color: '#ff8a3d', order: 6 },
  { id: 's_offer', name: 'Offer', color: '#3ec08c', order: 7, terminal: true },
  { id: 's_rejected', name: 'Rejected', color: '#f2555a', order: 8, terminal: true },
  { id: 's_withdrawn', name: 'Withdrawn', color: '#616a78', order: 9, terminal: true },
];

export const defaultAreas = (): Area[] =>
  [
    ['Career', 'Briefcase', '#d06200'],
    ['Academics', 'GraduationCap', '#5784d7'],
    ['Finance', 'Wallet', '#029f6d'],
    ['Personal', 'Heart', '#a75ddd'],
    ['Health', 'Activity', '#3ec08c'],
    ['Learning', 'BookOpen', '#08999e'],
    ['Projects', 'Boxes', '#ad7c04'],
    ['Relationships', 'Users', '#f2555a'],
    ['Administration', 'FileText', '#616a78'],
    ['Travel', 'Plane', '#6c9bf0'],
    ['Shopping', 'ShoppingBag', '#dfa62f'],
    ['Other', 'Circle', '#98a1ae'],
  ].map(([name, icon, color], i) => ({
    id: `a_${String(name).toLowerCase()}`,
    name: String(name),
    icon: String(icon),
    color: String(color),
    order: i,
  }));

/** Nutrition sits at the top: it is the product this dashboard reports on. */
export const NUTRITION_WIDGETS: WidgetType[] = ['nut_meal', 'nut_macros', 'nut_consistency', 'nut_grocery', 'nut_activity'];

export const defaultWidgets = (): WidgetConfig[] => [
  { id: uid(), type: 'nut_meal', visible: true, order: 0, span: 2 },
  { id: uid(), type: 'nut_macros', visible: true, order: 1, span: 1 },
  { id: uid(), type: 'nut_consistency', visible: true, order: 2, span: 1 },
  { id: uid(), type: 'jarvis', visible: true, order: 3, span: 2 },
  { id: uid(), type: 'today', visible: true, order: 4, span: 1 },
  { id: uid(), type: 'deadlines', visible: true, order: 5, span: 1 },
  { id: uid(), type: 'goals', visible: true, order: 6, span: 1 },
  { id: uid(), type: 'atrisk', visible: true, order: 7, span: 1 },
  { id: uid(), type: 'nut_grocery', visible: false, order: 8, span: 1 },
  { id: uid(), type: 'nut_activity', visible: false, order: 9, span: 1 },
  { id: uid(), type: 'snapshot', visible: true, order: 10, span: 1 },
  { id: uid(), type: 'insights', visible: true, order: 11, span: 1 },
  { id: uid(), type: 'projects', visible: true, order: 12, span: 1 },
  { id: uid(), type: 'habits', visible: true, order: 13, span: 1 },
  { id: uid(), type: 'applications', visible: false, order: 14, span: 1 },
];

export const defaultSettings = (): Settings => ({
  userName: '',
  theme: 'dark',
  accent: '#ff8a3d',
  animation: 'full',
  density: 'comfortable',
  firstDayOfWeek: 1,
  dateFormat: 'dmy',
  time24h: true,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  widgets: defaultWidgets(),
  notifications: {
    enabled: false,
    deadlines: true,
    overdue: true,
    atRiskGoals: true,
    dailyBriefing: true,
    briefingHour: 8,
    weeklyReview: true,
  },
  aiEndpoint: '',
  aiModel: '',
  aiKey: '',
  seeded: false,
  onboarded: false,
});

export const emptyDB = (): DB => ({
  version: 1,
  demo: false,
  areas: defaultAreas(),
  objectives: [],
  goals: [],
  projects: [],
  milestones: [],
  tasks: [],
  habits: [],
  habitEntries: [],
  notes: [],
  noteFolders: [],
  applications: [],
  stages: defaultStages(),
  priorities: defaultPriorities(),
  reviews: [],
  periods: [],
  modules: [],
  moduleRecords: [],
  focusSessions: [],
  notifications: [],
  nutrition: emptyNutrition(),
  mail: emptyMail(),
  settings: defaultSettings(),
});

/* ------------------------------------------------------------------
   Demo data. Every record carries the DEMO_TAG so "Remove demo data"
   deletes exactly this and nothing the user has made.
   ------------------------------------------------------------------ */

const d = (n: number) => toISODate(addDays(new Date(), n));

export function seedDemo(db: DB): DB {
  // Everything below is tagged, so stripDemo can take it all back out again.
  const t = now();
  const objectives = [
    { id: uid(), name: 'Summer Placements', areaId: 'a_career', order: 0 },
    { id: uid(), name: 'MBA Term 1', areaId: 'a_academics', order: 1 },
    { id: uid(), name: 'Ship the shop', areaId: 'a_projects', order: 2 },
  ];

  const goals = [
    {
      id: uid(),
      name: 'Consulting placement preparation',
      description: 'Case interviews, guesstimates and a personal-interview story I can defend cold.',
      areaId: 'a_career',
      objectiveId: objectives[0].id,
      priorityId: 'p_critical',
      importance: 5,
      deadline: d(42),
      status: 'active' as const,
      progressMode: 'auto' as const,
      manualProgress: 0,
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid(),
      name: 'Finish Term 1 with a 3.4+',
      description: 'Statistics and financial accounting are the two that need real hours.',
      areaId: 'a_academics',
      objectiveId: objectives[1].id,
      priorityId: 'p_high',
      importance: 4,
      deadline: d(70),
      status: 'active' as const,
      progressMode: 'auto' as const,
      manualProgress: 0,
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid(),
      name: 'Take the online shop live',
      description: 'Product photography, pricing and a checkout that works on a phone.',
      areaId: 'a_projects',
      objectiveId: objectives[2].id,
      priorityId: 'p_high',
      importance: 4,
      deadline: d(90),
      status: 'at_risk' as const,
      progressMode: 'auto' as const,
      manualProgress: 0,
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid(),
      name: 'Read 12 books this year',
      areaId: 'a_learning',
      priorityId: 'p_low',
      importance: 2,
      status: 'active' as const,
      progressMode: 'manual' as const,
      manualProgress: 58,
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
  ];

  const projects = [
    {
      id: uid(),
      name: 'Case interview practice',
      description: 'Structured practice log — one case a day with a partner.',
      areaId: 'a_career',
      goalId: goals[0].id,
      priorityId: 'p_critical',
      status: 'active' as const,
      deadline: d(35),
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid(),
      name: 'Statistics assignment 2',
      areaId: 'a_academics',
      goalId: goals[1].id,
      priorityId: 'p_high',
      status: 'active' as const,
      deadline: d(2),
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid(),
      name: 'Storefront build',
      areaId: 'a_projects',
      goalId: goals[2].id,
      priorityId: 'p_medium',
      status: 'active' as const,
      deadline: d(60),
      tags: [DEMO_TAG],
      createdAt: t,
      updatedAt: t,
    },
  ];

  const milestones = [
    { id: uid(), name: '25 cases completed', projectId: projects[0].id, due: d(21), done: false, order: 0 },
    { id: uid(), name: '50 cases completed', projectId: projects[0].id, due: d(40), done: false, order: 1 },
    { id: uid(), name: 'Question set solved', projectId: projects[1].id, due: d(1), done: false, order: 0 },
    { id: uid(), name: 'Checkout working end to end', projectId: projects[2].id, due: d(30), done: false, order: 0 },
  ];

  type T = DB['tasks'][number];
  const mk = (
    title: string,
    o: Partial<T> = {},
  ): T => ({
    id: uid(),
    title,
    priorityId: 'p_medium',
    importance: 3,
    impact: 3,
    strategic: 3,
    effortMins: 30,
    status: 'todo',
    kanban: 'planned',
    tags: [DEMO_TAG],
    dependsOn: [],
    manualBoost: 0,
    order: 0,
    createdAt: t,
    updatedAt: t,
    ...o,
  });

  const tasks: T[] = [
    mk('Complete market-sizing case with partner', {
      areaId: 'a_career', goalId: goals[0].id, projectId: projects[0].id, milestoneId: milestones[0].id,
      priorityId: 'p_critical', importance: 5, impact: 5, strategic: 5, effortMins: 45,
      due: todayISO(), scheduledFor: todayISO(), kanban: 'inprogress', status: 'doing',
    }),
    mk('Write out my personal-interview story', {
      areaId: 'a_career', goalId: goals[0].id, projectId: projects[0].id,
      priorityId: 'p_high', importance: 5, impact: 4, strategic: 5, effortMins: 60,
      due: d(3), scheduledFor: todayISO(),
    }),
    mk('Solve Question 1 — test of independence', {
      areaId: 'a_academics', goalId: goals[1].id, projectId: projects[1].id, milestoneId: milestones[2].id,
      priorityId: 'p_high', importance: 4, impact: 3, strategic: 4, effortMins: 50,
      due: d(1), scheduledFor: todayISO(), kanban: 'inprogress',
    }),
    mk('Solve Question 2 — chi-square worked example', {
      areaId: 'a_academics', goalId: goals[1].id, projectId: projects[1].id, milestoneId: milestones[2].id,
      priorityId: 'p_high', importance: 4, impact: 3, strategic: 4, effortMins: 40, due: d(1),
    }),
    mk('Submit summer application — deadline set', {
      areaId: 'a_career', goalId: goals[0].id,
      priorityId: 'p_critical', importance: 5, impact: 5, strategic: 5, effortMins: 25,
      due: d(-1), scheduledFor: todayISO(),
    }),
    mk('Shortlist 20 firms to apply to', {
      areaId: 'a_career', goalId: goals[0].id,
      priorityId: 'p_medium', importance: 3, impact: 4, strategic: 4, effortMins: 90, due: d(6),
    }),
    mk('Photograph the six new SKUs', {
      areaId: 'a_projects', goalId: goals[2].id, projectId: projects[2].id,
      priorityId: 'p_medium', importance: 3, impact: 4, strategic: 3, effortMins: 120, due: d(9),
      kanban: 'backlog',
    }),
    mk('Fix mobile checkout layout', {
      areaId: 'a_projects', goalId: goals[2].id, projectId: projects[2].id, milestoneId: milestones[3].id,
      priorityId: 'p_high', importance: 4, impact: 5, strategic: 3, effortMins: 75, due: d(4),
      kanban: 'blocked', status: 'blocked',
    }),
    mk('Reconcile last month’s expenses', {
      areaId: 'a_finance', priorityId: 'p_medium', importance: 3, impact: 2, strategic: 2, effortMins: 45,
      due: d(5), recurrence: { freq: 'monthly', interval: 1, monthDay: 5 },
    }),
    mk('Weekly review', {
      areaId: 'a_personal', priorityId: 'p_medium', importance: 4, impact: 3, strategic: 3, effortMins: 30,
      due: d(3), recurrence: { freq: 'weekly', interval: 1, weekdays: [0] },
    }),
    mk('Book train tickets home', {
      areaId: 'a_travel', priorityId: 'p_low', importance: 2, impact: 2, strategic: 1, effortMins: 15, due: d(12),
    }),
    mk('Read two chapters', {
      areaId: 'a_learning', goalId: goals[3].id, priorityId: 'p_someday', importance: 2, impact: 1,
      strategic: 1, effortMins: 40, scheduledFor: todayISO(),
    }),
    mk('Draft the case-practice schedule', {
      areaId: 'a_career', goalId: goals[0].id, projectId: projects[0].id,
      priorityId: 'p_medium', importance: 3, impact: 3, strategic: 4, effortMins: 20,
      status: 'done', kanban: 'done', completedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    }),
    mk('Find a case partner', {
      areaId: 'a_career', goalId: goals[0].id, projectId: projects[0].id,
      priorityId: 'p_high', importance: 4, impact: 4, strategic: 4, effortMins: 20,
      status: 'done', kanban: 'done', completedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    }),
    mk('Set up the accounting notes folder', {
      areaId: 'a_academics', priorityId: 'p_low', importance: 2, impact: 2, strategic: 2, effortMins: 15,
      status: 'done', kanban: 'done', completedAt: new Date(Date.now() - 86400000).toISOString(),
    }),
  ];

  const habits = [
    { id: uid(), name: 'One case, out loud', icon: 'Mic', color: '#d06200', cadence: 'daily' as const, target: 1, areaId: 'a_career', createdAt: t },
    { id: uid(), name: 'Gym', icon: 'Dumbbell', color: '#3ec08c', cadence: 'weekly' as const, target: 4, areaId: 'a_health', createdAt: t },
    { id: uid(), name: 'Read 20 pages', icon: 'BookOpen', color: '#08999e', cadence: 'daily' as const, target: 1, areaId: 'a_learning', createdAt: t },
  ];

  const habitEntries: DB['habitEntries'] = [];
  for (let i = 0; i < 30; i++) {
    const date = d(-i);
    if (i % 4 !== 3) habitEntries.push({ id: uid(), habitId: habits[0].id, date, count: 1 });
    if (i % 2 === 0) habitEntries.push({ id: uid(), habitId: habits[1].id, date, count: 1 });
    if (i % 3 !== 2) habitEntries.push({ id: uid(), habitId: habits[2].id, date, count: 1 });
  }

  const applications = [
    { id: uid(), org: 'Northline Advisory', role: 'Summer Associate', kind: 'Internship', location: 'Gurugram', deadline: d(4), stageId: 's_toapply', priorityId: 'p_critical', source: 'Campus process', nextAction: 'Finish the application essay', nextActionDate: d(2), notes: '', tags: [DEMO_TAG], createdAt: t, updatedAt: t },
    { id: uid(), org: 'Vector Partners', role: 'Strategy Intern', kind: 'Internship', location: 'Bengaluru', deadline: d(11), stageId: 's_applied', priorityId: 'p_high', source: 'Referral', contact: 'A. Menon', appliedOn: d(-6), nextAction: 'Follow up in a week', nextActionDate: d(3), notes: '', tags: [DEMO_TAG], createdAt: t, updatedAt: t },
    { id: uid(), org: 'Harbour Capital', role: 'IB Summer Analyst', kind: 'Internship', location: 'Mumbai', deadline: d(-2), stageId: 's_interview', priorityId: 'p_high', source: 'Campus process', appliedOn: d(-20), nextAction: 'Technical round prep', nextActionDate: d(1), notes: 'Three-statement model likely.', tags: [DEMO_TAG], createdAt: t, updatedAt: t },
    { id: uid(), org: 'Meridian Consulting', role: 'Business Analyst', kind: 'Internship', location: 'Delhi', stageId: 's_research', priorityId: 'p_medium', source: 'LinkedIn', notes: '', tags: [DEMO_TAG], createdAt: t, updatedAt: t },
    { id: uid(), org: 'Orchid Foundation', role: 'Merit Scholarship', kind: 'Scholarship', deadline: d(25), stageId: 's_research', priorityId: 'p_low', source: 'Notice board', notes: '', tags: [DEMO_TAG], createdAt: t, updatedAt: t },
  ];

  const notes = [
    { id: uid(), title: 'Case structures that keep working', body: 'Profitability: revenue vs cost, then decompose each.\nMarket entry: market attractiveness, capability to win, economics, risks.\nGuesstimate: always state assumptions out loud before computing.', tags: [DEMO_TAG, 'cases'], pinned: true, links: [{ kind: 'goal' as const, id: goals[0].id }], createdAt: t, updatedAt: t },
    { id: uid(), title: 'Statistics — test of independence', body: 'Chi-square compares observed counts against what you would expect if two variables were unrelated.\nExpected = (row total × column total) / grand total.\nDegrees of freedom = (rows − 1)(columns − 1).', tags: [DEMO_TAG, 'stats'], pinned: false, links: [{ kind: 'goal' as const, id: goals[1].id }], createdAt: t, updatedAt: t },
  ];

  const modules = [
    {
      id: 'm_reading',
      name: 'Reading list',
      icon: 'BookMarked',
      color: '#08999e',
      createdAt: t,
      fields: [
        { id: 'f_title', name: 'Title', type: 'text' as const, primary: true },
        { id: 'f_author', name: 'Author', type: 'text' as const, primary: true },
        { id: 'f_status', name: 'Status', type: 'select' as const, options: ['To read', 'Reading', 'Finished', 'Abandoned'], primary: true },
        { id: 'f_started', name: 'Started', type: 'date' as const },
        { id: 'f_rating', name: 'Rating', type: 'number' as const },
        { id: 'f_notes', name: 'Notes', type: 'longtext' as const },
      ],
    },
  ];

  const moduleRecords: DB['moduleRecords'] = [
    { id: uid(), moduleId: 'm_reading', values: { f_title: 'Thinking in Systems', f_author: 'Donella Meadows', f_status: 'Reading', f_started: d(-14), f_rating: 5, f_notes: '' }, createdAt: t, updatedAt: t },
    { id: uid(), moduleId: 'm_reading', values: { f_title: 'The Hard Thing About Hard Things', f_author: 'Ben Horowitz', f_status: 'Finished', f_rating: 4, f_notes: '', f_started: d(-40) }, createdAt: t, updatedAt: t },
    { id: uid(), moduleId: 'm_reading', values: { f_title: 'Poor Charlie’s Almanack', f_author: 'Charles Munger', f_status: 'To read', f_notes: '', f_started: '', f_rating: 0 }, createdAt: t, updatedAt: t },
  ];

  const periods = [
    { id: uid(), name: 'Placement season', start: todayISO(), end: d(60), weights: { a_career: 1.6, a_academics: 1.1, a_shopping: 0.6, a_travel: 0.6 }, active: true },
  ];

  return {
    ...db,
    objectives: [...db.objectives, ...objectives],
    goals: [...db.goals, ...goals],
    projects: [...db.projects, ...projects],
    milestones: [...db.milestones, ...milestones],
    tasks: [...db.tasks, ...tasks],
    habits: [...db.habits, ...habits],
    habitEntries: [...db.habitEntries, ...habitEntries],
    applications: [...db.applications, ...applications],
    notes: [...db.notes, ...notes],
    modules: [...db.modules, ...modules],
    moduleRecords: [...db.moduleRecords, ...moduleRecords],
    periods: [...db.periods, ...periods],
    nutrition: seedNutritionDemo(db.nutrition),
    settings: { ...db.settings, seeded: true },
    demo: true,
  };
}

/** Removes exactly what seedDemo added, by tag / known id. */
export function stripDemo(db: DB): DB {
  const has = (tags?: string[]) => !!tags?.includes(DEMO_TAG);
  const goalIds = new Set(db.goals.filter((g) => has(g.tags)).map((g) => g.id));
  const projIds = new Set(db.projects.filter((p) => has(p.tags)).map((p) => p.id));
  const demoHabitIds = new Set(
    db.habits.filter((h) => ['One case, out loud', 'Gym', 'Read 20 pages'].includes(h.name)).map((h) => h.id),
  );
  return {
    ...db,
    goals: db.goals.filter((g) => !has(g.tags)),
    projects: db.projects.filter((p) => !has(p.tags)),
    milestones: db.milestones.filter((m) => !(m.projectId && projIds.has(m.projectId)) && !(m.goalId && goalIds.has(m.goalId))),
    tasks: db.tasks.filter((t) => !has(t.tags)),
    applications: db.applications.filter((a) => !has(a.tags)),
    notes: db.notes.filter((n) => !has(n.tags)),
    habits: db.habits.filter((h) => !demoHabitIds.has(h.id)),
    habitEntries: db.habitEntries.filter((e) => !demoHabitIds.has(e.habitId)),
    modules: db.modules.filter((m) => m.id !== 'm_reading'),
    moduleRecords: db.moduleRecords.filter((r) => r.moduleId !== 'm_reading'),
    objectives: db.objectives.filter((o) => !['Summer Placements', 'MBA Term 1', 'Ship the shop'].includes(o.name)),
    periods: db.periods.filter((p) => p.name !== 'Placement season'),
    nutrition: emptyNutrition(),
    settings: { ...db.settings, seeded: false },
    demo: false,
  };
}
