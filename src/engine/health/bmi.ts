import { BMI_BANDS, WAIST } from './constants';
import { exact, type Estimate } from './uncertainty';

/* ============================================================
   BMI, and the measurement that carries more signal than BMI.

   The framework Mango follows was revised in 2024 into a staged
   definition in which Stage 2 obesity requires functional
   impairment or comorbidity in addition to a raised BMI. So BMI
   alone cannot say "obese", and this module will not: it returns
   a band, and separately reports whether the app has enough to
   say anything further.

   Waist is here because it answers the question BMI famously
   gets wrong. BMI cannot tell muscle from fat; a tape measure
   round the waist can, well enough, and Indian cut-offs for it
   are published.
   ============================================================ */

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export const bmi = (weightKg: number, heightCm: number): number => {
  if (!finite(weightKg) || !finite(heightCm)) return 0;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
};

/** BMI is arithmetic on two numbers the user gave us. It has no model error. */
export const bmiEstimate = (weightKg: number, heightCm: number): Estimate =>
  exact(
    bmi(weightKg, heightCm),
    'Your weight divided by your height squared. It is a screening number, not a diagnosis — it cannot tell muscle from fat.',
    ['INDIA_OBESITY_2024'],
  );

export interface BmiReading {
  value: number;
  label: string;
  tone: 'good' | 'warning' | 'critical' | 'info';
  /** shown under the band — never a diagnosis */
  context: string;
  /** what would let the app say more than a band */
  needed?: string;
}

export function bmiBand(value: number): BmiReading {
  if (!Number.isFinite(value) || value <= 0) {
    return { value: 0, label: '—', tone: 'info', context: 'Add your height and weight to see this.' };
  }
  const band = BMI_BANDS.find((b) => value < b.max) ?? BMI_BANDS[BMI_BANDS.length - 1];
  const tone: BmiReading['tone'] =
    band.label === 'Healthy range' ? 'good'
      : band.label === 'Below the healthy range' ? 'warning'
        : value >= 32.5 ? 'critical' : 'warning';

  return {
    value,
    label: band.label,
    tone,
    context:
      'These are the Indian cut-offs, which sit lower than the international ones because risk rises at a lower BMI in this population. BMI is a screening measure — on its own it does not diagnose anything.',
    needed:
      band.label === 'Healthy range' || band.label === 'Below the healthy range'
        ? undefined
        : 'A waist measurement would say more than BMI can on its own.',
  };
}

/* --------------------------------- waist --------------------------------- */

export interface WaistReading {
  waistCm: number;
  ratio: number;
  /** true when above the Indian abdominal-obesity cut-off for this sex */
  aboveCut: boolean;
  /** true when waist-to-height exceeds 0.5 */
  aboveRatio: boolean;
  label: string;
  context: string;
}

export function waistReading(
  waistCm: number,
  heightCm: number,
  sex: 'male' | 'female' | 'other',
): WaistReading | null {
  if (!finite(waistCm) || !finite(heightCm)) return null;
  const ratio = Math.round((waistCm / heightCm) * 100) / 100;
  /* For 'other' the lower of the two cut-offs is used, because under-flagging
     a risk marker is the worse error of the two. */
  const cut = sex === 'male' ? WAIST.maleCm : WAIST.femaleCm;
  const aboveCut = waistCm >= cut;
  const aboveRatio = ratio > WAIST.waistToHeight;

  return {
    waistCm,
    ratio,
    aboveCut,
    aboveRatio,
    label: aboveCut || aboveRatio ? 'Above the abdominal cut-off' : 'Within the usual range',
    context:
      aboveCut || aboveRatio
        ? `Indian guidance puts the cut-off at ${WAIST.maleCm} cm for men and ${WAIST.femaleCm} cm for women, or a waist-to-height ratio above ${WAIST.waistToHeight}. Yours is ${ratio}. This is worth a conversation with a doctor — it is not something an app should interpret further.`
        : `Waist-to-height ${ratio}, below the ${WAIST.waistToHeight} threshold. Where waist sits tells you more about risk than BMI does, because BMI cannot tell muscle from fat.`,
  };
}
