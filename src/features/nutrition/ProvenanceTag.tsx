import type { FoodItem } from '../../lib/nutrition-types';
import { PROVENANCE, type Provenance } from '../../data/provenance';
import { Chip } from '../../components/ui';
import { Icon } from '../../components/Icon';

/* ============================================================
   Where this number came from, on the screen where it is used.

   The brief said estimated nutrition must not be presented as
   exact. The honest way to do that is not a disclaimer at the
   bottom of a settings page — it is a word next to the number,
   every time, so that someone choosing between two search
   results can see that one was measured in a laboratory and the
   other is a reasonable guess about a typical version.
   ============================================================ */

/* Only the measured tier gets a colour. Three coloured badges competing in a
   search result list would read as decoration; one means something. */
const TONE: Record<Provenance, { fg: string; bg: string }> = {
  verified: { fg: 'var(--good)', bg: 'var(--sunken)' },
  computed: { fg: 'var(--ink-2)', bg: 'var(--sunken)' },
  estimated: { fg: 'var(--ink-3)', bg: 'var(--sunken)' },
  user: { fg: 'var(--ink-2)', bg: 'var(--sunken)' },
};

export function ProvenanceTag({ provenance }: { provenance?: Provenance }) {
  const p = provenance ?? 'estimated';
  const meta = PROVENANCE[p];
  const tone = TONE[p];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ color: tone.fg, background: tone.bg }}
      title={meta.meaning}
    >
      {meta.label}
    </span>
  );
}

/** The fuller version, for the panel where someone is about to log something. */
export function ProvenanceNote({ food }: { food: FoodItem }) {
  const p = (food.provenance ?? 'estimated') as Provenance;
  const meta = PROVENANCE[p];
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceTag provenance={p} />
        {typeof food.kcalSe === 'number' && food.kcalSe > 0 && (
          <Chip glyph="±">
            {/* The only genuinely measured uncertainty in the whole catalogue:
                the spread IFCT reports across its own samples. */}
            samples varied by about {Math.round(food.kcalSe)} kcal per 100 g
          </Chip>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-3)]">{meta.meaning}</p>
      {meta.source && (
        <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">
          {meta.source}
          {meta.url && (
            <>
              {' '}
              <a
                href={meta.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                <Icon name="ExternalLink" size={10} /> source
              </a>
            </>
          )}
        </p>
      )}
      {food.altPortions && food.altPortions.length > 1 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          Other portions: {food.altPortions.slice(1).map((p2) => `${p2.label} ≈ ${p2.grams} g`).join(', ')}.
          Those weights are estimates — the composition figures above are per 100 g, which is what
          was actually measured.
        </p>
      )}
    </div>
  );
}
