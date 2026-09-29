import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { DB, Task, WidgetConfig } from '../lib/types';
import { actions, nutrition } from '../store/store';
import { useNav } from '../store/nav';
import { briefing, buckets, insights, recommend } from '../engine/jarvis';
import { goalHealth, projectProgress } from '../engine/priority';
import { Panel, SectionHeader, Bar, Chip, Empty, Ring, useMotion, useToast, Menu } from '../components/ui';
import { Icon } from '../components/Icon';
import { Orb } from '../components/Orb';
import { StatTile } from '../components/Charts';
import { TaskRow } from './TaskRow';
import { cn, relativeDay, formatMins, pluralise, daysUntil, todayISO } from '../lib/util';
import { planFor, remainingOn, consumedOn, consistency, currentSlot, SLOT_LABEL, allowedExercise, targets} from '../engine/nutritionSelectors';
import { targetsFor } from '../engine/calories';
import { recipeById } from '../lib/recipe-db';
import { brief as mailBrief } from '../engine/mail/actionCenter';
import { PRIORITY } from './mail/ActionCard';

/* ============================================================
   The command centre. Reads top-down: who you are and what the
   day looks like, then the single recommendation panel, then the
   supporting evidence. Widgets are user-configurable.
   ============================================================ */

export function Dashboard({ db }: { db: DB }) {
  const nav = useNav();
  const b = useMemo(() => briefing(db), [db]);
  const { rise, spring } = useMotion();
  const visible = [...db.settings.widgets].filter((w) => w.visible).sort((a, b2) => a.order - b2.order);

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------- greeting --------------------------- */}
      <header className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="label mb-2">{b.dateLine}</div>
          <h1 className="display text-[clamp(30px,5.2vw,46px)] leading-[1.05]">
            {b.greeting}
            {db.settings.userName ? `, ${db.settings.userName}` : ''}
          </h1>
          <p className="mt-2 text-[14px] text-[var(--ink-2)] max-w-[52ch]">{b.headline}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => nav.go('jarvis')}>
            <Icon name="Sparkles" size={14} />
            Ask the assistant
          </button>
          <button className="btn btn-primary" onClick={() => nav.startFocus()}>
            <Icon name="Focus" size={14} />
            Focus
          </button>
        </div>
      </header>

      {/* ------------------------- the widget grid ----------------------- */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        {visible.map((w, i) => (
          <motion.div
            key={w.id}
            {...rise}
            transition={{ ...spring, delay: Math.min(i * 0.03, 0.2) }}
            className={cn('min-w-0', w.span === 2 && 'xl:col-span-2')}
          >
            <Widget config={w} db={db} />
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center pb-2">
        <button className="btn btn-ghost !text-[12px] text-[var(--ink-3)]" onClick={() => nav.go('settings', 'widgets')}>
          <Icon name="Grid3x3" size={13} />
          Configure this dashboard
        </button>
      </div>
    </div>
  );
}

function Widget({ config, db }: { config: WidgetConfig; db: DB }) {
  const nav = useNav();
  const toast = useToast();

  const hide = () => {
    actions.setWidgets(db.settings.widgets.map((w) => (w.id === config.id ? { ...w, visible: false } : w)));
    toast({
      text: 'Widget hidden',
      tone: 'info',
      action: {
        label: 'Undo',
        run: () => actions.setWidgets(db.settings.widgets.map((w) => (w.id === config.id ? { ...w, visible: true } : w))),
      },
    });
  };

  const shell = (opts: { title: string; label?: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) => (
    <Panel className="h-full p-4 sm:p-5 flex flex-col">
      <SectionHeader
        label={opts.label}
        title={
          <span className="flex items-center gap-2">
            <Icon name={opts.icon} size={15} className="text-[var(--ink-3)]" />
            {opts.title}
          </span>
        }
        right={
          <div className="flex items-center gap-1">
            {opts.action}
            <Menu
              trigger={<Icon name="MoreHorizontal" size={15} />}
              items={[{ label: 'Hide this widget', icon: 'EyeOff', run: hide }]}
            />
          </div>
        }
      />
      <div className="mt-3.5 flex-1 min-h-0">{opts.children}</div>
    </Panel>
  );

  switch (config.type) {
    case 'mail_brief': {
      const br = mailBrief(db);
      if (!db.mail.account) {
        return shell({
          title: 'Email actions',
          icon: 'Mail',
          label: 'Action centre',
          children: (
            <Empty
              icon="Mail"
              title="No mailbox connected"
              body="Connect Gmail and the things people are actually waiting on you for show up here."
              action={<button className="btn" onClick={() => nav.go('actions')}>Set it up</button>}
            />
          ),
        });
      }
      return shell({
        title: 'Email actions',
        icon: 'Mail',
        label: br.quiet ? 'All clear' : `${br.counts.urgent + br.counts.important} need you`,
        action: <button className="btn btn-ghost !text-[12px]" onClick={() => nav.go('actions')}>Open</button>,
        children: br.quiet ? (
          <Empty icon="CheckCircle2" title="Nothing needs you" body="No deadlines today and nobody is waiting." />
        ) : (
          <div className="flex h-full flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {br.counts.overdue > 0 && <Chip color={PRIORITY.P0.color} glyph="!">{br.counts.overdue} overdue</Chip>}
              {br.counts.urgent > 0 && <Chip color={PRIORITY.P0.color} glyph={PRIORITY.P0.glyph}>{br.counts.urgent} urgent</Chip>}
              {br.counts.important > 0 && <Chip color={PRIORITY.P1.color} glyph={PRIORITY.P1.glyph}>{br.counts.important} important</Chip>}
              {br.counts.waiting > 0 && <Chip glyph="◷">{br.counts.waiting} waiting</Chip>}
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {br.top.slice(0, 4).map((i) => (
                <li key={i.id} className="flex items-start gap-2">
                  <span aria-hidden style={{ color: PRIORITY[i.priority].color }}>{PRIORITY[i.priority].glyph}</span>
                  <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => nav.go('actions')}>
                    {i.title}
                  </button>
                  {i.deadline && <span className="shrink-0 text-[11.5px] text-[var(--ink-3)]">{relativeDay(i.deadline)}</span>}
                </li>
              ))}
            </ul>
            {br.waiting.length > 0 && (
              <div className="mt-auto border-t pt-2 text-[12px] text-[var(--ink-3)]" style={{ borderColor: 'var(--hairline)' }}>
                Chase: {br.waiting.map((w) => w.item.waitingOn?.person ?? 'someone').join(', ')}
              </div>
            )}
          </div>
        ),
      });
    }

    case 'jarvis':
      return <JarvisWidget db={db} onHide={hide} />;

    case 'today': {
      const b = buckets(db);
      const list = b.today.slice(0, 6);
      return shell({
        title: 'Today',
        label: `${b.today.length} scheduled · ${b.overdue.length} overdue`,
        icon: 'Zap',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('today')}>
            Open
          </button>
        ),
        children: list.length ? (
          <div className="-mx-2.5">
            {list.map((s) => (
              <TaskRow key={s.task.id} task={s.task} db={db} compact onOpen={nav.openTask} />
            ))}
          </div>
        ) : (
          <Empty icon="CheckCircle2" title="Nothing due today" body="A clear day. Pull something forward from this week." />
        ),
      });
    }

    case 'goals': {
      const goals = db.goals.filter((g) => !g.archived && !['completed', 'archived'].includes(g.status)).slice(0, 6);
      return shell({
        title: 'Active goals',
        label: `${goals.length} in play`,
        icon: 'Target',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('goals')}>
            Open
          </button>
        ),
        children: goals.length ? (
          <div className="flex flex-col gap-3">
            {goals.map((g) => {
              const h = goalHealth(db, g);
              const area = db.areas.find((a) => a.id === g.areaId);
              return (
                <button key={g.id} className="text-left group" onClick={() => nav.go('goals', g.id)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] truncate group-hover:text-[var(--accent)] transition-colors">{g.name}</span>
                    <span className="num text-[12px] text-[var(--ink-2)]">{h.progress}%</span>
                  </div>
                  <Bar value={h.progress} color={area?.color ?? 'var(--accent)'} className="mt-1.5" label={g.name} />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty icon="Target" title="No active goals" body="Goals give tasks their weight in the priority engine." />
        ),
      });
    }

    case 'deadlines': {
      const open = db.tasks.filter((t) => !t.archived && t.status !== 'done' && t.due);
      const soon = open
        .filter((t) => {
          const n = daysUntil(t.due);
          return n !== null && n <= 14;
        })
        .sort((a, b2) => (a.due ?? '').localeCompare(b2.due ?? ''))
        .slice(0, 7);
      return shell({
        title: 'Upcoming deadlines',
        label: `Next 14 days`,
        icon: 'AlarmClock',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('deadlines')}>
            Open
          </button>
        ),
        children: soon.length ? (
          <ul className="flex flex-col">
            {soon.map((t) => {
              const n = daysUntil(t.due) ?? 0;
              const tone = n < 0 ? 'var(--critical)' : n <= 1 ? 'var(--warning)' : 'var(--ink-2)';
              return (
                <li key={t.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left"
                    onClick={() => nav.openTask(t)}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: tone }} />
                    <span className="flex-1 truncate text-[13px]">{t.title}</span>
                    <span className="num text-[11.5px] shrink-0" style={{ color: tone }}>
                      {relativeDay(t.due)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon="CalendarDays" title="No deadlines in the next fortnight" />
        ),
      });
    }

    case 'atrisk': {
      const risky = db.goals
        .filter((g) => !g.archived && !['completed', 'archived'].includes(g.status))
        .map((g) => ({ g, h: goalHealth(db, g) }))
        .filter((x) => x.h.risk === 'at_risk' || x.h.risk === 'watch');
      return shell({
        title: 'At risk',
        label: risky.length ? `${pluralise(risky.length, 'goal')} needs attention` : 'Everything on pace',
        icon: 'AlertTriangle',
        children: risky.length ? (
          <div className="flex flex-col gap-2.5">
            {risky.slice(0, 5).map(({ g, h }) => (
              <button
                key={g.id}
                onClick={() => nav.go('goals', g.id)}
                className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left"
              >
                <span
                  className="mt-[3px] h-4 w-[3px] rounded-full shrink-0"
                  style={{ background: h.risk === 'at_risk' ? 'var(--critical)' : 'var(--warning)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] truncate">{g.name}</span>
                  <span className="block text-[11.5px] text-[var(--ink-3)]">
                    {h.progress}% done
                    {h.drift !== null && ` · ${Math.abs(h.drift)} pts behind pace`}
                    {h.lastMovedDays !== null && ` · last moved ${h.lastMovedDays}d ago`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon="CheckCircle2" title="Nothing is drifting" body="Every goal is at or ahead of its own pace." />
        ),
      });
    }

    case 'projects': {
      const projects = db.projects.filter((p) => !p.archived && p.status === 'active').slice(0, 5);
      return shell({
        title: 'Projects',
        label: `${projects.length} active`,
        icon: 'Layers',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('projects')}>
            Open
          </button>
        ),
        children: projects.length ? (
          <div className="flex flex-col gap-3">
            {projects.map((p) => {
              const pr = projectProgress(db, p.id);
              return (
                <button key={p.id} className="text-left group" onClick={() => nav.go('projects', p.id)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] truncate group-hover:text-[var(--accent)] transition-colors">{p.name}</span>
                    <span className="num text-[11.5px] text-[var(--ink-3)]">
                      {pr.done}/{pr.total}
                    </span>
                  </div>
                  <Bar value={pr.progress} color="var(--cat-4)" className="mt-1.5" label={p.name} />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty icon="Layers" title="No active projects" />
        ),
      });
    }

    case 'habits': {
      const today = todayISO();
      const habits = db.habits.filter((h) => !h.archived);
      return shell({
        title: 'Habits',
        label: 'Today',
        icon: 'Repeat',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('habits')}>
            Open
          </button>
        ),
        children: habits.length ? (
          <div className="flex flex-col gap-1">
            {habits.slice(0, 6).map((h) => {
              const done = db.habitEntries.some((e) => e.habitId === h.id && e.date === today);
              return (
                <button
                  key={h.id}
                  onClick={() => actions.toggleHabitDay(h.id, today)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left"
                >
                  <span
                    className="grid h-[18px] w-[18px] place-items-center rounded-[6px] shrink-0"
                    style={{ border: `1.5px solid ${done ? h.color : 'var(--hairline-strong)'}`, background: done ? h.color : 'transparent' }}
                  >
                    {done && <Icon name="Check" size={12} strokeWidth={3} style={{ color: 'var(--ground)' }} />}
                  </span>
                  <span className={cn('flex-1 text-[13px]', done && 'text-[var(--ink-3)]')}>{h.name}</span>
                  <Icon name={h.icon} size={14} className="text-[var(--ink-3)]" />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty icon="Repeat" title="No habits yet" />
        ),
      });
    }

    case 'snapshot': {
      const open = db.tasks.filter((t) => !t.archived && t.status !== 'done' && !t.parentId);
      const today = todayISO();
      const doneToday = db.tasks.filter((t) => t.completedAt?.slice(0, 10) === today).length;
      const planned = open.filter((t) => t.scheduledFor === today);
      const mins = planned.reduce((s, t) => s + (t.effortMins || 0), 0);
      const overdue = open.filter((t) => t.due && t.due < today).length;
      const rate = doneToday + planned.length > 0 ? Math.round((doneToday / (doneToday + planned.length)) * 100) : 0;
      return shell({
        title: 'Snapshot',
        label: 'Today at a glance',
        icon: 'Gauge',
        children: (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <StatTile label="Done today" value={doneToday} />
            <StatTile label="Remaining" value={planned.length} sub={formatMins(mins)} />
            <StatTile label="Overdue" value={overdue} tone={overdue ? 'critical' : undefined} />
            <div>
              <div className="label mb-1.5">Completion</div>
              <Ring value={rate} size={40}>
                {rate}
              </Ring>
            </div>
          </div>
        ),
      });
    }

    case 'insights': {
      const list = insights(db);
      const tone = (t: string) =>
        t === 'critical' ? 'var(--critical)' : t === 'warning' ? 'var(--warning)' : t === 'good' ? 'var(--good)' : 'var(--info)';
      return shell({
        title: 'Insights',
        label: 'Read from your own records',
        icon: 'Sparkles',
        children: (
          <ul className="flex flex-col gap-2.5">
            {list.map((i) => (
              <li key={i.id}>
                <button
                  className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 row-hover text-left"
                  onClick={() => i.go && nav.go(i.go.view, i.go.id)}
                >
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full shrink-0" style={{ background: tone(i.tone) }} />
                  <span className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">{i.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ),
      });
    }

    case 'applications': {
      const live = db.applications.filter((a) => !a.archived && !db.stages.find((s) => s.id === a.stageId)?.terminal);
      return shell({
        title: 'Applications',
        label: `${live.length} in play`,
        icon: 'Building2',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('applications')}>
            Open
          </button>
        ),
        children: live.length ? (
          <ul className="flex flex-col">
            {live.slice(0, 6).map((a) => {
              const st = db.stages.find((s) => s.id === a.stageId);
              return (
                <li key={a.id}>
                  <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 -mx-2 row-hover text-left" onClick={() => nav.go('applications', a.id)}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-[13px]">{a.org}</span>
                      <span className="block truncate text-[11.5px] text-[var(--ink-3)]">{a.role}</span>
                    </span>
                    {st && (
                      <Chip color={st.color} className="shrink-0">
                        {st.name}
                      </Chip>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon="Building2" title="Nothing in the pipeline" />
        ),
      });
    }

    /* ----------------------------- nutrition ---------------------------- */

    case 'nut_meal': {
      const n = db.nutrition;
      if (!n.profile) return shell({ title: "Today's meal", icon: 'Flame', children: <NutritionUnset /> });
      const plan = planFor(n);
      const slot = currentSlot();
      const next = plan?.meals.find((m) => m.slot === slot && !m.eaten) ?? plan?.meals.find((m) => !m.eaten);
      const r = next ? recipeById(next.recipeId, n.customRecipes) : undefined;
      const left = remainingOn(n);
      return shell({
        title: "What to eat next",
        label: r ? `${SLOT_LABEL[next!.slot]} · ${left.kcal} kcal and ${left.protein} g protein left today` : 'Nothing planned yet',
        icon: 'Flame',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_home')}>
            Open
          </button>
        ),
        children: r ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-0 flex-1 basis-[14rem]">
              <div className="text-[19px] font-bold leading-snug">
                <span aria-hidden className="mr-1.5">{r.emoji}</span>
                {r.name}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 num text-[12.5px] text-[var(--ink-3)]">
                <span><span className="text-[var(--ink)]">{r.kcal}</span> kcal</span>
                <span><span className="text-[var(--ink)]">{r.protein}</span> g protein</span>
                <span>{formatMins(r.prepMins)}</span>
                <span>₹{r.costRupees}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                className="btn btn-primary"
                onClick={() => {
                  nutrition.eatPlannedMeal(todayISO(), next!.slot);
                  toast({ text: `${r.name} logged`, tone: 'good' });
                }}
              >
                <Icon name="Check" size={14} />
                I ate this
              </button>
              <button className="btn" onClick={() => nav.go('nut_home')}>
                Swap
              </button>
            </div>
          </div>
        ) : (
          <Empty
            icon="Flame"
            title="No plan for today yet"
            body="Build one and it will show up here."
            action={<button className="btn btn-primary" onClick={() => { nutrition.regeneratePlan(); toast({ text: 'Plan built', tone: 'good' }); }}>Build my plan</button>}
          />
        ),
      });
    }

    case 'nut_macros': {
      const n = db.nutrition;
      if (!n.profile) return shell({ title: 'Calories and macros', icon: 'Gauge', children: <NutritionUnset /> });
      const t = targets(n)!;
      const c = consumedOn(n);
      const left = remainingOn(n);
      const rows: Array<[string, number, number, string]> = [
        // Same macro, same colour as the nutrition home screen.
        ['Protein', c.protein, t.protein, 'var(--cat-3)'],
        ['Carbohydrate', c.carbs, t.carbs, 'var(--cat-2)'],
        ['Fat', c.fat, t.fat, 'var(--cat-5)'],
      ];
      return shell({
        title: 'Calories and macros',
        label: `Target ${t.kcal} kcal`,
        icon: 'Gauge',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_log')}>
            Log
          </button>
        ),
        children: (
          <div className="flex flex-wrap items-center gap-5">
            <Ring value={Math.min(100, (c.kcal / Math.max(1, t.kcal)) * 100)} size={92} stroke={7} color="var(--accent)">
              <span className="flex flex-col items-center">
                <span className="num text-[18px] font-semibold leading-none">{Math.max(0, left.kcal)}</span>
                <span className="label mt-1 !text-[9px]">left</span>
              </span>
            </Ring>
            <div className="min-w-0 flex-1 basis-[11rem] grid gap-2.5">
              {rows.map(([label, got, target, colour]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px]">{label}</span>
                    <span className="num text-[11.5px] text-[var(--ink-3)]">{Math.round(got)} / {target} g</span>
                  </div>
                  <Bar value={(got / Math.max(1, target)) * 100} color={colour} height={6} className="mt-1" label={label} />
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }

    case 'nut_consistency': {
      const n = db.nutrition;
      if (!n.profile) return shell({ title: 'Consistency', icon: 'Activity', children: <NutritionUnset /> });
      const c = consistency(n);
      return shell({
        title: 'Consistency',
        label: 'Last seven days',
        icon: 'Activity',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_progress')}>
            Open
          </button>
        ),
        children: (
          <div className="flex flex-wrap items-center gap-4">
            <Ring value={c.score} size={84} stroke={6} color={c.score >= 70 ? 'var(--good)' : c.score >= 40 ? 'var(--warning)' : 'var(--critical)'}>
              <span className="flex flex-col items-center">
                <span className="num text-[18px] font-semibold leading-none">{c.score}</span>
                <span className="label mt-1 !text-[9px]">/ 100</span>
              </span>
            </Ring>
            <p className="min-w-0 flex-1 basis-[11rem] text-[12.5px] leading-relaxed text-[var(--ink-2)]">{c.message}</p>
          </div>
        ),
      });
    }

    case 'nut_grocery': {
      const n = db.nutrition;
      const open = n.grocery.filter((g) => !g.checked);
      const cost = open.reduce((sum, g) => sum + g.estCost, 0);
      return shell({
        title: 'Grocery',
        label: open.length ? `${open.length} ${pluralise(open.length, 'item')} · about ₹${cost}` : 'Nothing to buy',
        icon: 'ShoppingBag',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_grocery')}>
            Open
          </button>
        ),
        children: open.length ? (
          <ul className="flex flex-col">
            {open.slice(0, 6).map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">{g.name}</span>
                <span className="num shrink-0 text-[11.5px] text-[var(--ink-3)]">{g.qty}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="ShoppingBag" title="Nothing on the list" body="Build a plan and the missing ingredients land here." />
        ),
      });
    }

    case 'nut_activity': {
      const n = db.nutrition;
      const today = todayISO();
      const rows = allowedExercise(n).filter((e) => e.date === today);
      const burned = rows.reduce((sum, e) => sum + e.kcalBurned, 0);
      return shell({
        title: 'Activity',
        label: rows.length ? `${burned} kcal burned today` : 'Nothing logged today',
        icon: 'Dumbbell',
        action: (
          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => nav.go('nut_home')}>
            Open
          </button>
        ),
        children: rows.length ? (
          <ul className="flex flex-col">
            {rows.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.label}</span>
                <span className="num shrink-0 text-[11.5px] text-[var(--ink-3)]">{e.minutes}m</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="Dumbbell" title="No activity today" body="Log a session, or connect the simulated wearable in Settings." />
        ),
      });
    }

    default:
      return null;
  }
}

/** Shown in a nutrition widget before the user has set the module up. */
function NutritionUnset() {
  const nav = useNav();
  return (
    <Empty
      icon="Heart"
      title="Nutrition is not set up yet"
      body="The short setup works out your calorie and macro targets."
      action={<button className="btn btn-primary" onClick={() => nav.go('nut_home')}>Set it up</button>}
    />
  );
}

/* --------------------------- the headline panel --------------------------- */

function JarvisWidget({ db, onHide }: { db: DB; onHide: () => void }) {
  const nav = useNav();
  const toast = useToast();
  const recs = useMemo(() => recommend(db, 3), [db]);
  const { rise, spring } = useMotion();
  const [expanded, setExpanded] = useState<string | null>(recs[0]?.scored.task.id ?? null);

  return (
    <Panel className="relative overflow-hidden p-4 sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, var(--accent-soft), transparent 68%)' }}
        aria-hidden
      />
      <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-center gap-4 sm:flex-col sm:items-center sm:gap-3 sm:shrink-0">
          <Orb state={recs.length ? 'idle' : 'celebrate'} size={82} />
          <div className="sm:text-center">
            <div className="label">What matters</div>
            <div className="text-[12px] text-[var(--ink-3)] mt-0.5">most right now</div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight">The assistant recommends</h2>
              <p className="text-[12.5px] text-[var(--ink-3)] mt-0.5">
                Ranked from your deadlines, goals and effort estimates — not from the order you added things.
              </p>
            </div>
            <Menu trigger={<Icon name="MoreHorizontal" size={15} />} items={[{ label: 'Hide this widget', icon: 'EyeOff', run: onHide }]} />
          </div>

          {recs.length === 0 ? (
            <Empty
              icon="CheckCircle2"
              title="Nothing is waiting on you"
              body="Every open task is either blocked or complete. This is the moment to plan the next stretch."
              action={
                <button className="btn" onClick={() => nav.go('goals')}>
                  Review goals
                </button>
              }
            />
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {recs.map((r, i) => {
                const t = r.scored.task;
                const open = expanded === t.id;
                return (
                  <motion.li key={t.id} {...rise} transition={{ ...spring, delay: i * 0.04 }}>
                    <div
                      className="rounded-xl transition-colors"
                      style={{
                        background: open ? 'var(--sunken)' : 'transparent',
                        border: `1px solid ${open ? 'var(--hairline)' : 'transparent'}`,
                      }}
                    >
                      <button
                        className="flex w-full items-start gap-3 px-3 py-3 text-left"
                        onClick={() => setExpanded(open ? null : t.id)}
                        aria-expanded={open}
                      >
                        <span className="num text-[11px] font-semibold text-[var(--ink-3)] pt-[3px] w-5 shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-semibold leading-snug">{r.headline}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Chip
                              color={
                                r.tag === 'OVERDUE' ? 'var(--critical)' : r.tag === 'URGENT' ? 'var(--warning)' : 'var(--accent)'
                              }
                            >
                              {r.tag}
                            </Chip>
                            {t.effortMins > 0 && (
                              <span className="text-[11.5px] text-[var(--ink-3)] inline-flex items-center gap-1">
                                <Icon name="Clock" size={11} />
                                {formatMins(t.effortMins)}
                              </span>
                            )}
                            <span className="num text-[11px] text-[var(--ink-3)]">score {r.scored.score}</span>
                          </span>
                        </span>
                        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={15} className="mt-1 text-[var(--ink-3)] shrink-0" />
                      </button>

                      {open && (
                        <div className="px-3 pb-3 pl-11">
                          <div className="label mb-1.5">Why</div>
                          <ul className="flex flex-col gap-1">
                            {r.reasons.map((why) => (
                              <li key={why} className="text-[12.5px] text-[var(--ink-2)] flex gap-2">
                                <span className="text-[var(--ink-3)]">•</span>
                                {why}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="btn btn-primary" onClick={() => nav.startFocus(t.id)}>
                              <Icon name="Play" size={13} />
                              Do this now
                            </button>
                            <button className="btn" onClick={() => nav.openTask(t)}>
                              Open
                            </button>
                            <button
                              className="btn"
                              onClick={() => {
                                actions.postponeTask(t.id, 1);
                                toast({ text: 'Moved to tomorrow', tone: 'info' });
                              }}
                            >
                              Snooze a day
                            </button>
                            <button
                              className="btn"
                              onClick={() => {
                                actions.toggleTask(t.id);
                                toast({
                                  text: 'Marked complete',
                                  tone: 'good',
                                  action: { label: 'Undo', run: () => actions.toggleTask(t.id) },
                                });
                              }}
                            >
                              <Icon name="Check" size={13} />
                              Complete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Panel>
  );
}
