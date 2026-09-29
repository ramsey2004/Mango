import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DB } from '../lib/types';
import { actions } from '../store/store';
import { useNav, VIEWS, type ViewId } from '../store/nav';
import { parseCapture, parsedToTask } from '../engine/nlp';
import { RECIPES } from '../lib/recipe-db';
import { searchFoods } from '../engine/foodParser';
import { useMotion, useToast, Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { cn, relativeDay } from '../lib/util';

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  group: string;
  run: () => void;
  accent?: boolean;
}

export function CommandPalette({ db, open, onClose }: { db: DB; open: boolean; onClose: () => void }) {
  const nav = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { off, fade, spring } = useMotion();

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const parsed = useMemo(() => (q.trim() ? parseCapture(q, db) : null), [q, db]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];

    // 1. Quick capture is always the first offer when something is typed.
    if (parsed && parsed.title) {
      out.push({
        id: 'capture',
        label: `Add task: ${parsed.title}`,
        sub: parsed.understood.length ? parsed.understood.join(' · ') : 'No date or priority detected — add them later',
        icon: 'Plus',
        group: 'Capture',
        accent: true,
        run: () => {
          const t = actions.addTask(parsedToTask(parsed));
          toast({ text: `Added “${t.title}”`, tone: 'good', action: { label: 'Edit', run: () => nav.openTask(t) } });
          onClose();
        },
      });
    }

    // 2. Creation commands
    const creators: Array<[string, string, string, () => void]> = [
      ['Add a goal', 'Target', 'Create', () => { nav.go('goals'); actions.addGoal({ name: parsed?.title || 'New goal' }); }],
      ['Add a project', 'Layers', 'Create', () => { nav.go('projects'); actions.addProject({ name: parsed?.title || 'New project' }); }],
      ['Add a note', 'StickyNote', 'Create', () => { const n = actions.addNote({ title: parsed?.title || 'Untitled note' }); nav.go('notes', n.id); }],
      ['Add a habit', 'Repeat', 'Create', () => { nav.go('habits'); actions.addHabit({ name: parsed?.title || 'New habit' }); }],
      ['Track an application', 'Building2', 'Create', () => { nav.go('applications'); actions.addApplication({ org: parsed?.title || 'New organisation', role: 'Role' }); }],
    ];
    for (const [label, icon, group, run] of creators) {
      if (!needle || label.toLowerCase().includes(needle)) {
        out.push({ id: label, label, icon, group, run: () => { run(); onClose(); } });
      }
    }

    // 3. Navigation
    for (const v of VIEWS) {
      if (!needle || v.label.toLowerCase().includes(needle)) {
        out.push({
          id: `nav-${v.id}`,
          label: v.label,
          icon: v.icon,
          group: 'Go to',
          run: () => {
            nav.go(v.id);
            onClose();
          },
        });
      }
    }
    for (const m of db.modules.filter((x) => !x.archived)) {
      if (!needle || m.name.toLowerCase().includes(needle)) {
        out.push({
          id: `nav-mod-${m.id}`,
          label: m.name,
          icon: m.icon,
          group: 'Go to',
          run: () => {
            nav.go(`module:${m.id}`);
            onClose();
          },
        });
      }
    }

    // 4. Assistant shortcuts
    const asks = ['What should I do now?', 'Plan my day', 'What is overdue?', 'Give me my weekly review'];
    for (const a of asks) {
      if (!needle || a.toLowerCase().includes(needle)) {
        out.push({
          id: `ask-${a}`,
          label: a,
          icon: 'Sparkles',
          group: 'Ask',
          run: () => {
            nav.go('jarvis');
            onClose();
          },
        });
      }
    }

    // 5. Search across everything
    if (needle.length >= 2) {
      for (const t of db.tasks.filter((x) => !x.archived && x.title.toLowerCase().includes(needle)).slice(0, 8)) {
        out.push({
          id: `t-${t.id}`,
          label: t.title,
          sub: [t.due ? relativeDay(t.due) : null, db.areas.find((a) => a.id === t.areaId)?.name].filter(Boolean).join(' · '),
          icon: 'SquareCheck',
          group: 'Tasks',
          run: () => {
            nav.openTask(t);
            onClose();
          },
        });
      }
      for (const g of db.goals.filter((x) => !x.archived && x.name.toLowerCase().includes(needle)).slice(0, 5)) {
        out.push({ id: `g-${g.id}`, label: g.name, icon: 'Target', group: 'Goals', run: () => { nav.go('goals', g.id); onClose(); } });
      }
      for (const p of db.projects.filter((x) => !x.archived && x.name.toLowerCase().includes(needle)).slice(0, 5)) {
        out.push({ id: `p-${p.id}`, label: p.name, icon: 'Layers', group: 'Projects', run: () => { nav.go('projects', p.id); onClose(); } });
      }
      for (const n of db.notes.filter((x) => !x.archived && (x.title.toLowerCase().includes(needle) || x.body.toLowerCase().includes(needle))).slice(0, 5)) {
        out.push({ id: `n-${n.id}`, label: n.title, sub: n.body.slice(0, 60), icon: 'StickyNote', group: 'Notes', run: () => { nav.go('notes', n.id); onClose(); } });
      }
      for (const a of db.applications.filter((x) => !x.archived && (x.org.toLowerCase().includes(needle) || x.role.toLowerCase().includes(needle))).slice(0, 5)) {
        out.push({ id: `a-${a.id}`, label: `${a.org} — ${a.role}`, icon: 'Building2', group: 'Applications', run: () => { nav.go('applications', a.id); onClose(); } });
      }
      for (const r of RECIPES.filter((x) => x.name.toLowerCase().includes(needle)).slice(0, 5)) {
        out.push({
          id: `r-${r.id}`,
          label: r.name,
          sub: `${r.kcal} kcal · ${r.protein} g protein · ₹${r.costRupees}`,
          icon: 'BookOpen',
          group: 'Recipes',
          run: () => { nav.go('nut_meals'); onClose(); },
        });
      }
      for (const f of searchFoods(needle, db.nutrition.customFoods, 5)) {
        out.push({
          id: `f-${f.id}`,
          label: f.name,
          sub: `${f.servingLabel} · ${f.kcal} kcal — log it`,
          icon: 'ListChecks',
          group: 'Foods',
          run: () => { nav.go('nut_log'); onClose(); },
        });
      }
      for (const h of db.habits.filter((x) => !x.archived && x.name.toLowerCase().includes(needle)).slice(0, 4)) {
        out.push({ id: `h-${h.id}`, label: h.name, icon: 'Repeat', group: 'Habits', run: () => { nav.go('habits'); onClose(); } });
      }
    }

    return out;
  }, [q, db, parsed, nav, onClose, toast]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(items.length - 1, c + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        items[cursor]?.run();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items, cursor, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) map.set(it.group, [...(map.get(it.group) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[75] flex items-start justify-center p-4 sm:pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)' }} onClick={onClose} aria-hidden />
          <motion.div
            initial={off ? false : { y: -12, scale: 0.99, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={off ? undefined : { y: -8, opacity: 0 }}
            transition={spring}
            role="dialog"
            aria-label="Command palette"
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl flex flex-col max-h-[75dvh]"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--shadow-2)' }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--hairline)' }}>
              <Icon name="Search" size={16} className="text-[var(--ink-3)] shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent border-none text-[15px] outline-none"
                placeholder="Search, or type a task in plain English…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Chip className="hidden sm:inline-flex shrink-0">esc</Chip>
            </div>

            <div ref={listRef} className="overflow-y-auto py-2">
              {groups.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-[var(--ink-3)]">Nothing matches. Type something to add it as a task.</div>}
              {groups.map(([group, list]) => (
                <div key={group} className="mb-1">
                  <div className="label px-4 py-1.5">{group}</div>
                  {list.map((it) => {
                    flatIndex++;
                    const active = flatIndex === cursor;
                    return (
                      <button
                        key={it.id}
                        data-active={active}
                        onMouseEnter={() => setCursor(items.indexOf(it))}
                        onClick={it.run}
                        className={cn('flex w-full items-center gap-3 px-4 py-2 text-left')}
                        style={active ? { background: 'var(--accent-soft)' } : undefined}
                      >
                        <Icon name={it.icon} size={15} className="shrink-0" style={{ color: it.accent ? 'var(--accent)' : 'var(--ink-3)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px]">{it.label}</span>
                          {it.sub && <span className="block truncate text-[11.5px] text-[var(--ink-3)]">{it.sub}</span>}
                        </span>
                        {active && <Icon name="ArrowRight" size={13} className="text-[var(--ink-3)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-[var(--ink-3)]" style={{ borderColor: 'var(--hairline)' }}>
              <span>↑↓ move</span>
              <span>↵ run</span>
              <span className="hidden sm:inline">Try “submit application friday high priority 45m”</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
