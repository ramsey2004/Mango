import type { Cuisine, MealSlot } from '../lib/nutrition-types';

/* ============================================================
   A dish as a recipe, not as a row of numbers.

   Nothing here states a calorie figure. A dish states what goes
   in it and how many it serves; the nutrition is arithmetic on
   measured ingredients, done at build time. That means a dish
   can be checked by reading it — if the recipe looks wrong, the
   number is wrong, and both are visible.
   ============================================================ */

/** [ingredient, grams for the whole recipe] — ingredient named as IFCT names it,
 *  or by any of the aliases the source publishes. An unknown name fails the build. */
export type DishItem = [ingredient: string, grams: number];

export interface DishSpec {
  id: string;
  name: string;
  slot: MealSlot;
  cuisine: Cuisine;
  /** how many portions the stated quantities make */
  serves: number;
  servingLabel: string;
  items: DishItem[];
  /**
   * What cooking does to the weight. Grains and pulses absorb water and gain;
   * frying and roasting lose it. 1 means unchanged.
   *
   * This only affects the weight of a portion, never its energy — nothing is
   * created or destroyed by boiling. It exists so that "one katori" means a
   * sensible amount of the cooked thing.
   */
  yield?: number;
  prepMins?: number;
  tags?: string[];
  /** anything worth saying about the recipe this was costed against */
  note?: string;
}
