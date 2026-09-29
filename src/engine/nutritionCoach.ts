import type { NutritionState, MealSlot, Recipe } from '../lib/nutrition-types';
import { TRACK_LABEL } from '../lib/nutrition-types';
import { RECIPES, recipeById } from '../lib/recipe-db';
import { recommend, fromPantry, SLOT_SHARE, type Ctx, type Suggestion } from './mealRecommender';
import {
  consumedOn, remainingOn, targets, waterOn, burnedOn, trainedOn, budgetLeft,
  recentRecipeIds, consistency, currentSlot, SLOT_LABEL,
  pantryFor, expiringSoon,
} from './nutritionSelectors';
import { todayISO, toISODate, addDays, formatMins } from '../lib/util';

/* ============================================================
   The coach.

   It answers from live state — remaining calories, remaining
   protein, the clock, the budget, what is in the kitchen, what
   was eaten in the last few days, what was rejected before. Every
   number in a reply is read, not written by hand.

   A safety layer sits in front of everything. Some questions are
   not ours to answer.
   ============================================================ */

export interface CoachReply {
  text: string[];
  offers?: Suggestion[];
  safety?: boolean;
  action?: { kind: 'log' | 'plan' | 'grocery' | 'swap'; label: string };
}

export const QUICK_ACTIONS: Array<{ label: string; prompt: string; icon: string }> = [
  { label: 'What should I eat now?', prompt: 'what should I eat now', icon: 'Sparkles' },
  { label: "I'm hungry", prompt: 'i am hungry', icon: 'Flame' },
  { label: "I don't have ingredients", prompt: 'i have no ingredients', icon: 'Inbox' },
  { label: 'I ate something unhealthy', prompt: 'i ate something unhealthy', icon: 'Undo2' },
  { label: 'I want to eat out', prompt: 'i want to eat out', icon: 'Building2' },
  { label: 'Give me a 10-minute meal', prompt: 'give me a 10 minute meal', icon: 'Timer' },
  { label: 'Increase my protein', prompt: 'increase protein', icon: 'TrendingUp' },
  { label: "I'm travelling", prompt: 'i am travelling', icon: 'Plane' },
  { label: 'I have ₹150 left today', prompt: 'i have 150 rupees left today', icon: 'Wallet' },
  { label: 'Help me recover from yesterday', prompt: 'help me recover from yesterday', icon: 'RotateCcw' },
  { label: 'How am I doing?', prompt: 'how am i doing', icon: 'Gauge' },
];

/* ------------------------------ safety layer ------------------------------

   This runs before anything else and is deliberately written against the
   CONCEPT rather than the phrase. An earlier version matched literal strings
   like "vomit after", which meant "is it ok to throw up after a big meal"
   sailed straight past it and got answered with a calorie budget. Adversarial
   rewording is the normal case, not an edge case, so the patterns below aim
   at what is being asked rather than how it happens to be typed.

   Over-blocking is a real failure too — an app that refuses "what should I eat
   now" is useless — so `scripts/../qa` keeps a list of ordinary questions that
   must still be answered, and both directions are tested.
   -------------------------------------------------------------------------- */

/* Note on the regexes below: they end WITHOUT a trailing \b. An earlier version
   wrote \b(pregnan|diabet|purg)\b, which cannot match "pregnant" or "purging" at
   all — the boundary has to fall between two word characters. Stems are matched
   from the left only, deliberately. */

const MEDICAL =
  /\b(insulin|metformin|thyroxin|levothyrox|statin|dosage|dose of|medicine|medication|tablet|pills?\b|prescri|diagnos|cure|reverse (my |the )?\w+|treatment|symptom|chemo|cancer|bp tablet|blood pressure|hba1c|cholesterol|thyroid|pcos|pcod|diabet|kidney|liver problem|ibs\b|crohn|celiac|coeliac)|\b(fix|control|cure|reverse|manage)\b[^.?!]{0,20}\b(my )?(sugar|bp|thyroid|cholesterol|pressure)\b/i;

const PREGNANCY =
  /\b(pregnan|expecting a|trimester|breastfeed|breast-feed|nursing (my |a )?(baby|infant)|lactat|weeks? along|conceiv|ivf\b|post ?partum)/i;

