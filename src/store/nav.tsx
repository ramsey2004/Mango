import { createContext, useContext } from 'react';
import type { Task } from '../lib/types';

export type ViewId =
  | 'dashboard' | 'today' | 'week' | 'calendar' | 'goals' | 'projects' | 'tasks'
  | 'habits' | 'notes' | 'applications' | 'analytics' | 'jarvis' | 'review'
  | 'deadlines' | 'archive' | 'settings' | string;

export interface NavApi {
  view: ViewId;
  focusId?: string;
  go: (view: ViewId, id?: string) => void;
  openPalette: () => void;
  openTask: (t: Task) => void;
  startFocus: (taskId?: string) => void;
  openQuickAdd: () => void;
}

export const NavCtx = createContext<NavApi>({
  view: 'dashboard',
  go: () => {},
  openPalette: () => {},
  openTask: () => {},
  startFocus: () => {},
  openQuickAdd: () => {},
});

export const useNav = () => useContext(NavCtx);

export const VIEWS: Array<{ id: ViewId; label: string; icon: string; group: string }> = [
  /* Nutrition is the product. It comes first everywhere. */
  { id: 'nut_now', label: 'Eat now', icon: 'Zap', group: 'Nutrition' },
  { id: 'nut_home', label: 'Today', icon: 'Flame', group: 'Nutrition' },
  { id: 'nut_meals', label: 'Meals', icon: 'BookOpen', group: 'Nutrition' },
  { id: 'nut_log', label: 'Log food', icon: 'ListChecks', group: 'Nutrition' },
  { id: 'nut_grocery', label: 'Grocery', icon: 'ShoppingBag', group: 'Nutrition' },
  { id: 'nut_progress', label: 'Progress', icon: 'Activity', group: 'Nutrition' },
  { id: 'nut_coach', label: 'Coach', icon: 'Heart', group: 'Nutrition' },
  { id: 'nut_trust', label: 'Your data', icon: 'ShieldCheck', group: 'Nutrition' },

  { id: 'actions', label: 'Action centre', icon: 'Mail', group: 'Assistant' },
  { id: 'jarvis', label: 'Assistant', icon: 'Sparkles', group: 'Assistant' },
  { id: 'dashboard', label: 'Command centre', icon: 'LayoutDashboard', group: 'Assistant' },
  { id: 'goals', label: 'Goals', icon: 'Target', group: 'Assistant' },
  { id: 'settings', label: 'Settings', icon: 'Settings', group: 'Assistant' },

  { id: 'today', label: 'Today’s tasks', icon: 'Zap', group: 'Planner' },
  { id: 'week', label: 'Week', icon: 'CalendarDays', group: 'Planner' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar', group: 'Planner' },
  { id: 'deadlines', label: 'Deadlines', icon: 'AlarmClock', group: 'Planner' },
  { id: 'projects', label: 'Projects', icon: 'Layers', group: 'Planner' },
  { id: 'tasks', label: 'All tasks', icon: 'ListChecks', group: 'Planner' },
  { id: 'habits', label: 'Habits', icon: 'Repeat', group: 'Planner' },
  { id: 'applications', label: 'Applications', icon: 'Building2', group: 'Planner' },
  { id: 'notes', label: 'Notes', icon: 'StickyNote', group: 'Planner' },

  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', group: 'Review' },
  { id: 'review', label: 'Reviews', icon: 'Trophy', group: 'Review' },
  { id: 'archive', label: 'Archive', icon: 'Archive', group: 'Review' },
];
