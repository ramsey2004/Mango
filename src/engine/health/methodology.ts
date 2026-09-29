import type { SourceKey } from './constants';

/* ============================================================
   The citation registry.

   Two jobs. It keeps every constant attributable, and it is what
   the "Why this number?" panel reads — so the evidence is part
   of the product rather than a comment only developers see.

   `claim` is written for a user, not for a journal. `finding` is
   what the source actually says, quoted closely enough that it
   can be checked.
   ============================================================ */

export interface Citation {
  key: SourceKey;
  short: string;
  what: string;
  finding: string;
  url?: string;
}

export const SOURCES: Record<SourceKey, Citation> = {
  FAO_2004: {
    key: 'FAO_2004',
    short: 'FAO/WHO/UNU, 2004',
    what: 'Human Energy Requirements — energy requirements of adults',
    finding:
      'Physical activity levels sustainable by free-living adults range from about 1.40 to 2.40: sedentary or light 1.40–1.69, active 1.70–1.99, vigorous 2.00–2.40. The report also warns that assigning one level to an individual over-simplifies real behaviour.',
    url: 'https://www.fao.org/4/y5686e/y5686e07.htm',
  },
  NICE_2025: {
    key: 'NICE_2025',
    short: 'NICE evidence review',
    what: 'Effectiveness of different diets in achieving and maintaining weight loss',
    finding:
      'A low-calorie diet is 800–1,200 kcal/day and requires a nutritionally complete formulation, specialist dietetic supervision and a 12-week maximum. The committee removed an earlier 600 kcal/day deficit recommendation as "an arbitrarily specific number".',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK612514/',
  },
  IOM_FIBRE: {
    key: 'IOM_FIBRE',
    short: 'IOM / NASEM Dietary Reference Intakes',
    what: 'Adequate Intake for dietary fibre',
    finding:
      '14 g per 1,000 kcal, derived from evidence on protection against coronary heart disease — about 25 g/day for women and 38 g/day for men.',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK559033/',
  },
  ISSN_PROTEIN: {
    key: 'ISSN_PROTEIN',
    short: 'ISSN Position Stand, 2017',
    what: 'Protein and exercise',
    finding:
      '1.4–2.0 g protein/kg/day is sufficient for most exercising individuals. Per dose, 0.25 g/kg or an absolute 20–40 g. Hypocaloric conditions are discussed at 1.6 g/kg and 2.4 g/kg.',
    url: 'https://link.springer.com/article/10.1186/s12970-017-0177-8',
  },
  MSJ_1990: {
    key: 'MSJ_1990',
    short: 'Mifflin & St Jeor, 1990',
    what: 'A new predictive equation for resting energy expenditure',
    finding:
      'The equation most consistently validated against indirect calorimetry in healthy adults, and the one dietetic practice defaults to. It has male and female forms and no third form.',
    url: 'https://www.jandonline.org/article/S0002-8223(05)00149-5/abstract',
  },
  CUNNINGHAM_1980: {
    key: 'CUNNINGHAM_1980',
    short: 'Cunningham, 1980',
    what: 'Resting metabolic rate from fat-free mass',
    finding:
      'BMR ≈ 500 + 22 × fat-free mass (kg). Because it takes lean mass rather than body weight, it does not carry the body-composition assumptions that make weight-based equations population-specific.',
  },
  SOAR_1993: {
    key: 'SOAR_1993',
    short: 'Soares et al., Br J Nutr',
    what: 'No evidence for an ethnic influence on basal metabolism: India and Australia',
    finding:
      'Absolute BMR was lower in Indians than Australians, but the difference disappeared once adjusted for fat-free mass. The authors found no evidence of an ethnic influence on basal metabolism and concluded that fat-free mass, rather than body weight, should be used to predict BMR across groups of differing body size and composition. 96 Indians, 81 Australians.',
    url: 'https://www.cambridge.org/core/journals/british-journal-of-nutrition/article/no-evidence-for-an-ethnic-influence-on-basal-metabolism-an-examination-of-data-from-india-and-australia/37EDD07F52D68960E6CEED721F48D6E5',
  },
  WIJESINGHE_2021: {
    key: 'WIJESINGHE_2021',
    short: 'Wijesinghe et al., 2021',
    what: 'Prediction of resting metabolic rate in Sri Lankan adults',
    finding:
      'Ten equations including Harris-Benedict, Schofield, Mifflin-St Jeor, Owen and WHO all significantly over-estimated measured RMR in a South Asian cohort. The smallest bias belonged to an equation developed on Indians, at −170 ± 102 kcal/day.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7840262/',
  },
  HALL_2013: {
    key: 'HALL_2013',
    short: 'Thomas et al. / Hall & Chow, Int J Obes',
    what: 'The 3,500 kcal per pound rule',
    finding:
      'The rule "grossly overestimates actual weight loss". It treats weight change as linear and ignores the metabolic adaptation that occurs as weight falls.',
    url: 'https://www.nature.com/articles/ijo201351',
  },
  INDIA_OBESITY_2024: {
    key: 'INDIA_OBESITY_2024',
    short: 'India Obesity Commission, 2024',
    what: 'Revised definition of obesity in Asian Indians living in India',
    finding:
      'A staged framework: normal 18.5–22.9, then grades from 23. Abdominal obesity at waist ≥90 cm (men) / ≥80 cm (women), or waist-to-height ratio above 0.5. Stage 2 obesity requires functional impairment or comorbidity in addition to BMI — BMI alone does not diagnose obesity.',
    url: 'https://www.cmcendovellore.org/pub/2025/revised-definition-of-obesity-in-asian-indians-living-in-india.pdf',
  },
  AND_GENDER: {
    key: 'AND_GENDER',
    short: 'Academy of Nutrition and Dietetics',
    what: 'Sex-specific nutrition recommendations for transgender and gender-diverse people',
    finding:
      'Recommends an individualised approach, including "using a range with both male and female values". It does not endorse a midpoint offset.',
    url: 'https://www.eatright.org/health/wellness/healthful-habits/how-to-approach-sex-specific-nutrition-recommendations-for-transgender-people',
  },
  PRODUCT_JUDGEMENT: {
    key: 'PRODUCT_JUDGEMENT',
    short: 'Mango — product judgement',
    what: 'A choice, not a finding',
    finding:
      'This value is a guard rail chosen by the product rather than a number taken from evidence. It is labelled as such so it is never mistaken for a research result.',
  },
};

export const cite = (k: SourceKey): Citation => SOURCES[k];