/* Disordered eating and compensatory behaviour, at the level of the idea. */
const PURGING = /\b(purg|vomit|throw(ing)? up|threw up|make myself sick|bring it back up|laxativ|diuretic|water pill|toilet after eating|chew and spit)/i;

const STARVING =
  /\b(starv|not eat(ing)? (for|at all|anything)|stop eating|eat nothing|nothing (all|the whole) day|(only|just) (have )?(black )?(coffee|water|tea)\b|nothing else (till|until|all)|skip (all|every) meals?|survive on|lowest calorie|how little can i eat|as little as possible|appetite suppress|suppress my appetite|kill my appetite|not hungry so i)/i;

/* "800 calories a day", "under 1000 kcal" — any very low intake, however phrased. */
const LOW_CAL = /\b([1-9]\d{0,2})\s*(k?cal|calories|calorie)\b/i;

/* "lose 10 kg in 3 weeks", "drop 8 kilos before the wedding in 12 days". */
const RAPID_LOSS =
  /\b(lose|drop|shed|cut)\b[^.?!]{0,40}?\b(\d+(\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|pounds?|lbs?)\b[^.?!]{0,40}?\b(in|within|before|by)\b[^.?!]{0,30}?\b(\d+|a|one|two|three|four)\s*(day|days|week|weeks|fortnight)\b/i;

/* Compensating for having eaten — the behaviour, not the words. */
const COMPENSATE =
  /\b(make up for (it|that|eating|the)|burn (it|that) off|undo (it|that|the damage)|punish myself|earn (my|it)|compensate for (eating|the))/i;

/* Distress about the body, which is not a nutrition question. */
const DISTRESS =
  /\b(hate my body|disgusting after eating|feel disgusting|want to disappear|hate myself|guilty after eating|ashamed of (my|how i))/i;

const EXTREME_FAST = /\b(fast(ing)? for (\d+|one|two|three|four|five|six|seven)\s*(day|days)|omad\b|one meal (a|every) (day|two days)|dry fast|once every (two|three|\d+) days)/i;

/** True when a stated calorie figure is dangerously low rather than incidental. */
function asksForVeryLowCalories(q: string): boolean {
  if (!/calor|kcal/i.test(q)) return false;
  for (const m of q.matchAll(new RegExp(LOW_CAL, 'gi'))) {
    const v = Number(m[1]);
    // Below 1,000 kcal a day is not a diet an app should help design.
    if (Number.isFinite(v) && v > 0 && v < 1000 && /\b(day|daily|a day|per day)\b/i.test(q)) return true;
  }
  return false;
}

const HELP_LINE =
  'If your relationship with food or with your body has been hard lately, that is worth talking to someone about — a doctor, a registered dietitian, or a counsellor. In India, the National Alliance for Eating Disorder helpline and the Vandrevala Foundation (1860 266 2345) both take calls.';

function safetyCheck(q: string): CoachReply | null {
  /* Highest risk first: anything about purging, starving, punishing, or losing
     weight at a rate that would require one of those. */
  if (
    PURGING.test(q) || STARVING.test(q) || COMPENSATE.test(q) || DISTRESS.test(q) ||
    EXTREME_FAST.test(q) || RAPID_LOSS.test(q) || asksForVeryLowCalories(q)
  ) {
    return {
      safety: true,
      text: [
        'I am not going to help with that, and I want to be straight about why: what you have described would do you harm, and the fact that it feels like the answer right now is itself worth paying attention to.',
        HELP_LINE,
        'If you want, I can help with something ordinary instead — a plan for tomorrow that you could actually keep, or a way to get more protein into the food you already like.',
      ],
    };
  }

  if (PREGNANCY.test(q)) {
    return {
      safety: true,
      text: [
        'Nutrition during pregnancy or breastfeeding needs proper clinical input — energy and micronutrient needs change in ways a general app should not guess at.',
        'Please speak to your obstetrician or a registered dietitian, and use whatever targets they set rather than the ones calculated here.',
      ],
    };
  }

  if (MEDICAL.test(q)) {
    return {
      safety: true,
      text: [
        'That is a medical question, and I am a nutrition app — I cannot diagnose anything, advise on medication, or claim that food will treat a condition.',
        'Please take it to a qualified healthcare professional. If it helps, I can put together a summary of what you have logged that you can show them.',
      ],
    };
  }
  return null;
}

/* -------------------------------- the coach ------------------------------- */

function buildCtx(n: NutritionState, slot: MealSlot, overrides: Partial<Ctx> = {}): Ctx | null {
  if (!n.profile) return null;
  const t = targets(n)!;
  const left = remainingOn(n);
  const proteinUrgency = Math.min(
    2.2,
    Math.max(0.6, Math.max(0, left.protein) / Math.max(1, t.protein) / Math.max(0.15, Math.max(0, left.kcal) / Math.max(1, t.kcal))),
  );
  return {
    profile: n.profile,
    slot,
    proteinUrgency,
    remaining: remainingOn(n),
    slotShare: SLOT_SHARE[slot] / Object.values(SLOT_SHARE).reduce((a, b) => a + b, 0) * 1.4,
    budgetLeft: budgetLeft(n),
    minutesAvailable: n.profile.typicalCookMins,
    pantry: pantryFor(n),
    useSoon: expiringSoon(n, 3).map((p) => p.name),
    trainedToday: trainedOn(n),
    recentRecipeIds: recentRecipeIds(n),
    feedback: n.feedback,
    rejected: n.rejected,
    ...overrides,
  };
}

const kcalPhrase = (n: number) => (n > 0 ? `${n} kcal` : `${Math.abs(n)} kcal over`);

export function coachReply(input: string, n: NutritionState): CoachReply {
  const q = input.toLowerCase().trim();

  const safe = safetyCheck(q);
  if (safe) return safe;

  if (!n.profile) {
    return { text: ['Finish the short setup first — without your height, weight, goal and budget I would just be guessing, and a guess is worth nothing here.'] };
  }

  const t = targets(n)!;
  const eaten = consumedOn(n);
  const left = remainingOn(n);
  const slot = currentSlot();
  const trained = trainedOn(n);
  const burned = burnedOn(n);
  const money = budgetLeft(n);

  /* ---------------------------- money constraint --------------------------- */
  const moneyMatch = q.match(/(?:₹|rs\.?\s*|rupees?\s*)?(\d{2,4})\s*(?:rupees|rs|₹)?\s*left/);
  if (moneyMatch || /budget|cheap|afford|paisa|money/.test(q)) {
    const cap = moneyMatch ? Number(moneyMatch[1]) : money;
    const ctx = buildCtx(n, slot, { budgetLeft: cap })!;
    const offers = recommend(ctx, RECIPES.filter((r) => r.costRupees <= cap), 4);
    return {
      text: offers.length
        ? [
            `With ₹${cap}${left.kcal > 0 ? ` and ${left.kcal} kcal still to eat` : ' (and already at your calorie target)'}, these work:`,
            `Cheapest that still gets you protein: ${offers[0].recipe.name} at ₹${offers[0].recipe.costRupees}, ${offers[0].recipe.protein} g protein.`,
          ]
        : [`Nothing in the recipe list comes in under ₹${cap} for this meal. Dal with rice or roti is almost always the cheapest complete option — log it manually and I will count it.`],
      offers,
    };
  }

  /* --------------------------- no ingredients ------------------------------ */
  if (/no ingredient|don.?t have|nothing (at home|in the (kitchen|fridge))|empty fridge/.test(q)) {
    const kitchen = pantryFor(n);
    const matches = kitchen.length ? fromPantry(n.profile, kitchen) : [];
    if (matches.length) {
      const best = matches[0];
      return {
        text: [
          `You listed ${kitchen.join(', ')}. From that you can make ${best.recipe.name}${best.missing.length ? `, missing only ${best.missing.join(', ')}` : ' with nothing else needed'}.`,
          `${best.recipe.kcal} kcal, ${best.recipe.protein} g protein, ${best.recipe.prepMins} minutes.`,
        ],
        offers: [{ recipe: best.recipe, score: 0, reasons: [{ label: `Uses ${best.have.join(', ')} from your kitchen`, delta: 0 }], usesFromPantry: best.have }],
      };
    }
    const ctx = buildCtx(n, slot, { minutesAvailable: 10 })!;
    return {
      text: [
        'Your kitchen list is empty, so I have nothing to work from.',
        'Add what you actually have under "What is in your kitchen" and I will build around it. In the meantime, here is what needs the least shopping:',
      ],
      offers: recommend(ctx, RECIPES.filter((r) => r.ingredients.length <= 4), 3),
      action: { kind: 'plan', label: 'Update my kitchen' },
    };
  }

  /* ------------------------------- quick meal ------------------------------ */
  const minsMatch = q.match(/(\d{1,3})\s*[- ]?min/);
  if (minsMatch || /quick|fast meal|no time|in a hurry/.test(q)) {
    const mins = minsMatch ? Number(minsMatch[1]) : 15;
    const ctx = buildCtx(n, slot, { minutesAvailable: mins })!;
    const offers = recommend(ctx, RECIPES.filter((r) => r.prepMins <= mins), 4);
    return {
      text: offers.length
        ? [`Under ${mins} minutes, and still ${offers[0].recipe.protein} g of protein: ${offers[0].recipe.name}.`]
        : [`Nothing in the list cooks in ${mins} minutes. Curd with roasted chana, or a glass of milk with fruit, takes two — log it as a quick add.`],
      offers,
    };
  }

  /* ------------------------------- protein --------------------------------- */
  if (/protein/.test(q)) {
    const ctx = buildCtx(n, slot)!;
    const offers = recommend(ctx, RECIPES.filter((r) => r.protein >= 22), 4);
    const perKg = Math.round((t.protein / n.profile.weightKg) * 10) / 10;
    return {
      text: [
        `Your target is ${t.protein} g a day — about ${perKg} g per kilo, which is what ${TRACK_LABEL[n.profile.track]} needs.`,
        `You have had ${eaten.protein} g, so ${Math.max(0, left.protein)} g is still to come.`,
        left.protein > 40
          ? 'That is a lot to leave to dinner. The cheapest fixes are curd, roasted chana, soya chunks and eggs.'
          : 'That is comfortably within one meal.',
      ],
      offers,
    };
  }

  /* ------------------------------- eating out ------------------------------ */
  if (/eat out|restaurant|order|swiggy|zomato|outside food/.test(q)) {
    return {
      text: [
        `You have ${kcalPhrase(left.kcal)} and ${Math.max(0, left.protein)} g protein left, so eating out is entirely affordable today.`,
        'Order the thing that is grilled, baked or tandoori rather than the thing in gravy — that single swap is usually worth 200–300 kcal.',
        'Ask for the roti rather than the naan, take the dal over the paneer makhani, and get a salad in first so you eat the main course slower.',
        'Open Eat-Out Mode for the full list by cuisine.',
      ],
      action: { kind: 'plan', label: 'Open Eat-Out Mode' },
    };
  }

  /* --------------------------- ate something bad --------------------------- */
  if (/unhealthy|binge|overate|cheat|too much|junk|guilt/.test(q)) {
    const over = left.kcal < 0;
    return {
      text: [
        over
          ? `You are ${Math.abs(left.kcal)} kcal past the target. In the context of a week, that is roughly ${Math.round((Math.abs(left.kcal) / t.kcal) * 100)}% of one day.`
          : `You are still ${left.kcal} kcal inside the target, so nothing needs undoing.`,
        'Do not skip the next meal to compensate — that is what turns one heavy meal into a pattern of restriction and rebound.',
        'Eat normally at the next meal, weight it towards protein and vegetables, and get a walk in if you can. That is genuinely the whole correction.',
      ],
      offers: recommend(buildCtx(n, slot)!, RECIPES.filter((r) => r.protein >= 20 && r.kcal <= 420), 3),
    };
  }

  /* ------------------------------ travelling ------------------------------- */
  if (/travel|train|flight|journey|on the road|outstation/.test(q)) {
    return {
      text: [
        'Travelling is where plans break, so keep it simple.',
        'Carry: theplas or khakhra, roasted chana, a fruit, and a bottle you actually refill. That covers a day without a single decision.',
        'On the platform or at the airport, the safest picks are idli, curd rice, a plain paratha with curd, or eggs — anything steamed or plainly cooked.',
        `Your target is ${t.kcal} kcal; if you land within a couple of hundred either side on a travel day, that is a win.`,
      ],
      offers: recommend(buildCtx(n, slot)!, RECIPES.filter((r) => r.tags.includes('travel-friendly') || r.tags.includes('portable') || r.tags.includes('no-cook')), 3),
    };
  }

  /* ------------------------------- recovery -------------------------------- */
  if (/recover|yesterday|back on track|restart|fell off/.test(q)) {
    const y = toISODate(addDays(new Date(), -1));
    const yEaten = consumedOn(n, y);
    return {
      text: [
        yEaten.kcal > 0
          ? `Yesterday you logged ${yEaten.kcal} kcal against a ${t.kcal} target, with ${yEaten.protein} g protein.`
          : 'Nothing was logged yesterday, so there is nothing to recover from as far as the data is concerned.',
        'Recovery is not a smaller target today. It is the same target, hit properly.',
        'Do three things: eat a real breakfast, get protein into every meal, and log everything even when it is unflattering. The logging is what rebuilds the habit.',
      ],
      action: { kind: 'plan', label: "Rebuild today's plan" },
    };
  }

  /* ------------------------------ how am I doing --------------------------- */
  if (/how am i doing|progress|on track|status|score/.test(q)) {
    const cons = consistency(n);
    const water = waterOn(n);
    return {
      text: [
        `Today: ${eaten.kcal} of ${t.kcal} kcal, ${eaten.protein} of ${t.protein} g protein, ${(water / 1000).toFixed(1)} of ${(n.waterGoalMl / 1000).toFixed(1)} litres of water.`,
        trained ? `You trained today — ${burned} kcal logged as activity.` : 'No activity logged today.',
        `Consistency over the last seven days: ${cons.score} out of 100. ${cons.message}`,
        cons.parts.filter((p) => p.value < p.max * 0.5).length
          ? `The weakest part is ${cons.parts.slice().sort((a, b) => a.value / a.max - b.value / b.max)[0].label.toLowerCase()} — that is where the easiest gain is.`
          : 'Nothing is obviously lagging.',
      ],
    };
  }

  /* ------------------------- what should I eat now ------------------------- */
  if (/what should i eat|hungry|suggest|recommend|dinner|lunch|breakfast|snack|meal/.test(q) || q.length < 4) {
    const asked: MealSlot =
      /breakfast/.test(q) ? 'breakfast' : /lunch/.test(q) ? 'lunch' : /dinner/.test(q) ? 'dinner' : /snack/.test(q) ? 'snack' : slot;
    const ctx = buildCtx(n, asked)!;
    const offers = recommend(ctx, RECIPES, 4);
    if (!offers.length) {
      return { text: ['Nothing in the recipe list clears your dietary constraints for this meal. Widen the constraints in your profile, or add a recipe of your own.'] };
    }
    const top = offers[0];
    const eatenNames = n.logs.filter((l) => l.date === todayISO()).map((l) => l.name);

    const lines = [
      left.kcal > 0
        ? `You have ${left.kcal} kcal and ${Math.max(0, left.protein)} g protein left for today.`
        : `You are ${Math.abs(left.kcal)} kcal past today's target${left.protein > 0 ? `, though still ${left.protein} g short on protein` : ''}. Eat something sensible rather than nothing.`,
      `${top.recipe.name} — ${top.recipe.kcal} kcal, ${top.recipe.protein} g protein, ${formatMins(top.recipe.prepMins)}, about ₹${top.recipe.costRupees}.`,
    ];
    const why = top.reasons.filter((r) => r.delta > 0).slice(0, 3).map((r) => r.label);
    if (why.length) lines.push(`Why this one: ${why.join('; ').toLowerCase()}.`);
    if (trained) lines.push(`You trained today, so I have weighted protein up.`);
    if (eatenNames.length) lines.push(`I have kept it different from what you have already eaten today (${eatenNames.slice(0, 3).join(', ')}).`);

    return { text: lines, offers };
  }

  /* ---------------------------- water and habits --------------------------- */
  if (/water|hydrat|drink/.test(q)) {
    const w = waterOn(n);
    return {
      text: [
        `${(w / 1000).toFixed(1)} litres so far against a ${(n.waterGoalMl / 1000).toFixed(1)} litre goal.`,
        w >= n.waterGoalMl ? 'Done for the day.' : `${Math.ceil((n.waterGoalMl - w) / 250)} more glasses gets you there.`,
      ],
    };
  }

  /* ------------------------------- fallback -------------------------------- */
  return {
    text: [
      'I could not map that to anything I can answer from your data, and I am not going to make something up.',
      'I can answer: what to eat now, how to hit your protein, what fits your budget or the time you have, what to do about eating out or travelling, how you are doing this week, and what to cook from what is in your kitchen.',
      'For anything freer than that, connect a model under Settings → Assistant.',
    ],
  };
}
