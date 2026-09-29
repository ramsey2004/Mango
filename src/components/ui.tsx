import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { cn } from '../lib/util';
import { Icon } from './Icon';

/* ------------------------------- motion ---------------------------------- */

export const AnimCtx = createContext<'off' | 'subtle' | 'full'>('full');
export const useAnim = () => useContext(AnimCtx);

export function useMotion() {
  const level = useAnim();
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const off = level === 'off' || reduced;
  const scale = level === 'subtle' ? 0.55 : 1;
  const spring: Transition = off
    ? { duration: 0 }
    : { type: 'spring', stiffness: 380, damping: 34, mass: 0.7 };
  return {
    off,
    scale,
    spring,
    fade: off ? { duration: 0 } : { duration: 0.22 * scale, ease: [0.22, 0.8, 0.3, 1] as const },
    rise: off
      ? { initial: {}, animate: {}, exit: {} }
      : {
          initial: { opacity: 0, y: 8 * scale },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -6 * scale },
        },
  };
}

/* ------------------------------- surfaces -------------------------------- */

export function Panel({
  children,
  className,
  as: As = 'section',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <As className={cn('panel', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionHeader({
  label,
  title,
  right,
  className,
}: {
  label?: string;
  title?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    // Actions drop below the title on a narrow screen rather than crushing it
    // into a two-word column.
    <header className={cn('flex flex-wrap items-end justify-between gap-x-3 gap-y-2', className)}>
      <div className="min-w-0 flex-1 basis-[12rem]">
        {label && <div className="label mb-1 break-words">{label}</div>}
        {title && <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/* -------------------------------- chips ---------------------------------- */

export function Chip({
  color,
  children,
  glyph,
  className,
  title,
}: {
  color?: string;
  glyph?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn('chip', className)}
      title={title}
      style={color ? { color, borderColor: `${color}55`, background: `${color}14` } : undefined}
    >
      {glyph && <span aria-hidden>{glyph}</span>}
      {children}
    </span>
  );
}

/* ------------------------------- progress -------------------------------- */

export function Bar({
  value,
  color = 'var(--accent)',
  height = 6,
  track = 'var(--sunken)',
  className,
  label,
}: {
  value: number;
  color?: string;
  height?: number;
  track?: string;
  className?: string;
  label?: string;
}) {
  const { off } = useMotion();
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', className)}
      style={{ height, background: track }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        initial={off ? false : { width: 0 }}
        animate={{ width: `${v}%` }}
        transition={off ? { duration: 0 } : { duration: 0.6, ease: [0.22, 0.8, 0.3, 1] }}
        style={{ height: '100%', background: color, borderRadius: 999 }}
      />
    </div>
  );
}

export function Ring({
  value,
  size = 44,
  stroke = 4,
  color = 'var(--accent)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,.8,.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center num text-[11px] font-semibold">{children}</div>
    </div>
  );
}

/* -------------------------------- inputs --------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
  as,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** Use "div" when the field holds a GROUP of controls (a segmented control,
      a colour palette). Wrapping several controls in one <label> pollutes every
      one of their accessible names. */
  as?: 'label' | 'div';
}) {
  const id = useId();
  const Tag = (as ?? 'label') as 'label' | 'div';
  const groupProps = Tag === 'div' && label ? { role: 'group' as const, 'aria-labelledby': id } : {};
  return (
    <Tag className={cn('block', className)} {...groupProps}>
      {label && (
        <div className="label mb-1.5" id={Tag === 'div' ? id : undefined}>
          {label}
        </div>
      )}
      {children}
      {hint && <div className="mt-1 text-[11px] text-[var(--ink-3)]">{hint}</div>}
    </Tag>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="field appearance-none pr-8 cursor-pointer"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="ChevronsUpDown"
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: string }>;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  // A tab strip must never widen the page. On a narrow screen it scrolls
  // sideways inside its own track instead.
  return (
    <div className="min-w-0 max-w-full overflow-x-auto no-scrollbar -mx-1 px-1">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex w-max gap-0.5 rounded-lg p-0.5"
        style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 rounded-md font-semibold transition-colors',
                size === 'sm' ? 'px-2.5 py-1.5 text-[11.5px]' : 'px-3 py-2 text-[12.5px]',
                on ? 'text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
              )}
              style={on ? { background: 'var(--raised)', boxShadow: 'var(--shadow-1)' } : undefined}
            >
              {o.icon && <Icon name={o.icon} size={13} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-[13.5px] font-semibold">{label}</div>
        {hint && <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{hint}</div>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="switch relative shrink-0 rounded-full transition-colors"
        style={{
          width: 40,
          height: 23,
          background: checked ? 'var(--accent)' : 'var(--sunken)',
          border: '1px solid var(--hairline)',
        }}
      >
        <span
          className="absolute top-[2px] rounded-full transition-all"
          style={{
            width: 17,
            height: 17,
            left: checked ? 20 : 2,
            background: checked ? 'var(--accent-ink)' : 'var(--ink-2)',
          }}
        />
      </button>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 5,
  labels,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  labels?: string[];
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          title={labels?.[n - min]}
          aria-label={`${n}`}
          aria-pressed={value === n}
          className="h-7 flex-1 rounded-md text-[11.5px] font-bold num transition-colors"
          style={{
            background: value >= n ? 'var(--accent)' : 'var(--sunken)',
            color: value >= n ? 'var(--accent-ink)' : 'var(--ink-3)',
            border: '1px solid var(--hairline)',
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- overlays ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const { off, fade, spring } = useMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)' }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Dialog'}
            initial={off ? false : { y: 24, scale: 0.99, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={off ? undefined : { y: 16, opacity: 0 }}
            transition={spring}
            className={cn(
              'relative w-full max-h-[92dvh] overflow-hidden flex flex-col',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
              'rounded-t-2xl sm:rounded-2xl',
            )}
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-2)' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b" style={{ borderColor: 'var(--hairline)' }}>
              <h3 className="text-[15px] font-bold truncate">{title}</h3>
              <button className="btn btn-ghost !px-1.5 !py-1.5" onClick={onClose} aria-label="Close">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 sm:px-5 py-4 flex-1">{children}</div>
            {footer && (
              <div
                className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t safe-b"
                style={{ borderColor: 'var(--hairline)', background: 'var(--raised)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] text-[var(--ink-2)] leading-relaxed">{body}</p>
    </Modal>
  );
}

/* --------------------------------- toasts -------------------------------- */

type Toast = { id: string; text: string; tone: 'info' | 'good' | 'warning' | 'critical'; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const { rise, spring } = useMotion();

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { ...t, id }].slice(-4));
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5200);
  }, []);

  const tone = (t: Toast['tone']) =>
    t === 'good' ? 'var(--good)' : t === 'warning' ? 'var(--warning)' : t === 'critical' ? 'var(--critical)' : 'var(--info)';

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              {...rise}
              transition={spring}
              className="pointer-events-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 max-w-[min(94vw,30rem)]"
              style={{ background: 'var(--raised)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--shadow-2)' }}
              role="status"
            >
              <span className="h-4 w-[3px] rounded-full shrink-0" style={{ background: tone(t.tone) }} />
              <span className="text-[13px] flex-1">{t.text}</span>
              {t.action && (
                <button
                  className="btn btn-ghost !py-1 !px-2 !text-[12px]"
                  onClick={() => {
                    t.action?.run();
                    setItems((x) => x.filter((i) => i.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ empty states ----------------------------- */

export function Empty({
  icon = 'Inbox',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2.5 py-10 px-6">
      <div
        className="grid place-items-center rounded-xl"
        style={{ width: 40, height: 40, background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
      >
        <Icon name={icon} size={18} className="text-[var(--ink-3)]" />
      </div>
      <div className="text-[14px] font-semibold">{title}</div>
      {body && <div className="text-[12.5px] text-[var(--ink-3)] max-w-[34ch] leading-relaxed">{body}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/* --------------------------------- gating -------------------------------- */

/**
 * Shown in place of a Premium feature on the free tier.
 *
 * Deliberately not a blurred screenshot with a padlock over it: that shows the
 * user what they cannot have and tells them nothing. This says what the feature
 * does, why it sits behind the line, and what the free tier does instead.
 */
export function Locked({
  title,
  body,
  onUpgrade,
  instead,
}: {
  title: string;
  body: string;
  onUpgrade: () => void;
  /** what the free tier gives you right now, if anything */
  instead?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-start gap-2.5 rounded-xl p-4 sm:p-5"
      style={{ background: 'var(--sunken)', border: '1px dashed var(--hairline-strong)' }}
    >
      <div className="flex items-center gap-2">
        <Icon name="Lock" size={14} className="text-[var(--ink-3)]" />
        <span className="label">Premium</span>
      </div>
      <h3 className="text-[15px] font-bold">{title}</h3>
      <p className="max-w-[58ch] text-[13px] leading-relaxed text-[var(--ink-2)]">{body}</p>
      {instead && <div className="w-full">{instead}</div>}
      <button className="btn btn-primary mt-1" onClick={onUpgrade}>
        See what Premium includes
      </button>
    </div>
  );
}

/** A small "2 of 3 left today" counter for metered free-tier allowances. */
export function Allowance({ left, total, noun, onUpgrade }: { left: number; total: number; noun: string; onUpgrade: () => void }) {
  if (!Number.isFinite(total)) return null;
  const out = left <= 0;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: out ? 'var(--critical)' : 'var(--ink-3)' }}>
      <Icon name={out ? 'AlertTriangle' : 'Gauge'} size={12} />
      <span>
        {out ? `No ${noun} left today` : `${left} of ${total} ${noun} left today`}
      </span>
      <button className="btn btn-ghost !py-0.5 !text-[11.5px]" onClick={onUpgrade}>
        {out ? 'Remove the limit' : 'Premium removes this'}
      </button>
    </div>
  );
}

/* ------------------------------- utilities ------------------------------- */

export function useClickOutside<T extends HTMLElement>(onOut: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onOut]);
  return ref;
}

export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: React.ReactNode;
  items: Array<{ label: string; icon?: string; run: () => void; danger?: boolean } | 'separator'>;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const { fade } = useMotion();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-ghost !px-1.5 !py-1"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={fade}
            role="menu"
            className={cn('absolute z-50 mt-1 min-w-[11rem] rounded-lg p-1', align === 'right' ? 'right-0' : 'left-0')}
            style={{ background: 'var(--raised)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--shadow-2)' }}
          >
            {items.map((it, i) =>
              it === 'separator' ? (
                <div key={i} className="my-1 h-px" style={{ background: 'var(--hairline)' }} />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    it.run();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] row-hover"
                  style={it.danger ? { color: 'var(--critical)' } : undefined}
                >
                  {it.icon && <Icon name={it.icon} size={14} />}
                  {it.label}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
