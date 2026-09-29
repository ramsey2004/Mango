import { useState } from 'react';
import type { Estimate } from '../../engine/health';
import { formatBand, confidenceLabel, SOURCES } from '../../engine/health';
import { Modal, Chip } from '../../components/ui';
import { Icon } from '../../components/Icon';

/* ============================================================
   "Why this number?"

   The resolution to the tension in an uncertainty-first engine:
   a page that answers everything with a range is more honest and
   less usable than one that answers with a number.

   So the point estimate stays in the interface and the band sits
   one tap behind it. Someone who never taps still gets a
   defensible figure; someone who does gets the truth, including
   which parts are evidence and which are the product's own
   judgement.
   ============================================================ */

const BASIS_WORD: Record<Estimate['basis'], string> = {
  'population-equation': 'Estimated from a published equation',
  'personal-data': 'Learned from your own logs',
  arithmetic: 'Calculated directly from what you entered',
  'rule-of-thumb': 'A rough estimate, not a measurement',
};

export function WhyNumber({
  label,
  estimate,
  unit,
  extra,
}: {
  label: string;
  estimate: Estimate;
  unit?: string;
  /** anything specific to this number — the deficit reasoning, say */
  extra?: string;
}) {
  const [open, setOpen] = useState(false);
  const isRange = estimate.band[0] !== estimate.band[1];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* A real tap target: 17px of underlined text is not something anyone
           hits reliably on a phone. */
        className="inline-flex min-h-[34px] items-center gap-1 py-1 text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink-1)] underline decoration-dotted underline-offset-2"
      >
        <Icon name="Info" size={12} />
        Why this number?
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title={label}>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="num text-[30px] font-semibold">{estimate.value.toLocaleString('en-IN')}</span>
                {unit && <span className="text-[13px] text-[var(--ink-3)]">{unit}</span>}
              </div>
              {isRange && (
                <div className="mt-1 text-[13px] text-[var(--ink-2)]">
                  Realistically somewhere between{' '}
                  <span className="num font-semibold">{formatBand(estimate)}</span>
                  {unit ? ` ${unit}` : ''}.
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>{confidenceLabel(estimate)}</Chip>
                {!isRange && <Chip glyph="=">No estimation involved</Chip>}
              </div>
            </div>

            <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{estimate.why}</p>
            {extra && <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{extra}</p>}

            <div className="rounded-lg p-3" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
              <div className="text-[12.5px] font-semibold">{BASIS_WORD[estimate.basis]}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-3)]">
                {estimate.basis === 'population-equation'
                  ? 'Equations like this are built by measuring a group of people and fitting a formula. Applied to one person they carry real error — which is what the range above is.'
                  : estimate.basis === 'personal-data'
                    ? 'This comes from what you have actually eaten and weighed, so it describes you rather than an average. It gets tighter the longer you log.'
                    : estimate.basis === 'arithmetic'
                      ? 'This is just a calculation on numbers you entered, so it has no uncertainty of its own beyond how accurately you measured.'
                      : 'This is a rule of thumb. The range is deliberately wide because the underlying figure is not precise.'}
              </p>
            </div>

            {estimate.sources.length > 0 && (
              <section>
                <div className="label mb-1.5">Where this comes from</div>
                <ul className="flex flex-col gap-2.5">
                  {estimate.sources.map((k) => {
                    const c = SOURCES[k];
                    if (!c) return null;
                    const judgement = k === 'PRODUCT_JUDGEMENT';
                    return (
                      <li key={k} className="text-[12.5px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">{c.short}</span>
                          {judgement && <Chip glyph="!">Our choice, not evidence</Chip>}
                        </div>
                        <div className="text-[var(--ink-3)]">{c.what}</div>
                        <p className="mt-0.5 leading-relaxed text-[var(--ink-2)]">{c.finding}</p>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-[11.5px]"
                            style={{ color: 'var(--accent)' }}
                          >
                            <Icon name="ExternalLink" size={11} /> Read the source
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <p className="text-[11.5px] leading-relaxed text-[var(--ink-3)]">
              Mango is not a medical device and none of this is a diagnosis. These are the best estimates
              that can be made from what you have told it, with the uncertainty shown rather than hidden.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
