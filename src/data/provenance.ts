/* ============================================================
   Where a number came from.

   Every food in the catalogue carries one of these, and the
   logging screen shows it. The distinction that matters is not
   "good data" versus "bad data" — it is measured versus derived
   versus guessed, and a user is entitled to know which one they
   are looking at before they build a week around it.
   ============================================================ */

export type Provenance = 'verified' | 'computed' | 'estimated' | 'user';

export interface ProvenanceMeta {
  /** short word for a chip in the UI */
  label: string;
  /** one sentence a non-specialist can act on */
  meaning: string;
  /** where the underlying figures come from */
  source?: string;
  url?: string;
}

export const PROVENANCE: Record<Provenance, ProvenanceMeta> = {
  verified: {
    label: 'Measured',
    meaning:
      'Taken from a published food composition table — samples collected and analysed in a laboratory. The figures are per 100 g exactly as published.',
    source: 'Indian Food Composition Tables 2017, ICMR-National Institute of Nutrition',
    url: 'https://www.nin.res.in/ebooks/IFCT2017.pdf',
  },
  computed: {
    label: 'Calculated',
    meaning:
      'Worked out by adding up measured ingredients and allowing for what cooking does to the weight. The ingredients are measured; the recipe and the portion are assumptions, so this is close rather than exact.',
    source: 'Calculated from IFCT 2017 ingredients',
  },
  estimated: {
    label: 'Estimated',
    meaning:
      'A reasonable figure for a typical version of this dish, not a measurement of yours. Treat it as guidance — the real plate in front of you can differ by a quarter either way.',
  },
  user: {
    label: 'Yours',
    meaning: 'You entered these figures yourself, so they are as accurate as what you typed.',
  },
};

/** Ordering for search: measured data outranks a guess at the same relevance. */
export const PROVENANCE_RANK: Record<Provenance, number> = {
  verified: 3,
  computed: 2,
  estimated: 1,
  user: 4,
};
