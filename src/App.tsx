import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Task } from './lib/types';
import { boot, useDB, isReady, actions, undo, redo, getBootProblem, dismissBootProblem } from './store/store';
import { NavCtx, VIEWS, type ViewId } from './store/nav';
import { flushDB, onSaveState, onOtherTab, watchTabs } from './lib/db';
import { AnimCtx, ToastHost, useMotion, useToast, Menu, Panel, ConfirmDialog } from './components/ui';
import { Icon } from './components/Icon';
import { Orb } from './components/Orb';
/* The nutrition path is the product, so it ships in the first chunk and is
   ready the moment the app opens. */
import { NutritionOnboarding } from './features/nutrition/Onboarding';
import { NutritionHome } from './features/nutrition/NutritionHome';

/* The rest of the nutrition path is one tap away, not one paint away. */
const EatNow = lazy(() => import('./features/nutrition/EatNow').then((m) => ({ default: m.EatNow })));
const LogFood = lazy(() => import('./features/nutrition/LogFood').then((m) => ({ default: m.LogFood })));
const Meals = lazy(() => import('./features/nutrition/Meals').then((m) => ({ default: m.Meals })));
const Grocery = lazy(() => import('./features/nutrition/Grocery').then((m) => ({ default: m.Grocery })));
const Coach = lazy(() => import('./features/nutrition/Coach').then((m) => ({ default: m.Coach })));
const NutritionProgress = lazy(() => import('./features/nutrition/NutritionProgress').then((m) => ({ default: m.NutritionProgress })));
const TrustPanel = lazy(() => import('./features/nutrition/NutritionSettings').then((m) => ({ default: m.TrustPanel })));

/* Everything else arrives when it is first opened. Most sessions never touch
   the planner or the analytics charts, and they should not pay for them. */
const Dashboard = lazy(() => import('./features/Dashboard').then((m) => ({ default: m.Dashboard })));
const Today = lazy(() => import('./features/Today').then((m) => ({ default: m.Today })));
const Week = lazy(() => import('./features/Week').then((m) => ({ default: m.Week })));
const CalendarView = lazy(() => import('./features/Calendar').then((m) => ({ default: m.CalendarView })));
const Deadlines = lazy(() => import('./features/Calendar').then((m) => ({ default: m.Deadlines })));
const Goals = lazy(() => import('./features/Goals').then((m) => ({ default: m.Goals })));
const Projects = lazy(() => import('./features/Projects').then((m) => ({ default: m.Projects })));
const Tasks = lazy(() => import('./features/Tasks').then((m) => ({ default: m.Tasks })));
const Habits = lazy(() => import('./features/Habits').then((m) => ({ default: m.Habits })));
const Notes = lazy(() => import('./features/Notes').then((m) => ({ default: m.Notes })));
const Applications = lazy(() => import('./features/Applications').then((m) => ({ default: m.Applications })));
const Analytics = lazy(() => import('./features/Analytics').then((m) => ({ default: m.Analytics })));
const Jarvis = lazy(() => import('./features/Jarvis').then((m) => ({ default: m.Jarvis })));
const ActionCenter = lazy(() => import('./features/mail/ActionCenter').then((m) => ({ default: m.ActionCenter })));
const Review = lazy(() => import('./features/Review').then((m) => ({ default: m.Review })));
const Archive = lazy(() => import('./features/Review').then((m) => ({ default: m.Archive })));
const SettingsView = lazy(() => import('./features/Settings').then((m) => ({ default: m.SettingsView })));
const ModuleView = lazy(() => import('./features/Modules').then((m) => ({ default: m.ModuleView })));
const FocusMode = lazy(() => import('./features/Focus').then((m) => ({ default: m.FocusMode })));
const CommandPalette = lazy(() => import('./features/Palette').then((m) => ({ default: m.CommandPalette })));
import { TaskEditor, QuickTaskModal } from './features/TaskEditor';
import { cn, daysUntil, todayISO, pluralise, download } from './lib/util';
import { goalHealth } from './engine/priority';
import { openTasks } from './engine/jarvis';

