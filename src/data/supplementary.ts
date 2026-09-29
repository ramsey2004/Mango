/* ============================================================
   The foods IFCT does not cover.

   IFCT 2017 is a table of Indian foods as they are grown and
   sold, so it has no curd, no butter, no oats, no sugar, no
   bread and no tea. A kitchen has all of them, and a recipe
   that quietly skips them under-counts.

   So they are here, and they are honestly labelled: these are
   commonly published figures, not values Mango can trace to a
   source it has read. Everything in this file is ESTIMATED, and
   any dish containing one of these is demoted to estimated too,
   however measured the rest of its ingredients are.

   This list is deliberately short. It exists to stop recipes
   lying by omission, not to pad a count. It is also the first
   thing that should be replaced when a licensed table covering
   processed and imported foods becomes available — see
   docs/food-data-sources.md.
   ============================================================ */

export interface SupplementaryRow {
  id: string;
  name: string;
  group: string;
  /** per 100 g */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  aliases?: string[];
}

export const SUPPLEMENTARY: SupplementaryRow[] = [
  // dairy
  { id: 'sup_curd', name: 'Curd (dahi), whole milk', group: 'dairy', kcal: 60, protein: 3.1, carbs: 4.7, fat: 3.3, fibre: 0, aliases: ['curd', 'dahi', 'yoghurt', 'yogurt'] },
  { id: 'sup_curd_low', name: 'Curd, toned milk', group: 'dairy', kcal: 48, protein: 3.3, carbs: 4.8, fat: 1.8, fibre: 0, aliases: ['low fat curd'] },
  { id: 'sup_milk_toned', name: 'Milk, toned', group: 'dairy', kcal: 58, protein: 3.1, carbs: 4.7, fat: 3, fibre: 0, aliases: ['toned milk', 'milk toned'] },
  { id: 'sup_milk_skim', name: 'Milk, skimmed', group: 'dairy', kcal: 35, protein: 3.4, carbs: 4.9, fat: 0.1, fibre: 0, aliases: ['skimmed milk', 'skim milk', 'double toned milk'] },
  { id: 'sup_butter', name: 'Butter', group: 'fat', kcal: 717, protein: 0.9, carbs: 0.1, fat: 81, fibre: 0, aliases: ['butter', 'makhan'] },
  { id: 'sup_cheese', name: 'Cheese, processed', group: 'dairy', kcal: 330, protein: 20, carbs: 2, fat: 26, fibre: 0, aliases: ['cheese'] },
  { id: 'sup_cream', name: 'Cream, fresh', group: 'dairy', kcal: 195, protein: 2.5, carbs: 3.5, fat: 19, fibre: 0, aliases: ['cream', 'malai'] },
  { id: 'sup_condensed', name: 'Condensed milk, sweetened', group: 'dairy', kcal: 321, protein: 7.9, carbs: 54, fat: 8.7, fibre: 0, aliases: ['condensed milk'] },
  { id: 'sup_milk_powder', name: 'Milk powder, whole', group: 'dairy', kcal: 496, protein: 26, carbs: 38, fat: 27, fibre: 0, aliases: ['milk powder'] },

  // grains and bakery
  { id: 'sup_oats', name: 'Oats, rolled', group: 'grain', kcal: 389, protein: 16.9, carbs: 66, fat: 6.9, fibre: 10.6, aliases: ['oats', 'rolled oats', 'jai'] },
  { id: 'sup_bread_white', name: 'Bread, white', group: 'grain', kcal: 265, protein: 9, carbs: 49, fat: 3.2, fibre: 2.7, aliases: ['bread', 'pav', 'double roti'] },
  { id: 'sup_bread_brown', name: 'Bread, brown', group: 'grain', kcal: 247, protein: 13, carbs: 41, fat: 3.4, fibre: 7, aliases: ['brown bread', 'whole wheat bread'] },
  { id: 'sup_cornflour', name: 'Cornflour', group: 'grain', kcal: 381, protein: 0.3, carbs: 91, fat: 0.1, fibre: 0.9, aliases: ['cornflour', 'corn flour'] },
  { id: 'sup_pasta', name: 'Pasta, dry', group: 'grain', kcal: 371, protein: 13, carbs: 75, fat: 1.5, fibre: 3.2, aliases: ['pasta', 'macaroni', 'penne', 'spaghetti'] },
  { id: 'sup_noodles', name: 'Instant noodles, dry', group: 'grain', kcal: 440, protein: 9, carbs: 62, fat: 17, fibre: 2.5, aliases: ['instant noodles', 'maggi', 'ramen'] },

  // sugars and sweeteners
  { id: 'sup_sugar', name: 'Sugar, white', group: 'sugar', kcal: 387, protein: 0, carbs: 100, fat: 0, fibre: 0, aliases: ['sugar', 'cheeni', 'chini', 'refined sugar'] },
  { id: 'sup_honey', name: 'Honey', group: 'sugar', kcal: 304, protein: 0.3, carbs: 82, fat: 0, fibre: 0.2, aliases: ['honey', 'shahad'] },

  // soya and meat alternatives
  { id: 'sup_tofu', name: 'Tofu', group: 'dairy', kcal: 76, protein: 8.1, carbs: 1.9, fat: 4.8, fibre: 0.3, aliases: ['tofu'] },
  { id: 'sup_soya_chunks', name: 'Soya chunks, dry', group: 'legume', kcal: 345, protein: 52, carbs: 33, fat: 0.5, fibre: 13, aliases: ['soya chunks', 'nutrela', 'soya nuggets'] },

  // condiments a recipe cannot omit
  { id: 'sup_salt', name: 'Salt', group: 'spice', kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, aliases: ['salt', 'namak'] },
  { id: 'sup_garam_masala', name: 'Garam masala', group: 'spice', kcal: 379, protein: 14, carbs: 45, fat: 15, fibre: 25, aliases: ['garam masala'] },
  { id: 'sup_tea_leaf', name: 'Tea leaves, dry', group: 'other', kcal: 1, protein: 0, carbs: 0.3, fat: 0, fibre: 0, aliases: ['tea leaves', 'chai patti'] },
  { id: 'sup_coffee', name: 'Coffee powder, instant', group: 'other', kcal: 353, protein: 12, carbs: 41, fat: 0.5, fibre: 0, aliases: ['coffee powder', 'instant coffee'] },
  { id: 'sup_baking_soda', name: 'Baking soda', group: 'other', kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, aliases: ['baking soda', 'eno', 'baking powder'] },
  { id: 'sup_vinegar', name: 'Vinegar', group: 'other', kcal: 18, protein: 0, carbs: 0.9, fat: 0, fibre: 0, aliases: ['vinegar'] },
  { id: 'sup_soy_sauce', name: 'Soy sauce', group: 'other', kcal: 53, protein: 8, carbs: 4.9, fat: 0.6, fibre: 0.8, aliases: ['soy sauce', 'soya sauce'] },
  { id: 'sup_tomato_ketchup', name: 'Tomato ketchup', group: 'other', kcal: 101, protein: 1.3, carbs: 24, fat: 0.2, fibre: 0.3, aliases: ['tomato ketchup', 'ketchup'] },
  { id: 'sup_mayonnaise', name: 'Mayonnaise', group: 'fat', kcal: 680, protein: 1, carbs: 0.6, fat: 75, fibre: 0, aliases: ['mayonnaise', 'mayo'] },

  { id: 'sup_coconut_water', name: 'Coconut water, tender', group: 'other', kcal: 19, protein: 0.7, carbs: 3.7, fat: 0.2, fibre: 1.1, aliases: ['coconut water', 'nariyal pani'] },

  // protein supplements, because people log them
  { id: 'sup_whey', name: 'Whey protein powder', group: 'other', kcal: 400, protein: 80, carbs: 8, fat: 5, fibre: 0, aliases: ['whey protein', 'protein powder'] },
];

export const SUPPLEMENTARY_BASIS =
  'Commonly published composition figures for foods outside IFCT 2017. Not traced to a source Mango has read, so treated as estimates throughout.';
