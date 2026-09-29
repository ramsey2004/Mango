# Mango — Personal Operating System

A personal command centre built around one question: **what matters most right now?**

React + TypeScript + Vite + Tailwind + Framer Motion. All data lives in IndexedDB on the
device — nothing is sent anywhere unless you connect an AI endpoint yourself.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # → dist/         normal build, PWA-installable when hosted
npm run preview    # serve the build locally

SINGLE=1 npm run build   # → dist-single/index.html — one self-contained file,
                         #   openable from disk, hostable anywhere
```

`npm run typecheck` runs TypeScript with no emit.

## Deploy (this is what makes it installable on your phone)

A PWA needs HTTPS and a real origin — `file://` will not do. Any static host works:

- **Netlify / Vercel / Cloudflare Pages** — drag the `dist/` folder onto their deploy page.
- **GitHub Pages** — push `dist/` to a `gh-pages` branch.

Then on the phone: open the URL, **Share → Add to Home Screen** (iOS) or
**⋮ → Install app** (Android). It opens full-screen, works offline, and keeps its own data.

---

## What is in here

```
src/
  lib/         types, date/format helpers, IndexedDB persistence, seed + demo data
  store/       the single-document store (useSyncExternalStore), all mutations, undo/redo
  engine/      priority scoring · assistant reasoning · day planner ·
               natural-language capture · the AI seam
  components/  design tokens as components: panels, fields, charts, the orb
  features/    one file per view
```

### The priority engine

Every task carries importance, impact, strategic relevance, effort, a deadline, a status and
dependencies. The engine turns those into a score as a **sum of named contributions**, so the
assistant can always show its working — open any task and expand *Priority score* to see the
breakdown. A per-task manual adjustment overrides it. The engine advises; you decide.

Seasons (Settings → Seasons) multiply whole areas of life for a date range — "placement
season" can lift Career 1.6× and damp Shopping to 0.6× without touching a single task.

### The assistant

Answers about your own records are computed **locally**, with no model: what to do now, what
is overdue, what is due this week, what is falling behind, a realistic plan for the day, your
weekly review. It can also add, move and complete tasks from plain English.

Free-form questions need a language model, and Mango does not ship one. Settings → Assistant
takes any OpenAI-compatible endpoint; leave it blank and nothing ever leaves the device. When
nothing matches and no endpoint is set, the assistant says so rather than inventing an answer.

### Data

Stored in IndexedDB, mirrored to localStorage as a fallback for private-mode browsers.
Settings → Data exports and imports the whole workspace as JSON, removes just the demo data,
or resets everything. Clearing site data in the browser deletes it, so export a backup before
switching browsers.

---

## The nutrition module

Mango's second half is an AI nutrition coach, built to the strategy of a Marketing Management
project whose thesis is **contextual execution**: the best meal is not the most perfect one, it is
the one that fits your goal, your routine, your budget and the twenty minutes you actually have.

```
goal → calories left → macros left → time → budget → what is in your kitchen →
activity → what you ate recently → what you turned down before → a meal you will actually cook
```

**Onboarding** — eight short steps, value before data: goals and taste first, budget and kitchen
last. BMI and BMR compute live as you type.

**The energy engine** (`src/engine/calories.ts`) — Mifflin-St Jeor for BMR, a standard activity
multiplier for TDEE, then a bounded adjustment by goal: a deficit of 20% capped at 500 kcal, a
surplus capped at 350, and a hard floor (1,500 kcal for men, 1,200 for women) that the app will not
go below whatever the arithmetic says. Protein is set per kilo of bodyweight by goal, fat at 27% of
energy, carbohydrate takes the remainder.

**The recommender** (`src/engine/mealRecommender.ts`) — diet, allergies and restrictions are hard
filters; everything else is a weighted score whose every term is named, so the *Why this?* panel can
show the full arithmetic. It shares both calories and money across the meals still to come, chases
protein when protein is what is lagging, prefers what is already in your kitchen, and reports an
honest shortfall when the brief cannot be met rather than pretending it worked.

**The feedback loop** — rating a meal badly twice makes the engine drop that *ingredient*, not just
that dish. Swapping away from a meal records the rejection.

**The coach** (`src/engine/nutritionCoach.ts`) — answers from live state, with a safety layer in
front of it. It will not give medical advice, will not help with restriction or purging, and
declines pregnancy nutrition, pointing to a clinician in each case.

**Also included** — natural-language logging (rule-based, shows what it understood, waits for
confirmation), water and activity tracking, a consistency score built from five measured behaviours,
a grocery list grouped by aisle, Eat-Out Mode, Festival Mode, progress charts, and the pricing page
from the plan.

### What is simulated, and labelled as such

