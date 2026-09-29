# Where Mango's food numbers come from

Every nutrition figure in the app traces back to one of four things. This
document says which, what it is licensed under, and what is missing.

## 1. Measured — Indian Food Composition Tables 2017

**539 entries.** Published by the National Institute of Nutrition (ICMR),
Hyderabad. Foods sampled across Indian regions and analysed in a laboratory.
Values are per 100 g, exactly as published.

Mango vendors the tables from the `@ifct2017/compositions` npm package, which
is MIT-licensed by its packager (Subhajit Sahu) and ships the data as CSV. A
copy lives at `vendor/ifct2017/compositions.csv` with its licence, and
`scripts/data-build/build-ifct.mjs` regenerates `src/data/ifct.generated.ts`
from it.

**One caveat worth stating plainly.** The MIT licence covers the packager's
compilation. The underlying tables are ICMR-NIN's publication, and their terms
for redistribution are not something this project has confirmed. Before Mango
ships commercially, that should be checked with NIN directly. It is a
licensing question, not a data-quality one — the figures themselves are the
best available for Indian food.

Three things the build does to this data, all recorded in
`scripts/data-build/ifct-flags.json`:

- **Energy filled for the pure fats.** IFCT leaves the energy column blank for
  oils and ghee, which are 100% fat and nothing else. Read straight, every one
  of the fourteen arrives as 0 kcal and silently under-counts every dish that
  contains one. Where energy is absent and fat is ~100 g, energy is filled from
  the standard 9 kcal/g factor. Fourteen rows.
- **Minerals converted.** IFCT states minerals in grams per 100 g. Read as
  milligrams, bajra's calcium came out as 0 instead of 27 mg.
- **Sampled varieties collapsed.** IFCT samples seventeen brinjals and seven
  green chillies separately. The source publishes an "all varieties" row for
  each, so that row is what the catalogue uses and the twenty-eight individual
  samples stay in the file but out of search. Counting them separately would
  have inflated the total with variations that mean nothing to someone logging
  dinner.

## 2. Calculated — dishes built from measured ingredients

**174 entries.** A dish is stored as a recipe — ingredient names and gram
weights for the whole pot, how many it serves, and a yield factor for what
cooking does to the weight. The nutrition is arithmetic over section 1, done
at build time. Nothing is scaled to a target and nothing is rounded to a
pleasing number.

Two parts of a calculated dish are assumptions rather than measurements: the
recipe itself, and the yield factor. That is why these are labelled
*Calculated* and never *Measured*.

An ingredient name that does not resolve fails the build. A dish cannot
quietly cost zero because a word was misspelled.

## 3. Estimated — the two weak spots

**308 entries**, of two kinds.

**Foods outside IFCT** (`src/data/supplementary.ts`, 30 ingredients). IFCT is a
table of Indian foods as grown and sold, so it has no curd, butter, oats,
sugar, bread, cheese, pasta or tea. A recipe that skipped them would
under-count, so they are here with commonly published figures — figures this
project has *not* traced to a source it has read. Any dish containing one of
these is demoted from *Calculated* to *Estimated* automatically, however
measured the rest of its ingredients are. Ingredients that contribute nothing
(salt, baking soda) do not trigger the demotion.

**This list is the weakest data in the app** and the first thing that should be
replaced.

**The original seed data** (60 foods and 114 recipes). Honest guidance figures
from the previous build, never traced to a source. They stay because they are
useful and because deleting working entries was out of scope, but they are
labelled estimated and they lose to a measured entry of the same food.

## 4. Yours — foods the user enters

Labelled as the user's own, and as accurate as what they typed.

---

## What is missing, and why

Two obvious sources are absent, and the reason is this build environment's
network policy rather than licensing:

- **Open Food Facts** (ODbL, free, no API key) is the right source for branded
  and packaged foods — Amul paneer, a specific brand of bread, protein bars.
  Its API host is not reachable from this sandbox.
- **USDA FoodData Central** (public domain) would add several thousand
  international and composite foods. Its API needs a key and its bulk download
  host is likewise unreachable here.

Both are legitimate to use and neither needs a commercial licence. On a machine
with ordinary internet access, an ingestion script for either would drop into
`scripts/data-build/` alongside the IFCT one and add thousands of entries
without touching a single component — the whole catalogue sits behind the
`FoodItem` type, and components never see anything else.

Until then, Mango has **no branded or packaged foods** and no barcode data.
That is a real gap, not a rounding error, and it is stated here rather than
papered over with invented brand figures.

## Reconciliation

The validation script reports every entry where the macros imply an energy
value more than 20% away from the stated one. It does **not** correct them.
Three rows currently flag, all from IFCT itself:

| Food | Stated | Macros imply |
| --- | ---: | ---: |
| Chicken, poultry, leg, skinless | 384 | 191 |
| Lemon, juice | 37 | 9 |
| Crab | 82 | 53 |

The chicken row looks like an error in the published table — 384 kcal per 100 g
is roughly double what a skinless chicken leg contains. Because chicken is one
of the most-logged foods in any tracker, every recipe here is costed against
**chicken breast**, whose numbers reconcile, and the leg row is left alone
rather than quietly rewritten. Correcting a published figure on our own
authority would be worse than flagging it.

## Regenerating

```
node scripts/data-build/build-ifct.mjs     # rebuild the generated IFCT module
npm run validate                           # includes the catalogue's own checks
```

The catalogue validation fails the build if fewer than 1,000 distinct,
complete, searchable entries survive.
