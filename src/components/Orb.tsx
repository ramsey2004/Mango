import { useEffect, useRef } from 'react';
import { useAnim } from './ui';

export type OrbState = 'idle' | 'processing' | 'responding' | 'celebrate' | 'alert';

/* ============================================================
   The signature visual. Canvas, not SVG: it is a continuous
   field, and hand-authored paths would be both heavier and
   less alive. Draws once and stops when motion is switched off.
   ============================================================ */

export function Orb({
  state = 'idle',
  size = 96,
  color,
}: {
  state?: OrbState;
  size?: number;
  color?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const anim = useAnim();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const still = anim === 'off' || reduced;
    const intensity = anim === 'subtle' ? 0.45 : 1;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const accent = color ?? (css.getPropertyValue('--accent').trim() || '#ff8a3d');
    const critical = css.getPropertyValue('--critical').trim() || '#f2555a';
    const good = css.getPropertyValue('--good').trim() || '#3ec08c';

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.36;

    // A fixed particle ring — deterministic, so the orb looks the same each mount.
    const N = 44;
    const parts = Array.from({ length: N }, (_, i) => ({
      a: (i / N) * Math.PI * 2,
      r: 0.72 + ((i * 37) % 23) / 80,
      s: 0.5 + ((i * 17) % 11) / 14,
    }));

    let raf = 0;
    let t = 0;

    const draw = () => {
      const st = stateRef.current;
      const hue = st === 'alert' ? critical : st === 'celebrate' ? good : accent;
      const speed = st === 'processing' ? 2.6 : st === 'responding' ? 1.8 : st === 'celebrate' ? 2.2 : 0.6;
      const amp = st === 'idle' ? 0.045 : st === 'alert' ? 0.09 : 0.075;
      const breathe = 1 + Math.sin(t * 0.9) * amp * intensity;

      ctx.clearRect(0, 0, size, size);

      // ambient bloom
      const bloom = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.85);
      bloom.addColorStop(0, `${hue}44`);
      bloom.addColorStop(0.5, `${hue}14`);
      bloom.addColorStop(1, `${hue}00`);
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, size, size);

      // core disc
      const core = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R * breathe);
      core.addColorStop(0, `${hue}f0`);
      core.addColorStop(0.55, `${hue}70`);
      core.addColorStop(1, `${hue}10`);
      ctx.beginPath();
      ctx.arc(cx, cy, R * breathe * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      // two counter-rotating arcs — the "thinking" tell
      for (let k = 0; k < 2; k++) {
        const rr = R * (0.82 + k * 0.18) * breathe;
        const dir = k === 0 ? 1 : -1;
        const start = t * speed * dir + k * 1.7;
        const sweep = st === 'processing' ? 1.5 : st === 'idle' ? 0.85 : 1.15;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, start, start + sweep);
        ctx.strokeStyle = `${hue}${k === 0 ? 'cc' : '77'}`;
        ctx.lineWidth = k === 0 ? 2 : 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // hairline shell
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
      ctx.strokeStyle = `${hue}2a`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // particles
      if (!still) {
        for (const p of parts) {
          const a = p.a + t * 0.22 * p.s * (st === 'processing' ? 2.4 : 1);
          const rad = R * (1.12 + Math.sin(t * p.s + p.a * 3) * 0.09 * intensity) * p.r * 1.25;
          const x = cx + Math.cos(a) * rad;
          const y = cy + Math.sin(a) * rad;
          const alpha = st === 'idle' ? 0.3 : 0.55;
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          ctx.fillStyle = `${hue}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
          ctx.fill();
        }
      }

      t += still ? 0 : 0.016 * (anim === 'subtle' ? 0.6 : 1);
      if (!still) raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, anim, color]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, display: 'block' }}
      role="img"
      aria-label={`Assistant status: ${state}`}
    />
  );
}