| Feature | Status |
|---|---|
| Wearables (Apple Health, Google Fit, Noise, boAt) | Simulated. Generates labelled sample steps; sends and receives nothing. |
| Grocery carts (BigBasket, Blinkit, Zepto) | Simulated basket only. No request is made. |
| Lab / health records | Simulated. |
| Payments | **Not built.** The pricing page is real; there is no checkout, because a card form that always succeeds is a fake button. |
| Sign-up / login | **Not built.** There is no server; data is local and private by default. |
| Natural-language logging | Real, but rule-based — labelled "not a language model" in the UI. |
| Free-form coach questions | Real only if you connect your own endpoint in Settings → Assistant. |

### What would need a real API in production

A nutrition database under licence (IFCT or USDA) instead of a seeded table; HealthKit and Google Fit
SDKs; partner APIs from the grocery platforms; a payment gateway; and a backend if you ever want the
data on more than one device.

## Keyboard

| | |
|---|---|
| `⌘K` / `Ctrl-K` | command palette, search, natural-language capture |
| `⌘Z` / `⌘⇧Z` | undo / redo |
| `n` | new task · `f` focus mode |
| `d t w g p c a j` | dashboard, today, week, goals, projects, calendar, analytics, assistant |
| `Space` / `Esc` | in focus mode: start-pause / leave |

Natural-language capture understands things like
`Submit scholarship form friday high priority 45m #admin @career`.

---

## Known limits

- **One device, one browser.** There is no sync — that needs a server, which this does not
  have. Export/import is the bridge between devices.
- **Notifications fire only while the app is open.** True background notifications need a push
  server and a subscription; Mango deliberately has neither.
- **Drag and drop is pointer-based** (week planner, kanban, pipeline). On touch, use the row
  menu or the day picker instead.
- **Fonts load from Google Fonts.** Offline, the fallback stacks take over.

---

## What changed in this pass (nutrition-coach transformation)

**Nutrition is now the product, not a module.**
- The app opens on the nutrition Today screen; a new user lands straight in onboarding.
- Sidebar groups reordered: Nutrition → Assistant → Planner → Review. The productivity
  system is intact and reachable, it is just no longer the front door.
- Phone bottom bar is the execution loop: Today · Meals · Log · Grocery · Progress.
  The floating button is now *Ask the coach* — search moved to the top bar, where it
  already was on every screen.
- On a phone, today's plan is rendered above the macro rings. The question this screen
  exists to answer is "what do I eat", not "what are my macros".

**Goal tracks replace the condition track.**
Section 14 of the marketing plan explicitly rejects a condition-specific clinical
architecture in favour of three goal-based tracks. The app now matches it:
`ConditionTrack ('none' | 'diabetes' | 'weight' | 'fitness')` became
`GoalTrack ('wellness' | 'fat_loss' | 'muscle_gain')`, with a migration that maps old
saved documents over. Each track weights the recommender differently and for a real
reason — fat loss scores protein per calorie and fibre, muscle gain scores absolute
protein, wellness scores fibre and penalises fast-digesting meals. The meal cards now
show the number the user's own track actually uses, rather than a metric the engine is
ignoring today.

**Saved meals.** Bookmark any recipe from the browse grid or the recipe modal. A new
Saved tab holds saved, recently eaten and swapped-away recipes, and a swapped-away meal
can be brought back into circulation.

**Trust centre (`Your data`).** A dedicated view: where data lives, who can see it,
what is sold (nothing), and four granular consent switches — wearable, self-entered
activity, kitchen and grocery, body measurements. The switches are enforced in the
engine, not just the UI: turning off the kitchen genuinely stops the recommender using
your pantry, turning off wearables stops the simulated sync writing, turning off body
measurements hides the weight trend. It also lists, in plain words, the five things this
build cannot do, and lets you erase any category of data or export the lot as JSON.

**Responsive and accessibility fixes found by an automated sweep** at 320 / 375 / 390 /
430 / 768 / 1024 / 1280 / 1440 / 1920:
- Tab strips scroll sideways inside their own track instead of widening the page.
- Section headers wrap their actions below the title on narrow screens.
- Grocery rows reflow, with 40px tap areas around the tick and the remove control.
- Coarse-pointer minimum heights for buttons, chips, fields and switches.
- Calendar heat cells grow on touch screens when they are interactive.
- Top bar shrinks its padding and lets the search box collapse at 320px.

## Verification actually run

```
npx tsc --noEmit          # clean
npm run build             # clean
node qa-responsive.mjs    # 9 widths × 7 views → 0 layout problems, 0 console errors
node qa-journey.mjs       # 13/13 steps pass, 0 console errors
```

`qa-journey.mjs` walks the real journey: land → demo data → recommendation with a
reason → why-panel → swap → natural-language logging → grocery → progress and the
consistency score → coach answering from live state → save a meal and find it in Saved →
flip a consent switch → reload and confirm the data survived → service worker and
manifest served.

