import type { IfctRow } from './ifct.generated';

/* ============================================================
   Household portions.

   IFCT publishes composition per 100 g and no serving weights,
   so there is no measured portion size to carry across. Rather
   than invent one per food, every measured food is logged per
   100 g by default — which is the source's own basis and
   involves no assumption at all.

   The measures below are a convenience on top of that, and each
   one states the rule it came from. They are estimates and are
   labelled as estimates in the interface. A "katori" is not a
   defined unit; the 150 ml figure is the standard serving bowl
   used in Indian dietary guidance, and the gram weights follow
   from the rough density of the food class rather than from any
   measurement of a particular dish.
   ============================================================ */

export interface Portion {
  label: string;
  grams: number;
  /** why this weight and not another — shown on the portion picker */
  basis: string;
}

/** The default, and the only portion involving no assumption. */
export const PER_100G: Portion = {
  label: '100 g',
  grams: 100,
  basis: 'The basis the composition table itself uses. No conversion applied.',
};

type Group = IfctRow[2];

/* One rule per food class. Volumes: katori 150 ml, cup 200 ml, glass 200 ml —
   the standard measures used in Indian dietary guidance. Weights follow from
   the approximate bulk density of the class, which is why they are round
   numbers and why they are called estimates. */
const BY_GROUP: Record<string, Portion[]> = {
  grain: [
    { label: '1 katori, cooked', grams: 150, basis: 'A 150 ml katori of a cooked grain, which is roughly 150 g.' },
    { label: '1 cup, uncooked', grams: 180, basis: 'A 200 ml cup of dry grain packs to about 180 g.' },
  ],
  legume: [
    { label: '1 katori, cooked', grams: 150, basis: 'A 150 ml katori of cooked dal, which is roughly 150 g.' },
    { label: '1 cup, uncooked', grams: 190, basis: 'A 200 ml cup of dry pulses packs to about 190 g.' },
  ],
  vegetable: [
    { label: '1 katori', grams: 100, basis: 'A 150 ml katori of chopped vegetable, which sits loosely at about 100 g.' },
    { label: '1 medium piece', grams: 120, basis: 'A rough middle for a hand-sized vegetable. Weigh it if the number matters.' },
  ],
  fruit: [
    { label: '1 medium fruit', grams: 130, basis: 'A rough middle across common fruit. Weigh it if the number matters.' },
    { label: '1 katori, chopped', grams: 120, basis: 'A 150 ml katori of chopped fruit, which sits at about 120 g.' },
  ],
  nut: [{ label: 'a small handful', grams: 25, basis: 'A closed handful of nuts or seeds runs 20–30 g.' }],
  spice: [{ label: '1 teaspoon', grams: 5, basis: 'A level 5 ml teaspoon of a ground spice is about 5 g.' }],
  fat: [
    { label: '1 teaspoon', grams: 5, basis: 'A 5 ml teaspoon of oil or ghee weighs about 5 g.' },
    { label: '1 tablespoon', grams: 14, basis: 'A 15 ml tablespoon of oil or ghee weighs about 14 g.' },
  ],
  dairy: [
    { label: '1 glass', grams: 200, basis: 'A 200 ml glass of milk weighs about 200 g.' },
    { label: '1 katori', grams: 150, basis: 'A 150 ml katori of curd weighs about 150 g.' },
  ],
  egg: [{ label: '1 egg', grams: 50, basis: 'A grade-2 hen egg without shell is about 50 g.' }],
  meat: [{ label: '1 serving', grams: 100, basis: 'A palm-sized portion of cooked meat is roughly 100 g.' }],
  fish: [{ label: '1 serving', grams: 100, basis: 'A palm-sized portion of cooked fish is roughly 100 g.' }],
  sugar: [{ label: '1 teaspoon', grams: 5, basis: 'A level 5 ml teaspoon of sugar is about 5 g.' }],
  other: [],
};

/** Named overrides, where the class rule is plainly wrong for one food. */
const BY_NAME: Record<string, Portion[]> = {
  'ifct_l002': [{ label: '1 medium banana', grams: 100, basis: 'A medium banana without skin is about 100 g.' }],
};

export function portionsFor(id: string, group: string): Portion[] {
  return [PER_100G, ...(BY_NAME[id] ?? BY_GROUP[group] ?? [])];
}
