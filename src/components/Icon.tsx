import {
  Activity, AlarmClock, AlertTriangle, Archive, ArrowRight, ArrowUpRight, BarChart3, BookMarked,
  BookOpen, Box, Boxes, Briefcase, Calendar, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Circle, CircleDot, Clock, Command, Copy, Download,
  Dumbbell, Edit3, ExternalLink, Eye, EyeOff, FileText, Filter, Flag, Flame, Focus, GraduationCap,
  Grid3x3, Heart, Inbox, Info, Layers, LayoutDashboard, Link2, List, ListChecks, Loader2, Lock,
  Mic, Minus, MoreHorizontal, Moon, Pause, Pencil, Pin, Plane, Play, Plus, Repeat, RotateCcw,
  Search, Settings, ShoppingBag, Sparkles, SquareCheck, Star, Sun, Target, Timer, Trash2, TrendingUp,
  Undo2, Upload, User, Users, Wallet, X, Zap, Bell, BellOff, Kanban, GanttChart, StickyNote,
  Building2, Compass, Gauge, Hourglass, Trophy, PanelLeft, ChevronsUpDown, CircleSlash,
  Bookmark, BookmarkCheck, History, ShieldCheck, Database, Utensils, Salad,
  Mail, MailCheck, Send, Reply, AtSign, CalendarClock, UserCheck, RefreshCw, Unplug,
} from 'lucide-react';

export const ICONS = {
  Activity, AlarmClock, AlertTriangle, Archive, ArrowRight, ArrowUpRight, BarChart3, BookMarked,
  BookOpen, Box, Boxes, Briefcase, Calendar, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Circle, CircleDot, Clock, Command, Copy, Download,
  Dumbbell, Edit3, ExternalLink, Eye, EyeOff, FileText, Filter, Flag, Flame, Focus, GraduationCap,
  Grid3x3, Heart, Inbox, Info, Layers, LayoutDashboard, Link2, List, ListChecks, Loader2, Lock,
  Mic, Minus, MoreHorizontal, Moon, Pause, Pencil, Pin, Plane, Play, Plus, Repeat, RotateCcw,
  Search, Settings, ShoppingBag, Sparkles, SquareCheck, Star, Sun, Target, Timer, Trash2, TrendingUp,
  Undo2, Upload, User, Users, Wallet, X, Zap, Bell, BellOff, Kanban, GanttChart, StickyNote,
  Building2, Compass, Gauge, Hourglass, Trophy, PanelLeft, ChevronsUpDown, CircleSlash,
  Bookmark, BookmarkCheck, History, ShieldCheck, Database, Utensils, Salad,
  Mail, MailCheck, Send, Reply, AtSign, CalendarClock, UserCheck, RefreshCw, Unplug,
};

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.75,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const Cmp = (ICONS as Record<string, typeof Circle>)[name] ?? Circle;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} style={style} aria-hidden />;
}