## Known limitations that genuinely remain

- Wearables, grocery platforms and health records are **simulated**, labelled as such
  in the UI, and write clearly-marked sample rows. Nothing is connected.
- There is **no payment system**. The plan toggle switches the in-app tier and takes no
  money. A checkout that pretended to succeed would be exactly the fake functionality
  this build avoids.
- Natural-language logging is a **rule-based parser**, not a language model, and says so
  on screen.
- **No sync and no account.** Everything is in IndexedDB in one browser. The data layer
  is a single document behind one interface, so a backend can be added without
  reshaping the model — but today there is none.
- The **AI seam** (`src/engine/ai.ts`) speaks to an OpenAI-compatible endpoint if one is
  configured. With no endpoint it falls back to the deterministic coach. No key is
  bundled and none is read from the frontend build.
- Recipe photography is **not** included — cards use emoji and typography. Licensed food
  photography is the one thing a code deliverable cannot honestly ship.
- The JS bundle is ~734 kB (209 kB gzipped) in one chunk. It loads fast locally but
  route-level code splitting is the obvious next optimisation.

---

## Second pass — the remaining brief items

**Pantry with quantities and expiry (§20).** The kitchen was a list of names.
It is now a list of items, each with an optional quantity and an optional
use-by date. Both are optional on purpose: someone who types four words and
stops still gets the full benefit. Where a date *is* given, the recommender
scores meals that use that ingredient higher than ordinary pantry overlap —
cooking what is about to spoil is the cheapest win available — and the Kitchen
tab surfaces an "About to go off" panel. Old saved documents migrate from the
plain string list without losing anything.

**Demo mode (§51).** The workspace now carries an explicit `demo` flag. While
it is set, a banner sits under the top bar on every screen saying the data is
sample data and none of it is the user's, with two ways out: clear it and start
fresh, or keep the records and drop the label. Nothing in an audience should
have to guess which rows are real.

**Nutrition widgets on the dashboard (§48).** Five new widget types — what to
eat next, calories and macros, consistency, grocery and activity — sit in the
same customiser as the rest, so they can be reordered, resized, hidden and
shown, and the arrangement is remembered. Three are on by default and lead the
dashboard, because nutrition is what this product reports on. Existing saved
dashboards gain the new widgets without losing the user's own arrangement.

**Code splitting (§33).** The single 734 kB chunk is gone. React, Framer Motion
and the icon set are now separate long-lived chunks, the nutrition home ships in
the entry chunk, and every other view loads on first open. App code in the entry
chunk went from 734 kB to 184 kB (209 kB → 56 kB gzipped).

That change created a real bug, which is worth recording because it is not
obvious: a lazily-loaded view is not on disk until it has been opened once, so
splitting the bundle quietly broke offline access to views the user had never
visited — and the entry chunks themselves were never cached either, because
they are fetched before the service worker takes control. Both are fixed. The
worker now reads `index.html` at install and precaches the hashed scripts and
stylesheets it references, and the app pulls the remaining chunks down on the
first idle moment after boot. Verified by an offline test that loads the app,
goes offline, opens four views it had not visited, and reloads the page.

### Verification for this pass

```
npx tsc --noEmit          # clean
npm run build             # clean, no chunk-size warning
SINGLE=1 npm run build    # single-file build still works
node qa-responsive.mjs    # 9 widths x 7 views -> 0 problems
node qa-journey.mjs       # 16/16 steps pass, 0 console errors
node qa-offline.mjs       # 4 unvisited views render offline; offline reload boots with data
```

---

## Phase 1 — the six defects, plus recipe depth

Six things were wrong. Each was verified in the source before being fixed.

**Costs were invented.** `estCost` was `recipe.costRupees / ingredients.length`, so every
item in a meal cost the same and "₹38 to finish this" was arithmetic wearing a price tag.
There is now an ingredient table (`src/lib/ingredient-db.ts`) with a per-unit price, a
quantity parser that understands "1/2 cup", "2 tbsp", "8" and "to taste", and recipe cost
is **summed** from it. The seeded figures are gone — what the app shows is derived, and
the grocery total can no longer disagree with the recipe.

**"curd" never matched "dahi".** Pantry matching was substring comparison. The same
ingredient table carries synonyms, so curd, dahi and yogurt are one thing, and so are
atta and whole wheat flour. Grocery lines now also drop anything already in your kitchen.

**Seven goals for three tracks.** `GoalKey` still carried `energy`, `consistency`,
`performance` and `maintenance` beside the three tracks the plan settled on. The track is
now the only thing that sets a calorie target — one number, one reason — and the rest
became optional secondary intents that shape recommendations and language but never the
number. Saved profiles migrate across.

