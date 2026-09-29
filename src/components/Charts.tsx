import { useState } from 'react';
import { cn } from '../lib/util';

/* ============================================================
   Charts. Hand-drawn SVG so they inherit the theme tokens and
   carry no library weight. Rules held to throughout: one scale,
   recessive grid, text in ink tokens (never the series colour),
   direct labels where there are few series, a hover layer on
   everything that plots.
   ============================================================ */

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'good' | 'warning' | 'critical';
}) {
  const color =
    tone === 'good' ? 'var(--good)' : tone === 'warning' ? 'var(--warning)' : tone === 'critical' ? 'var(--critical)' : 'var(--ink)';
  return (
    <div className="min-w-0">
      <div className="label mb-1.5">{label}</div>
      <div className="num text-[26px] font-semibold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-[var(--ink-3)] mt-1.5 truncate">{sub}</div>}
    </div>
  );
}

/** Horizontal bars, one row per entity. Identity comes from the row label,
    so colour is reinforcement rather than the only cue. */
export function HBar({
  rows,
  unit = '',
  max,
}: {
  rows: Array<{ label: string; value: number; color?: string; hint?: string }>;
  unit?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="text-[12.5px] text-[var(--ink-3)] py-4">No data for this period.</div>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(6rem,12rem) 1fr auto' }}>
          <div className="text-[12.5px] truncate" title={r.label}>
            {r.label}
          </div>
          <div className="h-[9px] rounded-full overflow-hidden" style={{ background: 'var(--sunken)' }} title={r.hint}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: r.color ?? 'var(--cat-2)' }}
            />
          </div>
          <div className="num text-[12px] text-[var(--ink-2)] tabular-nums">
            {r.value}
            {unit}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Time series with a crosshair. One series, so the title names it and no legend box is needed. */
export function LineChart({
  points,
  height = 140,
  color = 'var(--cat-1)',
  yLabel = '',
}: {
  points: Array<{ x: string; y: number }>;
  height?: number;
  color?: string;
  yLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 24;

  if (points.length < 2) {
    return <div className="text-[12.5px] text-[var(--ink-3)] py-6">Not enough history yet — this fills in as you complete work.</div>;
  }

  const maxY = Math.max(1, ...points.map((p) => p.y));
  const niceMax = Math.ceil(maxY / 5) * 5 || 5;
  const px = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const py = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${px(points.length - 1).toFixed(1)},${py(0)} L${px(0).toFixed(1)},${py(0)} Z`;
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${yLabel} over time`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - padL) / (W - padL - padR)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 7} y={py(t) + 3.5} textAnchor="end" fill="var(--ink-3)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
              {t}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lc-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={px(points.length - 1)} cy={py(points[points.length - 1].y)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />

        {points.map((p, i) =>
          i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? (
            <text key={p.x} x={px(i)} y={H - 6} textAnchor="middle" fill="var(--ink-3)" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              {p.x}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <g>
            <line x1={px(hover)} x2={px(hover)} y1={padT} y2={H - padB} stroke="var(--hairline-strong)" strokeWidth="1" />
            <circle cx={px(hover)} cy={py(points[hover].y)} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-md px-2 py-1 text-[11px]"
          style={{
            left: `${(px(hover) / W) * 100}%`,
            transform: 'translateX(-50%)',
            background: 'var(--raised)',
            border: '1px solid var(--hairline-strong)',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <span className="text-[var(--ink-3)]">{points[hover].x}</span>{' '}
          <span className="num font-semibold">{points[hover].y}</span>{' '}
          <span className="text-[var(--ink-3)]">{yLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Calendar heatmap — one hue, light to dark. Used for habit history. */
export function Heatmap({
  days,
  color = 'var(--good)',
  weeks = 18,
  onToggle,
}: {
  days: Record<string, number>;
  color?: string;
  weeks?: number;
  onToggle?: (date: string) => void;
}) {
  const cells: Array<{ date: string; v: number }> = [];
  const today = new Date();
  const total = weeks * 7;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ date: iso, v: days[iso] ?? 0 });
  }
  const cols: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]" style={{ minWidth: 'min-content' }}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((c) => (
              <button
                key={c.date}
                onClick={onToggle ? () => onToggle(c.date) : undefined}
                title={`${c.date} — ${c.v ? 'done' : 'not done'}`}
                aria-label={`${c.date} ${c.v ? 'done' : 'not done'}`}
                disabled={!onToggle}
                className={cn('heat-cell rounded-[3px] transition-transform', onToggle && 'hover:scale-125 cursor-pointer')}
                style={{
                  background: c.v ? color : 'var(--sunken)',
                  opacity: c.v ? Math.min(1, 0.55 + c.v * 0.25) : 1,
                  border: '1px solid var(--hairline)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single stacked bar showing composition — used for priority mix. */
export function StackedBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="text-[12.5px] text-[var(--ink-3)] py-3">Nothing to show yet.</div>;
  return (
    <div>
      <div className="flex gap-[2px] h-[10px] w-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.label}
              title={`${p.label}: ${p.value}`}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              className="first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
              <span className="num text-[var(--ink-3)]">{p.value}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
