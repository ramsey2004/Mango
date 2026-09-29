import { ADAPTIVE } from './constants';
import { estimate, type Estimate } from './uncertainty';

/* ============================================================
   Learning maintenance from the user's own data.

   This is the only part of the engine that can beat a population
   equation, because it stops predicting and starts measuring.
   Over a period, energy balance gives maintenance directly:

     maintenance ≈ mean intake − (Δweight × energy per kg) / days

   Four safeguards, each answering a specific way this goes wrong.

   Weight is smoothed with an EWMA before any of this, because
   day-to-day scale readings are mostly water and gut content and
   a raw start-to-end difference would let one heavy dinner move
   somebody's calorie target.

   The energy-per-kg prior is NOT treated as fact. 7,700 kcal/kg
   is the 3,500-per-pound rule in metric dress, and that rule is
   known to over-predict weight loss because it ignores
   adaptation. It is a starting assumption that the observed data
   is allowed to overrule as it accumulates.

   The result is blended with the equation rather than replacing
   it, with the blend moving only as far as the data earns.

   And recalibration is rate-limited, so a bad fortnight of
   logging cannot halve a target.
   ============================================================ */

export interface DayRecord {
  /** yyyy-mm-dd */
  date: string;
  /** kcal logged that day, or null if the user did not log */
  intake: number | null;
  /** scale weight that morning, or null */
  weightKg: number | null;
}

export interface TrendPoint { date: string; kg: number }

/**
 * Exponentially-weighted weight trend. A ~10-day half-life is the usual
 * treatment: responsive enough to catch a real change within a fortnight,
 * damped enough that a single reading moves it very little.
 */
export function weightTrend(days: DayRecord[]): TrendPoint[] {
  const alpha = 1 - Math.pow(0.5, 1 / ADAPTIVE.trendHalfLifeDays);
  const out: TrendPoint[] = [];
  let ewma: number | null = null;
  for (const d of days) {
    if (d.weightKg === null || !Number.isFinite(d.weightKg)) continue;
    ewma = ewma === null ? d.weightKg : ewma + alpha * (d.weightKg - ewma);
    out.push({ date: d.date, kg: Math.round(ewma * 100) / 100 });
  }
  return out;
}

export interface AdaptiveResult {
  /** null when there is not enough data to say anything */
  observedMaintenance: number | null;
  /** the blended figure to actually use */
  maintenance: Estimate;
  daysOfData: number;
  loggedDays: number;
  weighIns: number;
  /** why it is not learning yet, when it is not */
  blockedBy?: string;
  /** kg/week from the smoothed trend, not from the raw endpoints */
  trendKgPerWeek: number | null;
}

export function adaptiveMaintenance(
  days: DayRecord[],
  equationEstimate: Estimate,
  opts: { daysIntoDeficit?: number; previousEstimate?: number } = {},
): AdaptiveResult {
  const loggedDays = days.filter((d) => d.intake !== null && Number.isFinite(d.intake)).length;
  const trend = weightTrend(days);
  const weighIns = trend.length;
  const daysOfData = days.length;

  const notYet = (why: string): AdaptiveResult => ({
    observedMaintenance: null,
    maintenance: equationEstimate,
    daysOfData,
    loggedDays,
    weighIns,
    blockedBy: why,
    trendKgPerWeek: null,
  });

  if (daysOfData < ADAPTIVE.minDays) {
    return notYet(`Mango needs about ${ADAPTIVE.minDays} days before it can work this out from your own data. ${daysOfData} so far.`);
  }
  if (loggedDays < ADAPTIVE.minLoggedDays) {
    return notYet(`${loggedDays} days logged out of the ${ADAPTIVE.minLoggedDays} needed. Gaps make the arithmetic unreliable rather than just noisy.`);
  }
  if (weighIns < ADAPTIVE.minWeighIns) {
    return notYet(`${weighIns} weigh-ins so far; ${ADAPTIVE.minWeighIns} are needed to see a trend rather than a reading.`);
  }
  if ((opts.daysIntoDeficit ?? Infinity) < ADAPTIVE.suppressFirstDaysOfDeficit) {
    return notYet('Early in a deficit the scale mostly shows glycogen and water, not fat. Mango waits a fortnight before reading anything into it.');
  }

  const first = trend[0];
  const last = trend[trend.length - 1];
  const spanDays = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86400000);
  const deltaKg = last.kg - first.kg;
  const trendKgPerWeek = Math.round((deltaKg / spanDays) * 7 * 100) / 100;

  const meanIntake =
    days.filter((d) => d.intake !== null).reduce((s, d) => s + (d.intake as number), 0) / loggedDays;

  const observed = meanIntake - (deltaKg * ADAPTIVE.energyPerKgPrior) / spanDays;

  /* The blend. Weight rises with days of data and is capped, so the equation
     never disappears entirely — the observed figure carries its own error,
     and one unusually well-logged month is not proof. */
  const w = Math.min(
    ADAPTIVE.maxObservedWeight,
    (daysOfData / ADAPTIVE.fullWeightAtDays) * (loggedDays / daysOfData),
  );
  let blended = w * observed + (1 - w) * equationEstimate.value;

  /* Rate limit: a recalibration may not move the working number far. */
  if (opts.previousEstimate && Number.isFinite(opts.previousEstimate)) {
    const maxMove = opts.previousEstimate * ADAPTIVE.maxMovePerRecalibration;
    blended = Math.max(
      opts.previousEstimate - maxMove,
      Math.min(opts.previousEstimate + maxMove, blended),
    );
  }

  /* The band narrows as the data accumulates, but it is derived from the
     spread of the observation, not asserted. */
  const residual = Math.abs(observed - equationEstimate.value);
  const half = Math.max(60, Math.round(residual * (1 - w) + 80 * (1 - w)));

  const confidence = w >= 0.5 ? 'good' : w >= 0.25 ? 'moderate' : 'low';

  return {
    observedMaintenance: Math.round(observed),
    maintenance: estimate(blended, {
      band: [blended - half, blended + half],
      basis: 'personal-data',
      confidence,
      why: `From ${loggedDays} days of your logs and your weight trend over ${Math.round(spanDays)} days, blended with the population estimate. Your own data is carrying ${Math.round(w * 100)}% of this and that share grows as you keep logging.`,
      sources: ['HALL_2013'],
    }),
    daysOfData,
    loggedDays,
    weighIns,
    trendKgPerWeek,
  };
}

/** What to say about the rate, once there is a rate. Never a prediction. */
export function rateSentence(trendKgPerWeek: number | null): string {
  if (trendKgPerWeek === null) {
    return 'Mango will tell you your actual rate of change once it has about three weeks of weight data. It will not predict one before then — the usual rule for turning calories into kilos is known to over-promise.';
  }
  const abs = Math.abs(trendKgPerWeek);
  if (abs < 0.1) return 'Your weight has been roughly steady over this period.';
  const dir = trendKgPerWeek < 0 ? 'down' : 'up';
  return `Your smoothed trend is ${dir} about ${abs.toFixed(2)} kg a week. That is measured from your own weigh-ins, not predicted from your calorie target.`;
}