const darken = (hex: string, k: number) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k));
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
};

/* ============================================================
   Shell. Sidebar on wide screens, a bottom bar and a floating
   capture button on phones — the same data, laid out for the
   way each device is actually held.
   ============================================================ */

// The execution loop, in the order a phone user actually needs it.
const MOBILE_TABS: ViewId[] = ['nut_home', 'nut_meals', 'nut_log', 'nut_grocery', 'nut_progress'];

export default function App() {
  const db = useDB();
  const [ready, setReady] = useState(isReady());
  const [view, setView] = useState<ViewId>('nut_home');
  const [focusId, setFocusId] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [focusMode, setFocusMode] = useState<{ taskId?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved');

  const [otherTab, setOtherTab] = useState(false);

  useEffect(() => {
    boot().then(() => setReady(true));
    watchTabs();
    const offSave = onSaveState(setSaveState);
    const offTab = onOtherTab(setOtherTab);
    return () => {
      offSave();
      offTab();
    };
  }, []);

  /* ------------------------- offline coverage -------------------------------
     This used to pull every lazy chunk from the page on each visit so that
     unvisited views worked offline. Measured, that cost about 300 kB and 29
     extra requests per session and made the code splitting decorative. The
     service worker now precaches the whole chunk graph at install time — once
     per deployment — which gives the same offline coverage for none of the
     repeated cost, so there is deliberately nothing to do here. */

  /* ------------------------------ theme ------------------------------ */
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      const theme = db.settings.theme === 'system' ? sys : db.settings.theme;
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-anim', db.settings.animation);
      // The same hue needs more depth on a light ground to hold contrast.
      const accent = theme === 'light' ? darken(db.settings.accent, 0.74) : db.settings.accent;
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-soft', `${accent}${theme === 'light' ? '1f' : '22'}`);
      root.style.setProperty('--accent-ink', theme === 'light' ? '#ffffff' : '#12161c');
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', theme === 'light' ? '#f6f5f3' : '#0a0c0f');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [db.settings.theme, db.settings.accent, db.settings.animation]);

  /* --------------------------- persistence --------------------------- */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushDB();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  /* --------------------------- notifications ------------------------- */
  useEffect(() => {
    if (!ready) return;
    const n = db.settings.notifications;
    if (!n.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const fire = (title: string, body: string, key: string) => {
      const seen = sessionStorage.getItem(`mango-notif-${key}`);
      if (seen) return;
      try {
        new Notification(title, { body, tag: key });
        sessionStorage.setItem(`mango-notif-${key}`, '1');
      } catch {
        /* blocked */
      }
    };

    const today = todayISO();
    const open = openTasks(db);
    const overdue = open.filter((t) => t.due && t.due < today);
    if (n.overdue && overdue.length) fire('Overdue work', `${pluralise(overdue.length, 'task')} is past its deadline.`, `overdue-${today}-${overdue.length}`);
    const soon = open.filter((t) => (daysUntil(t.due) ?? 99) <= 1 && (daysUntil(t.due) ?? -1) >= 0);
    if (n.deadlines && soon.length) fire('Deadline approaching', `${pluralise(soon.length, 'task')} due within a day.`, `soon-${today}-${soon.length}`);
    if (n.atRiskGoals) {
      const risky = db.goals.filter((g) => !g.archived && goalHealth(db, g).risk === 'at_risk');
      if (risky.length) fire('A goal is slipping', `${risky[0].name} is behind its own pace.`, `risk-${today}-${risky.length}`);
    }
    if (n.dailyBriefing && new Date().getHours() >= n.briefingHour) {
      fire('Daily briefing', `${open.filter((t) => t.scheduledFor === today).length} tasks planned for today.`, `brief-${today}`);
    }
  }, [ready, db]);

  /* ------------------------------ nav api ---------------------------- */
  const go = useCallback((v: ViewId, id?: string) => {
    setView(v);
    setFocusId(id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navApi = useMemo(
    () => ({
      view,
      focusId,
      go,
      openPalette: () => setPaletteOpen(true),
      openTask: (t: Task) => setEditing(t),
      startFocus: (taskId?: string) => setFocusMode({ taskId }),
      openQuickAdd: () => setQuickOpen(true),
    }),
    [view, focusId, go],
  );

  /* --------------------------- keyboard ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        if (typing) return;
        e.preventDefault();
        redo();
        return;
      }
      if (typing || mod) return;

      const map: Record<string, ViewId> = { d: 'dashboard', t: 'today', w: 'week', g: 'goals', p: 'projects', a: 'analytics', j: 'jarvis', c: 'calendar', m: 'actions' };
      if (map[e.key.toLowerCase()]) {
        go(map[e.key.toLowerCase()]);
      } else if (e.key === 'n') {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key === 'f') {
        setFocusMode({});
      } else if (e.key === '?') {
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go]);

  if (!ready) {
    return (
      <div className="grid h-full place-items-center" style={{ background: 'var(--ground)' }}>
        <div className="flex flex-col items-center gap-4">
          <Orb size={72} />
          <div className="label">Loading your workspace</div>
        </div>
      </div>
    );
  }

  const moduleId = typeof view === 'string' && view.startsWith('module:') ? view.slice(7) : null;

  return (
    <AnimCtx.Provider value={db.settings.animation}>
      <ToastHost>
        <NavCtx.Provider value={navApi}>
          <div className="relative min-h-full">
            <div className="ambient" />

            <div className="relative flex min-h-full">
              {/* ------------------------- sidebar ------------------------ */}
              <Sidebar db={db} view={view} go={go} open={sidebarOpen} onClose={() => setSidebarOpen(false)} saveState={saveState} />

              {/* -------------------------- main -------------------------- */}
              <main className="flex-1 min-w-0">
                <TopBar db={db} onMenu={() => setSidebarOpen(true)} onPalette={() => setPaletteOpen(true)} />
                <BootProblemBanner />
                {otherTab && <OtherTabBanner />}
                <DemoBanner db={db} />

                <div
                  className={cn(
                    'mx-auto w-full px-4 sm:px-6 lg:px-8 pb-28 lg:pb-12',
                    db.settings.density === 'compact' ? 'max-w-[80rem]' : 'max-w-[86rem]',
                  )}
                >
                  <ViewSwitch view={view} moduleId={moduleId} db={db} focusId={focusId} />
                </div>
              </main>
            </div>

            {/* ---------------------- mobile bottom bar ------------------- */}
            <nav
              className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t lg:hidden safe-b"
              style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', backdropFilter: 'blur(12px)', borderColor: 'var(--hairline)' }}
              aria-label="Primary"
            >
              {MOBILE_TABS.map((id) => {
                const v = VIEWS.find((x) => x.id === id)!;
                const on = view === id;
                return (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className="flex flex-1 flex-col items-center gap-1 py-2.5"
                    style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }}
                    aria-current={on ? 'page' : undefined}
                  >
                    <Icon name={v.icon} size={19} strokeWidth={on ? 2.2 : 1.75} />
                    <span className="text-[10px] font-semibold">{v.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </nav>

            {/* --------------------- what should I eat now ---------------- */}
            {/* The one action worth a thumb-reachable button. Hidden on its own
                screen, where it would only point at itself. */}
            {view !== 'nut_now' && (
            <button
              onClick={() => go('nut_now')}
              className="fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full lg:hidden"
              style={{
                bottom: 'calc(4.9rem + env(safe-area-inset-bottom, 0px))',
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                boxShadow: 'var(--shadow-2)',
              }}
              aria-label="What should I eat now?"
              title="What should I eat now?"
            >
              <Icon name="Zap" size={22} strokeWidth={2.3} />
            </button>
            )}

            {/* --------------------------- overlays ---------------------- */}
            <Suspense fallback={null}>
              {paletteOpen && <CommandPalette db={db} open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
            </Suspense>
            <QuickTaskModal db={db} open={quickOpen} onClose={() => setQuickOpen(false)} />
            <TaskEditor db={db} task={editing} open={!!editing} onClose={() => setEditing(null)} />
            <AnimatePresence>
              {focusMode && (
                <Suspense fallback={null}>
                  <FocusMode db={db} taskId={focusMode.taskId} onExit={() => setFocusMode(null)} />
                </Suspense>
              )}
            </AnimatePresence>
          </div>
        </NavCtx.Provider>
      </ToastHost>
    </AnimCtx.Provider>
  );
}

/** Shown for the instant a lazily-loaded view is still arriving. */
function ViewLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Orb size={40} />
        <span className="label">Loading</span>
      </div>
    </div>
  );
}

function ViewSwitch({ view, moduleId, db, focusId }: { view: ViewId; moduleId: string | null; db: ReturnType<typeof useDB>; focusId?: string }) {
  const { rise, fade } = useMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={String(view) + (focusId ?? '')} initial={rise.initial} animate={rise.animate} exit={rise.exit} transition={fade}>
        <Suspense fallback={<ViewLoading />}>
        {moduleId ? (
          <ModuleView db={db} moduleId={moduleId} />
        ) : view === 'dashboard' ? (
          <Dashboard db={db} />
        ) : view === 'today' ? (
          <Today db={db} />
        ) : view === 'week' ? (
          <Week db={db} />
        ) : view === 'calendar' ? (
          <CalendarView db={db} />
        ) : view === 'deadlines' ? (
          <Deadlines db={db} />
        ) : view === 'goals' ? (
          <Goals db={db} focusId={focusId} />
        ) : view === 'projects' ? (
          <Projects db={db} focusId={focusId} />
        ) : view === 'tasks' ? (
          <Tasks db={db} />
        ) : view === 'habits' ? (
          <Habits db={db} />
        ) : view === 'notes' ? (
          <Notes db={db} focusId={focusId} />
        ) : view === 'applications' ? (
          <Applications db={db} focusId={focusId} />
        ) : view === 'analytics' ? (
          <Analytics db={db} />
        ) : view === 'actions' ? (
          <ActionCenter db={db} />
        ) : view === 'jarvis' ? (
          <Jarvis db={db} />
        ) : view === 'review' ? (
          <Review db={db} />
        ) : view === 'archive' ? (
          <Archive db={db} />
        ) : view === 'settings' ? (
          <SettingsView db={db} focusId={focusId} />
        ) : String(view).startsWith('nut_') ? (
          !db.nutrition.profile ? (
            <NutritionOnboarding onDone={() => { /* state change re-renders into the module */ }} />
          ) : view === 'nut_home' ? (
            <NutritionHome db={db} />
          ) : view === 'nut_now' ? (
            <EatNow db={db} />
          ) : view === 'nut_log' ? (
            <LogFood db={db} />
          ) : view === 'nut_meals' ? (
            <Meals db={db} />
          ) : view === 'nut_grocery' ? (
            <Grocery db={db} />
          ) : view === 'nut_coach' ? (
            <Coach db={db} />
          ) : view === 'nut_trust' ? (
            <div className="flex flex-col gap-5">
              <header>
                <div className="label mb-2">What Mango knows, and what you can switch off</div>
                <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Your data</h1>
              </header>
              <TrustPanel db={db} />
            </div>
          ) : (
            <NutritionProgress db={db} />
          )
        ) : (
          <Dashboard db={db} />
        )}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function Sidebar({
  db,
  view,
  go,
  open,
  onClose,
  saveState,
}: {
  db: ReturnType<typeof useDB>;
  view: ViewId;
  go: (v: ViewId, id?: string) => void;
  open: boolean;
  onClose: () => void;
  saveState: 'saving' | 'saved' | 'error';
}) {
  const groups = ['Nutrition', 'Assistant', 'Planner', 'Review'];
  const modules = db.modules.filter((m) => !m.archived);

  const content = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="flex items-center gap-2.5 px-2 py-3">
        <Orb size={30} />
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold tracking-tight leading-none">Mango</div>
          <div className="label mt-1">nutrition coach</div>
        </div>
        <button className="btn btn-ghost !px-1.5 ml-auto lg:hidden" onClick={onClose} aria-label="Close menu">
          <Icon name="X" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="label px-2 py-1.5">{g}</div>
            {VIEWS.filter((v) => v.group === g).map((v) => {
              const on = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => go(v.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] text-left transition-colors"
                  style={on ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 } : { color: 'var(--ink-2)' }}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon name={v.icon} size={15} />
                  <span className="truncate">{v.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        {modules.length > 0 && (
          <div className="mb-3">
            <div className="label px-2 py-1.5">Your modules</div>
            {modules.map((m) => {
              const on = view === `module:${m.id}`;
              return (
                <button
                  key={m.id}
                  onClick={() => go(`module:${m.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] text-left"
                  style={on ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 } : { color: 'var(--ink-2)' }}
                >
                  <Icon name={m.icon} size={15} style={{ color: on ? undefined : m.color }} />
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-2 py-2 text-[10.5px] text-[var(--ink-3)] flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: saveState === 'error' ? 'var(--critical)' : saveState === 'saving' ? 'var(--warning)' : 'var(--good)' }}
        />
        {saveState === 'error' ? 'Could not save' : saveState === 'saving' ? 'Saving…' : 'Saved on this device'}
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[15rem] shrink-0 border-r lg:block" style={{ borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--surface) 55%, transparent)' }}>
        {content}
      </aside>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className="relative h-full w-[16rem] safe-t"
              style={{ background: 'var(--surface)', borderRight: '1px solid var(--hairline)' }}
            >
              {content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================================================
   Another tab is open on the same workspace.

   Writes replace the whole document, so two tabs will overwrite
   each other. Rather than pretend that is fine, say it.
   ============================================================ */

function OtherTabBanner() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 sm:px-6 lg:px-8 py-2"
      style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--ground))', borderColor: 'var(--hairline)' }}
      role="status"
    >
      <span className="chip shrink-0" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
        <Icon name="Copy" size={12} />
        Open in another tab
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
        Mango is open in more than one tab. Each one saves the whole workspace, so whichever you use last will overwrite
        the other. Close the spare tab before making changes you want to keep.
      </span>
    </div>
  );
}

/* ============================================================
   Saved workspace could not be opened.

   The alternative — quietly starting fresh — looks identical to
   having lost everything, which is exactly what it would be. So
   the app says what happened and offers the original bytes for
   download before anything overwrites them.
   ============================================================ */

function BootProblemBanner() {
  const toast = useToast();
  const problem = getBootProblem();
  if (!problem || problem.kind === 'loaded' || problem.kind === 'empty') return null;

  const raw = 'raw' in problem ? problem.raw : undefined;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 sm:px-6 lg:px-8 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--critical) 14%, var(--ground))', borderColor: 'var(--hairline)' }}
      role="alert"
    >
      <span className="chip shrink-0" style={{ borderColor: 'var(--critical)', color: 'var(--critical)' }}>
        <Icon name="AlertTriangle" size={12} />
        Could not open your data
      </span>
      <span className="min-w-0 flex-1 basis-[16rem] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
        {problem.kind === 'newer'
          ? `This workspace was saved by a newer version of Mango (schema ${problem.version}). Opening it here could drop whatever that version added, so it has been left untouched and this session started empty.`
          : `${problem.detail} Your saved data has been left exactly as it is rather than overwritten, and this session started empty.`}
      </span>
      <span className="flex min-w-0 flex-wrap gap-2">
        {raw && (
          <button
            className="btn !py-1 !text-[12px]"
            onClick={() => {
              download(`mango-unreadable-${new Date().toISOString().slice(0, 10)}.json`, raw);
              toast({ text: 'Downloaded — keep this file before doing anything else', tone: 'info' });
            }}
          >
            <Icon name="Download" size={13} />
            Download it
          </button>
        )}
        <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => dismissBootProblem()}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

/* ============================================================
   Demo banner. Everything on screen is sample data until the
   user says otherwise, and an audience should never have to
   guess which is which.
   ============================================================ */

function DemoBanner({ db }: { db: ReturnType<typeof useDB> }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  if (!db.demo) return null;
  return (
    <>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 sm:px-6 lg:px-8 py-2"
        style={{ background: 'color-mix(in srgb, var(--warning) 14%, var(--ground))', borderColor: 'var(--hairline)' }}
        role="status"
      >
        <span className="chip shrink-0" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          <Icon name="Info" size={12} />
          Demo data
        </span>
        <span className="min-w-0 flex-1 basis-[14rem] text-[12.5px] text-[var(--ink-2)]">
          Everything here is sample data, so the product can be shown end to end. None of it is yours.
        </span>
        <span className="flex min-w-0 flex-wrap gap-2">
          <button className="btn !py-1 !text-[12px]" onClick={() => setConfirm(true)}>
            Clear it
          </button>
          <button
            className="btn btn-ghost !py-1 !text-[12px]"
            onClick={() => {
              actions.adoptDemoData();
              toast({ text: 'Keeping the sample records — the banner is gone', tone: 'info' });
            }}
          >
            Keep it
          </button>
        </span>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Clear the demo data?"
        body="This removes every seeded task, goal, project, note and the whole sample nutrition history, and leaves you an empty workspace. Anything you added yourself is kept."
        confirmLabel="Clear it"
        onConfirm={() => {
          actions.startClean();
          toast({ text: 'Demo data cleared', tone: 'good' });
          setConfirm(false);
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

function TopBar({ db, onMenu, onPalette }: { db: ReturnType<typeof useDB>; onMenu: () => void; onPalette: () => void }) {
  const unread = db.notifications.filter((n) => !n.read).length;
  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-2 sm:gap-3 border-b px-3 sm:px-6 lg:px-8 py-2.5 safe-t"
      style={{ background: 'color-mix(in srgb, var(--ground) 88%, transparent)', backdropFilter: 'blur(12px)', borderColor: 'var(--hairline)' }}
    >
      <button className="btn btn-ghost !px-1.5 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Icon name="PanelLeft" size={18} />
      </button>

      <button
        onClick={onPalette}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-1.5 text-left max-w-[28rem]"
        style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
      >
        <Icon name="Search" size={14} className="text-[var(--ink-3)]" />
        <span className="flex-1 truncate text-[12.5px] text-[var(--ink-3)]">Search or add anything</span>
        <span className="chip hidden sm:inline-flex !py-0 !text-[10px]">⌘K</span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5 ml-auto">
        <button className="btn btn-ghost !px-1.5" onClick={() => undo()} aria-label="Undo" title="Undo (⌘Z)">
          <Icon name="Undo2" size={16} />
        </button>
        <Menu
          trigger={<Icon name="Bell" size={16} />}
          items={
            db.notifications.length
              ? [
                  ...db.notifications.slice(0, 8).map((n) => ({ label: n.title, icon: 'Info', run: () => {} })),
                  'separator' as const,
                  { label: 'Clear all', icon: 'Trash2', run: () => actions.clearNotifications() },
                ]
              : [{ label: 'Nothing to report', icon: 'BellOff', run: () => {} }]
          }
        />
      </div>
    </div>
  );
}

// build B marker