**Training changed nothing.** `tdee()` was `bmr × activityFactor` and logged exercise
touched only the recommender. Targets are now computed for the day, crediting half of any
burn beyond what the activity level already assumes, capped at 400 kcal. The more useful
half of this is that when it does *not* adjust, it says why: *"you burned 416 kcal today,
which is inside the 510 your gym setting already builds in — nothing is added back, it
would be counting the same session twice."*

**The why-panel was a debug view.** It printed `label → +14 / −26 → Total`. It now leads
with a plain sentence, seven checks a person would actually make (time, budget, protein,
calories, kitchen, variety, diet) each with the real numbers, and the data it used. The
scoring table is still there, one tap down, because a claim you cannot inspect is not a
claim.

**Logging did not move the day.** Eating something big changed the totals and nothing
else. Logging now re-plans the slots still ahead of you and shows what moved and why.
Three real bugs surfaced while building it: an already-eaten meal could be silently
rewritten; the budget ignored what you had already spent; and the plan re-planned
breakfast at eight in the evening. The planner now also *drops* a slot when there is no
room left rather than inventing a 500 kcal dinner for someone with 80 kcal of headroom —
and it drops the snack before the dinner.

**Recipes: 32 → 114.** With execution metadata — where it can be cooked, what equipment
it needs, no-cook, occasion, satiety, portability. Kitchen compatibility is now a **hard
constraint**: a hostel profile sees 56 of 114 recipes rather than being offered a
forty-minute saag. The second and third batches were written against gaps a validator
measured, not by adding more of the same: quick lunches went 9 → 21, quick dinners 9 → 19,
high-protein snacks 6 → 15, and Bengali, Gujarati and Mughlai roughly doubled.

`scripts/validate-recipes.ts` checks every row: macros reconstruct the stated calories,
diet flags are internally consistent, every ingredient is priceable, no-cook rows are
actually quick, hostel rows declare equipment they can have. It reports **114 recipes, 0
problems**, and prints a coverage table so the next gap is visible rather than guessed.

### On provenance

These recipes are seed data written for this prototype from standard Indian home portions
and published composition tables. They are **not** dietitian-curated and **not**
chef-refined. The marketing plan treats that curation as work still to be commissioned,
and the app says so on the browse screen rather than implying it has happened.

### Verification for this phase

```
npx tsc --noEmit                              # clean
npm run build                                 # clean
node scripts/validate-recipes.ts (via esbuild) # 114 recipes, 0 problems
node qa-responsive.mjs                        # 9 widths x 7 views -> 0 problems
node qa-journey.mjs                           # 16/16 pass, 0 console errors
node qa-offline.mjs                           # 4 unvisited views render offline; reload boots with data
```

---

## Phase 2 — "What should I eat now?"

The audit's own conclusion was that this one screen would bring together almost every
strategic idea in the plan, and it was right. It is now the first item in the nutrition
nav and the phone's floating button.

Four questions — how long have you got, where are you, how hungry, what will you spend —
and then **one answer plus two named alternatives**. The alternatives are not "next best".
They answer the two reasons people reject a suggestion: it takes too long, and it costs
too much. So they are labelled *Faster* and *Cheaper*, each with the trade-off spelled
out: *"9 minutes quicker, but 8 g less protein"*, *"₹32 cheaper, and no slower"*.

Some decisions in `src/engine/eatNow.ts` worth knowing about, because they are where the
honesty lives:

- **Where you are overrides where you usually cook.** Say "no cooking" and the pool drops
  to no-cook rows regardless of your profile; say "eating out" and it switches entirely to
  the ordering guidance rows.
- **Your kitchen stops mattering when you are not in it.** Standing in a canteen queue,
  what is in your fridge is irrelevant, so the pantry bonus is switched off rather than
  quietly inflating the score.
- **A stated budget is a hard cap.** The day's budget is a scored preference; "under ₹50"
  is a thing you just said out loud, so nothing above it is offered. If nothing fits, it
  says so and shows the cheapest thing rather than pretending.
- **So is the time.** If nothing fits twelve minutes, the answer is "nothing here fits
  twelve minutes, here is the quickest thing" — not a forty-minute recipe presented as a
  recommendation.
- **The slot relaxes.** Recipes are tagged breakfast/lunch/snack/dinner, but nobody
  chooses a restaurant by slot. If the clock's slot has nothing, it widens to the nearest
  real meal rather than returning an empty answer on a technicality.

Every option carries the same seven checks as the why-panel, one tap down.

### Verification for this phase

```
npx tsc --noEmit          # clean
npm run build             # clean
node qa-responsive.mjs    # 0 problems
node qa-journey.mjs       # 17/17 pass, 0 console errors
node qa-offline.mjs       # unvisited views render offline; reload boots with data
```

The new journey step sets the question to two deliberately distant states and asserts the
answer actually moves — a screen that returns the same suggestion whatever you tell it is
the failure mode worth testing for.
