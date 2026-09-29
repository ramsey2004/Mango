import type { Settings } from './types';

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const now = (): string => new Date().toISOString();

export const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* ---------------------------------- dates --------------------------------- */

export const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const toISODate = (d: Date | string): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const fromISODate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const todayISO = () => toISODate(new Date());

export const addDays = (d: Date | string, n: number): Date => {
  const x = typeof d === 'string' ? fromISODate(d) : new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const addMonths = (d: Date | string, n: number): Date => {
  const x = typeof d === 'string' ? fromISODate(d) : new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

/** Whole days from today to an ISO date. Negative = overdue. */
export const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const a = startOfDay(new Date()).getTime();
  const b = startOfDay(fromISODate(iso)).getTime();
  return Math.round((b - a) / 86400000);
};

export const startOfWeek = (d: Date, firstDay: 0 | 1 = 1): Date => {
  const x = startOfDay(d);
  const diff = (x.getDay() - firstDay + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};

export const weekKey = (d: Date, firstDay: 0 | 1 = 1): string => {
  const s = startOfWeek(d, firstDay);
  const jan1 = new Date(s.getFullYear(), 0, 1);
  const week = Math.ceil(((s.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${s.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const monthName = (i: number) => MONTHS[i] ?? '';
export const dowName = (i: number) => DOW[i] ?? '';
export const dowShort = (i: number) => (DOW[i] ?? '').slice(0, 3);

export const formatDate = (iso: string | undefined, fmt: Settings['dateFormat'] = 'dmy'): string => {
  if (!iso) return '—';
  const d = fromISODate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (fmt === 'iso') return iso;
  if (fmt === 'mdy') return `${mm}/${dd}/${d.getFullYear()}`;
  return `${dd}/${mm}/${d.getFullYear()}`;
};

export const formatDateLong = (iso: string | undefined): string => {
  if (!iso) return '—';
  const d = fromISODate(iso);
  return `${dowName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())}`;
};

/** "3 days ago" / "in 4 days" / "today" */
export const relativeDay = (iso?: string): string => {
  const n = daysUntil(iso);
  if (n === null) return 'No date';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${Math.abs(n)} days overdue`;
  if (n < 7) return `In ${n} days`;
  if (n < 14) return 'Next week';
  if (n < 60) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
};

export const formatMins = (m: number): string => {
  if (!m || m <= 0) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export const formatClock = (mins: number, time24h = true): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (time24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}${ampm}`;
};

export const pct = (n: number) => `${Math.round(clamp(n, 0, 100))}%`;

export const pluralise = (n: number, one: string, many?: string) =>
  `${n} ${n === 1 ? one : many ?? one + 's'}`;

/** Stable sort helper — Array.prototype.sort is stable in modern engines but be explicit. */
export function sortBy<T>(arr: T[], ...keys: Array<(t: T) => number | string>): T[] {
  return [...arr].sort((a, b) => {
    for (const k of keys) {
      const av = k(a);
      const bv = k(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });
}

export const groupBy = <T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> => {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
};

export const download = (filename: string, text: string, mime = 'application/json') => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported — silent */
  }
};

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
