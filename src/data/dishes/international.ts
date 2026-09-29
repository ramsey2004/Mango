import type { DishSpec } from '../dish-types';

/* Food from outside India that an Indian kitchen actually cooks or orders.

   Everything here is costed against the same measured ingredient table as
   the Indian dishes, so a pasta and a dal are comparable numbers rather
   than figures from two different books. Where an ingredient is only in
   the supplementary list — pasta, cheese, bread — the dish is marked
   estimated rather than calculated, automatically. */

export const INTERNATIONAL: DishSpec[] = [
  // pasta and italian
  { id: 'd_pasta_red', name: 'Red sauce pasta', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 2.0, prepMins: 25,
    items: [['pasta', 200], ['tomato', 300], ['onion', 80], ['oil', 25], ['garlic', 12], ['salt', 4]], tags: ['one-pot'] },
  { id: 'd_pasta_white', name: 'White sauce pasta', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 1.9, prepMins: 30,
    items: [['pasta', 200], ['milk', 300], ['maida', 30], ['butter', 40], ['cheese', 50], ['salt', 4]], tags: ['rich'] },
  { id: 'd_pasta_pesto_veg', name: 'Vegetable pasta', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 1.9, prepMins: 25,
    items: [['pasta', 200], ['capsicum', 100], ['mushroom', 100], ['carrot', 60], ['oil', 30], ['garlic', 10], ['salt', 4]], tags: ['high-fibre'] },
  { id: 'd_veg_pizza', name: 'Vegetable pizza (2 slices)', slot: 'dinner', cuisine: 'Continental', serves: 4, servingLabel: '2 slices', yield: 0.9, prepMins: 50,
    items: [['maida', 300], ['cheese', 150], ['tomato', 150], ['capsicum', 80], ['onion', 80], ['oil', 40], ['salt', 6]], tags: ['baked'] },
  { id: 'd_garlic_bread', name: 'Garlic bread (2 pieces)', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '2 pieces', yield: 0.9, prepMins: 15,
    items: [['bread', 180], ['butter', 50], ['garlic', 15], ['salt', 2]], tags: ['baked'] },
  { id: 'd_lasagna_veg', name: 'Vegetable lasagna', slot: 'dinner', cuisine: 'Continental', serves: 4, servingLabel: '1 portion', yield: 1.1, prepMins: 70,
    items: [['pasta', 180], ['tomato', 300], ['cheese', 150], ['milk', 200], ['butter', 40], ['capsicum', 100], ['salt', 6]], tags: ['baked', 'rich'] },

  // east and southeast asian
  { id: 'd_hakka_noodles', name: 'Hakka noodles', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 2.1, prepMins: 25,
    items: [['instant noodles', 180], ['cabbage', 120], ['carrot', 80], ['capsicum', 60], ['oil', 35], ['soy sauce', 25], ['salt', 3]], tags: ['one-pot'] },
  { id: 'd_chilli_garlic_noodles', name: 'Chilli garlic noodles', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 2.0, prepMins: 20,
    items: [['instant noodles', 180], ['garlic', 20], ['red chilli powder', 6], ['oil', 40], ['soy sauce', 25], ['salt', 3]], tags: ['spicy'] },
  { id: 'd_manchow_soup', name: 'Manchow soup', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '1 bowl', yield: 4.0, prepMins: 25,
    items: [['cabbage', 100], ['carrot', 60], ['mushroom', 60], ['cornflour', 25], ['oil', 15], ['soy sauce', 20], ['salt', 4]], tags: ['light', 'low-calorie'] },
  { id: 'd_sweet_corn_soup', name: 'Sweet corn soup', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '1 bowl', yield: 3.5, prepMins: 20,
    items: [['maize, tender, sweet', 200], ['cornflour', 25], ['carrot', 50], ['salt', 4]], tags: ['light'] },
  { id: 'd_tomato_soup', name: 'Tomato soup', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '1 bowl', yield: 1.8, prepMins: 25,
    items: [['tomato', 500], ['onion', 60], ['butter', 20], ['cornflour', 15], ['salt', 4]], tags: ['light', 'low-calorie'] },
  { id: 'd_thai_curry_veg', name: 'Thai green curry with rice', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 2.2, prepMins: 40,
    items: [['rice', 180], ['coconut', 150], ['beans', 100], ['capsicum', 80], ['mushroom', 80], ['oil', 25], ['salt', 5]], tags: ['rich'] },
  { id: 'd_stir_fry_veg', name: 'Stir-fried vegetables', slot: 'dinner', cuisine: 'Continental', serves: 3, servingLabel: '1 plate', yield: 0.8, prepMins: 20,
    items: [['cabbage', 150], ['carrot', 120], ['beans', 120], ['capsicum', 100], ['mushroom', 80], ['oil', 25], ['soy sauce', 20], ['salt', 3]], tags: ['low-calorie', 'high-fibre'] },

  // middle eastern
  { id: 'd_hummus_pita', name: 'Hummus with pita', slot: 'snack', cuisine: 'Continental', serves: 4, servingLabel: '1 portion', yield: 1.6, prepMins: 30,
    items: [['kabuli chana', 150], ['sesame seeds', 40], ['gingelly oil', 30], ['lemon juice', 25], ['garlic', 10], ['bread', 180], ['salt', 4]], tags: ['high-protein', 'high-fibre'] },
  { id: 'd_falafel', name: 'Falafel (3 pieces)', slot: 'snack', cuisine: 'Continental', serves: 4, servingLabel: '3 pieces', yield: 0.9, prepMins: 50,
    items: [['kabuli chana', 250], ['onion', 80], ['coriander leaves', 25], ['oil', 100], ['cumin', 5], ['salt', 5]], tags: ['fried', 'high-protein'] },
  { id: 'd_shawarma_veg', name: 'Paneer shawarma roll', slot: 'dinner', cuisine: 'Continental', serves: 2, servingLabel: '1 roll', yield: 0.95, prepMins: 30,
    items: [['maida', 120], ['paneer', 150], ['cabbage', 60], ['mayonnaise', 30], ['onion', 50], ['oil', 15], ['salt', 4]], tags: ['street', 'high-protein'] },

  // western breakfast and mains
  { id: 'd_veg_burger', name: 'Vegetable burger', slot: 'snack', cuisine: 'Continental', serves: 2, servingLabel: '1 burger', yield: 0.95, prepMins: 35,
    items: [['bread', 180], ['potato', 200], ['peas', 60], ['mayonnaise', 30], ['cheese', 40], ['oil', 40], ['salt', 4]], tags: ['street', 'heavy'] },
  { id: 'd_french_fries', name: 'French fries', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '1 small portion', yield: 0.75, prepMins: 25,
    items: [['potato', 500], ['oil', 120], ['salt', 4]], tags: ['fried'] },
  { id: 'd_pancakes', name: 'Pancakes (2)', slot: 'breakfast', cuisine: 'Continental', serves: 3, servingLabel: '2 pancakes', yield: 1.1, prepMins: 25,
    items: [['maida', 200], ['milk', 250], ['egg', 100], ['sugar', 40], ['butter', 30]], tags: ['sweet'] },
  { id: 'd_french_toast', name: 'French toast (2)', slot: 'breakfast', cuisine: 'Continental', serves: 2, servingLabel: '2 slices', yield: 0.95, prepMins: 15,
    items: [['bread', 120], ['egg', 100], ['milk', 80], ['sugar', 20], ['butter', 20]], tags: ['quick', 'high-protein'] },
  { id: 'd_scrambled_eggs', name: 'Scrambled eggs (2)', slot: 'breakfast', cuisine: 'Continental', serves: 1, servingLabel: '2 eggs', yield: 0.85, prepMins: 8,
    items: [['egg', 100], ['milk', 30], ['butter', 12], ['salt', 2]], tags: ['high-protein', 'quick'] },
  { id: 'd_greek_salad', name: 'Greek salad', slot: 'lunch', cuisine: 'Continental', serves: 2, servingLabel: '1 bowl', yield: 1.0, prepMins: 12,
    items: [['cucumber', 150], ['tomato', 150], ['onion', 50], ['cheese', 60], ['oil', 20], ['salt', 2]], tags: ['no-cook', 'low-carb'] },
  { id: 'd_caesar_salad_veg', name: 'Vegetable caesar salad', slot: 'lunch', cuisine: 'Continental', serves: 2, servingLabel: '1 bowl', yield: 1.0, prepMins: 15,
    items: [['lettuce', 200], ['bread', 60], ['cheese', 40], ['mayonnaise', 30], ['salt', 2]], tags: ['no-cook'] },
  { id: 'd_chicken_salad', name: 'Grilled chicken salad', slot: 'lunch', cuisine: 'Continental', serves: 2, servingLabel: '1 bowl', yield: 0.9, prepMins: 25,
    items: [['chicken', 250], ['lettuce', 150], ['tomato', 100], ['cucumber', 100], ['oil', 20], ['lemon juice', 20], ['salt', 3]], tags: ['high-protein', 'low-carb'] },
  { id: 'd_burrito_bowl', name: 'Rajma burrito bowl', slot: 'lunch', cuisine: 'Continental', serves: 2, servingLabel: '1 bowl', yield: 2.0, prepMins: 40,
    items: [['rice', 120], ['rajma', 100], ['maize, tender, sweet', 100], ['tomato', 100], ['onion', 60], ['oil', 20], ['salt', 4]], tags: ['one-pot', 'high-fibre'] },
  { id: 'd_oatmeal_banana', name: 'Banana oatmeal', slot: 'breakfast', cuisine: 'Continental', serves: 1, servingLabel: '1 bowl', yield: 1.6, prepMins: 8,
    items: [['oats', 50], ['milk', 200], ['banana', 100], ['honey', 10]], tags: ['quick'] },
  { id: 'd_mushroom_soup', name: 'Cream of mushroom soup', slot: 'snack', cuisine: 'Continental', serves: 3, servingLabel: '1 bowl', yield: 1.8, prepMins: 30,
    items: [['mushroom', 300], ['milk', 300], ['butter', 30], ['maida', 25], ['onion', 50], ['salt', 4]], tags: ['light'] },
  { id: 'd_baked_beans_toast', name: 'Baked beans on toast', slot: 'breakfast', cuisine: 'Continental', serves: 2, servingLabel: '1 plate', yield: 1.8, prepMins: 20,
    items: [['rajma', 100], ['tomato', 150], ['bread', 120], ['oil', 15], ['sugar', 10], ['salt', 4]], tags: ['high-fibre'] },
];
