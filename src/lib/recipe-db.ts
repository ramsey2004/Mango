import type { Recipe, Cuisine, MealSlot, GoalKey, GroceryGroup, Kitchen, Equipment, Occasion } from './nutrition-types';
import { recipeCost } from './ingredient-db';

/* ============================================================
   Seed recipe database.

   The report's long-term moat is 2,000+ recipes across eight
   cuisines. That is a data problem, not an architecture problem:
   this table is the shape those rows take, and every consumer
   reads it through the recommender, never directly. Swapping this
   array for a fetched dataset changes nothing else.
   ============================================================ */

type Ing = [name: string, qty: string, group: GroceryGroup];

interface Seed {
  id: string;
  name: string;
  emoji: string;
  cuisine: Cuisine;
  slots: MealSlot[];
  kcal: number; protein: number; carbs: number; fat: number; fibre: number;
  prepMins: number;
  difficulty: 1 | 2 | 3;
  costRupees: number;
  veg: boolean; vegan: boolean; egg?: boolean; jainSafe?: boolean;
  gi?: number;
  goalTags: GoalKey[];
  tasteTags: string[];
  tags: string[];
  ingredients: Ing[];
  steps: string[];
  /* --- execution metadata. Optional: sensible defaults are derived below. --- */
  kitchens?: Kitchen[];
  equipment?: Equipment[];
  noCook?: boolean;
  occasions?: Occasion[];
  satiety?: 1 | 2 | 3;
  portable?: boolean;
  batchFriendly?: boolean;
}

/** Every kitchen. Most home cooking works anywhere there is a stove. */
const ALL_KITCHENS: Kitchen[] = ['home', 'hostel', 'office', 'pg'];

const S: Seed[] = [
  {
    id: 'r_paneer_wrap', name: 'High-protein paneer & capsicum wrap', emoji: '🌯',
    cuisine: 'North Indian', slots: ['lunch', 'dinner', 'snack'],
    kcal: 430, protein: 30, carbs: 38, fat: 17, fibre: 6, prepMins: 15, difficulty: 1, costRupees: 78,
    veg: true, vegan: false, gi: 45, goalTags: ['fat_loss', 'muscle_gain', 'performance'],
    tasteTags: ['savoury', 'mild'], tags: ['quick', 'high-protein', 'portable'],
    ingredients: [['Paneer', '100 g', 'Protein'], ['Capsicum', '1', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Wheat tortilla or roti', '2', 'Grains'], ['Curd', '2 tbsp', 'Dairy'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Dice paneer, capsicum and onion.', 'Sauté on high heat for 4 minutes with chaat masala.', 'Whisk curd with salt and a pinch of chilli.', 'Spread curd on the roti, fill, roll tightly and halve.'],
  },
  {
    id: 'r_moong_chilla', name: 'Moong chilla with curd', emoji: '🥞',
    cuisine: 'North Indian', slots: ['breakfast', 'snack'],
    kcal: 380, protein: 24, carbs: 40, fat: 12, fibre: 9, prepMins: 20, difficulty: 1, costRupees: 42,
    veg: true, vegan: false, gi: 42, goalTags: ['fat_loss', 'wellness', 'consistency'],
    tasteTags: ['savoury'], tags: ['high-protein', 'high-fibre', 'budget'],
    ingredients: [['Moong dal', '100 g', 'Pantry'], ['Ginger', '1 inch', 'Vegetables'], ['Green chilli', '1', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Coriander', 'handful', 'Vegetables']],
    steps: ['Soak moong dal three hours, grind with ginger and chilli.', 'Spread thin on a hot tawa, cook both sides.', 'Serve with curd.'],
  },
  {
    id: 'r_soya_pulao', name: 'Soya chunk pulao', emoji: '🍚',
    cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 480, protein: 29, carbs: 62, fat: 12, fibre: 8, prepMins: 30, difficulty: 2, costRupees: 55,
    veg: true, vegan: true, gi: 58, goalTags: ['muscle_gain', 'fat_loss'],
    tasteTags: ['savoury', 'spiced'], tags: ['one-pot', 'budget', 'high-protein', 'vegan'],
    ingredients: [['Soya chunks', '60 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Onion', '1', 'Vegetables'], ['Peas & carrot', '1 cup', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Soak soya chunks in hot water, squeeze dry.', 'Sauté onion, add vegetables and soya.', 'Add rice and 2 cups water, pressure cook two whistles.'],
  },
  {
    id: 'r_rajma_chawal', name: 'Rajma chawal', emoji: '🍛',
    cuisine: 'Punjabi', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 18, carbs: 82, fat: 10, fibre: 12, prepMins: 45, difficulty: 2, costRupees: 48,
    veg: true, vegan: true, gi: 45, goalTags: ['maintenance', 'wellness', 'energy'],
    tasteTags: ['comfort', 'spiced'], tags: ['classic', 'high-fibre', 'budget'],
    ingredients: [['Rajma', '100 g', 'Pantry'], ['Rice', '1 cup', 'Grains'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Ginger-garlic', '1 tbsp', 'Vegetables']],
    steps: ['Soak rajma overnight; pressure cook until soft.', 'Make an onion-tomato masala, add rajma with its water.', 'Simmer 15 minutes; serve over rice.'],
  },
  {
    id: 'r_egg_bhurji_roti', name: 'Egg bhurji with two rotis', emoji: '🍳',
    cuisine: 'Pan-Indian', slots: ['breakfast', 'dinner'],
    kcal: 450, protein: 25, carbs: 42, fat: 20, fibre: 6, prepMins: 15, difficulty: 1, costRupees: 45,
    veg: false, vegan: false, egg: true, goalTags: ['muscle_gain', 'fat_loss', 'energy'],
    tasteTags: ['savoury'], tags: ['quick', 'high-protein', 'budget'],
    ingredients: [['Eggs', '3', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Wheat flour', '100 g', 'Grains']],
    steps: ['Sauté onion and tomato until soft.', 'Add beaten eggs, scramble on low heat.', 'Serve with fresh rotis.'],
  },
  {
    id: 'r_curd_rice', name: 'Curd rice with cucumber', emoji: '🥣',
    cuisine: 'South Indian', slots: ['lunch', 'dinner'],
    kcal: 340, protein: 11, carbs: 52, fat: 9, fibre: 3, prepMins: 12, difficulty: 1, costRupees: 32,
    veg: true, vegan: false, gi: 58, goalTags: ['wellness', 'energy', 'consistency'],
    tasteTags: ['cooling', 'mild'], tags: ['quick', 'gut-friendly', 'leftover-friendly'],
    ingredients: [['Cooked rice', '1 cup', 'Grains'], ['Curd', '1 cup', 'Dairy'], ['Cucumber', '1', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '6', 'Vegetables']],
    steps: ['Mash rice into curd with salt.', 'Fold in grated cucumber.', 'Temper mustard seeds and curry leaves, pour over.'],
  },
  {
    id: 'r_chole_salad', name: 'Chole salad bowl', emoji: '🥗',
    cuisine: 'Punjabi', slots: ['lunch', 'snack'],
    kcal: 360, protein: 16, carbs: 48, fat: 10, fibre: 14, prepMins: 15, difficulty: 1, costRupees: 40,
    veg: true, vegan: true, gi: 32, goalTags: ['fat_loss', 'wellness'],
    tasteTags: ['tangy', 'fresh'], tags: ['high-fibre', 'no-cook', 'vegan', 'low-gi'],
    ingredients: [['Boiled chickpeas', '1 cup', 'Pantry'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Chop vegetables fine.', 'Toss with chickpeas, lemon and chaat masala.', 'Rest ten minutes before eating.'],
  },
  {
    id: 'r_palak_paneer_roti', name: 'Palak paneer with roti', emoji: '🥬',
    cuisine: 'Punjabi', slots: ['dinner'],
    kcal: 490, protein: 24, carbs: 38, fat: 26, fibre: 8, prepMins: 35, difficulty: 2, costRupees: 95,
    veg: true, vegan: false, gi: 30, goalTags: ['muscle_gain', 'wellness'],
    tasteTags: ['creamy', 'mild'], tags: ['iron', 'high-protein'],
    ingredients: [['Paneer', '120 g', 'Protein'], ['Spinach', '1 bunch', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Wheat flour', '100 g', 'Grains'], ['Cream', '1 tbsp', 'Dairy']],
    steps: ['Blanch and purée spinach.', 'Sauté onion, add purée, simmer.', 'Add paneer cubes and a spoon of cream. Serve with roti.'],
  },
  {
    id: 'r_tandoori_salad', name: 'Tandoori chicken with salad', emoji: '🍗',
    cuisine: 'Punjabi', slots: ['dinner'],
    kcal: 420, protein: 45, carbs: 12, fat: 20, fibre: 4, prepMins: 45, difficulty: 2, costRupees: 145,
    veg: false, vegan: false, goalTags: ['muscle_gain', 'fat_loss', 'performance'],
    tasteTags: ['smoky', 'spiced'], tags: ['high-protein', 'low-carb'],
    ingredients: [['Chicken', '200 g', 'Protein'], ['Curd', '3 tbsp', 'Dairy'], ['Tandoori masala', '1 tbsp', 'Pantry'], ['Salad vegetables', '1 bowl', 'Vegetables']],
    steps: ['Marinate chicken in curd and masala for 30 minutes.', 'Grill or air-fry 20 minutes, turning once.', 'Serve with raw salad and lemon.'],
  },
  {
    id: 'r_fish_curry_rice', name: 'Bengali fish curry with rice', emoji: '🐟',
    cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 32, carbs: 55, fat: 18, fibre: 3, prepMins: 40, difficulty: 2, costRupees: 130,
    veg: false, vegan: false, goalTags: ['muscle_gain', 'wellness'],
    tasteTags: ['tangy', 'mustard'], tags: ['omega-3', 'high-protein'],
    ingredients: [['Rohu or basa', '200 g', 'Protein'], ['Mustard paste', '2 tbsp', 'Pantry'], ['Rice', '1 cup', 'Grains'], ['Green chilli', '2', 'Vegetables']],
    steps: ['Lightly fry the fish.', 'Simmer in mustard paste with turmeric and chilli.', 'Serve with steamed rice.'],
  },
  {
    id: 'r_masala_oats', name: 'Masala oats with vegetables', emoji: '🥣',
    cuisine: 'Continental', slots: ['breakfast', 'dinner'],
    kcal: 310, protein: 12, carbs: 44, fat: 9, fibre: 8, prepMins: 10, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 55, goalTags: ['fat_loss', 'consistency'],
    tasteTags: ['savoury'], tags: ['quick', 'high-fibre', 'vegan'],
    ingredients: [['Oats', '50 g', 'Grains'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Sauté vegetables two minutes.', 'Add oats and 1.5 cups water.', 'Simmer five minutes until thick.'],
  },
  {
    id: 'r_poha_peanuts', name: 'Poha with peanuts and sprouts', emoji: '🍚',
    cuisine: 'Maharashtrian', slots: ['breakfast'],
    kcal: 340, protein: 11, carbs: 52, fat: 10, fibre: 6, prepMins: 15, difficulty: 1, costRupees: 28,
    veg: true, vegan: true, gi: 60, goalTags: ['energy', 'consistency', 'maintenance'],
    tasteTags: ['mild', 'tangy'], tags: ['quick', 'budget', 'vegan'],
    ingredients: [['Poha', '1 cup', 'Grains'], ['Peanuts', '2 tbsp', 'Protein'], ['Moong sprouts', '1/2 cup', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Lemon', '1', 'Fruit']],
    steps: ['Rinse poha and drain.', 'Temper mustard, curry leaves, onion and peanuts.', 'Fold in poha and sprouts, finish with lemon.'],
  },
  {
    id: 'r_idli_sambar', name: 'Idli with sambar', emoji: '🍥',
    cuisine: 'South Indian', slots: ['breakfast', 'dinner'],
    kcal: 380, protein: 14, carbs: 62, fat: 7, fibre: 9, prepMins: 20, difficulty: 1, costRupees: 40,
    veg: true, vegan: true, gi: 55, goalTags: ['wellness', 'consistency'],
    tasteTags: ['mild', 'tangy'], tags: ['steamed', 'low-fat', 'vegan'],
    ingredients: [['Idli batter', '2 cups', 'Grains'], ['Toor dal', '1/2 cup', 'Pantry'], ['Drumstick & vegetables', '1 cup', 'Vegetables'], ['Sambar powder', '1 tbsp', 'Pantry']],
    steps: ['Steam idlis 12 minutes.', 'Cook dal with vegetables, add sambar powder and tamarind.', 'Serve hot.'],
  },
  {
    id: 'r_khichdi', name: 'Moong dal khichdi', emoji: '🍲',
    cuisine: 'Pan-Indian', slots: ['lunch', 'dinner'],
    kcal: 380, protein: 15, carbs: 58, fat: 9, fibre: 8, prepMins: 25, difficulty: 1, costRupees: 30,
    veg: true, vegan: false, gi: 55, goalTags: ['wellness', 'energy'],
    tasteTags: ['comfort', 'mild'], tags: ['one-pot', 'gut-friendly', 'budget'],
    ingredients: [['Rice', '1/2 cup', 'Grains'], ['Moong dal', '1/2 cup', 'Pantry'], ['Ghee', '1 tsp', 'Dairy'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Rinse rice and dal together.', 'Pressure cook with turmeric and 3 cups water.', 'Temper cumin in ghee and pour over.'],
  },
  {
    id: 'r_tofu_stirfry', name: 'Tofu and vegetable stir-fry', emoji: '🥘',
    cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 360, protein: 26, carbs: 24, fat: 18, fibre: 7, prepMins: 18, difficulty: 1, costRupees: 85,
    veg: true, vegan: true, gi: 25, goalTags: ['fat_loss', 'muscle_gain'],
    tasteTags: ['savoury', 'umami'], tags: ['vegan', 'high-protein', 'low-gi'],
    ingredients: [['Tofu', '150 g', 'Protein'], ['Broccoli or beans', '1 cup', 'Vegetables'], ['Capsicum', '1', 'Vegetables'], ['Soy sauce', '1 tbsp', 'Pantry']],
    steps: ['Press and cube tofu, pan-sear until golden.', 'Stir-fry vegetables on high heat.', 'Return tofu, add soy sauce, toss one minute.'],
  },
  {
    id: 'r_besan_chilla_chutney', name: 'Besan chilla with green chutney', emoji: '🫓',
    cuisine: 'North Indian', slots: ['breakfast', 'snack'],
    kcal: 320, protein: 16, carbs: 34, fat: 13, fibre: 7, prepMins: 15, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss', 'consistency'],
    tasteTags: ['savoury', 'spiced'], tags: ['quick', 'budget', 'vegan', 'high-protein'],
    ingredients: [['Gram flour', '80 g', 'Pantry'], ['Onion', '1', 'Vegetables'], ['Coriander', 'handful', 'Vegetables'], ['Green chilli', '2', 'Vegetables']],
    steps: ['Whisk gram flour with water to a pouring batter.', 'Fold in chopped vegetables.', 'Cook on a tawa both sides; serve with chutney.'],
  },
  {
    id: 'r_chicken_rice_bowl', name: 'Grilled chicken rice bowl', emoji: '🍱',
    cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 560, protein: 45, carbs: 55, fat: 16, fibre: 6, prepMins: 25, difficulty: 2, costRupees: 135,
    veg: false, vegan: false, goalTags: ['muscle_gain', 'performance'],
    tasteTags: ['savoury'], tags: ['high-protein', 'meal-prep'],
    ingredients: [['Chicken breast', '180 g', 'Protein'], ['Brown rice', '1 cup', 'Grains'], ['Salad vegetables', '1 bowl', 'Vegetables'], ['Curd dip', '3 tbsp', 'Dairy']],
    steps: ['Marinate and grill the chicken.', 'Cook brown rice.', 'Assemble with salad and a curd dip.'],
  },
  {
    id: 'r_paneer_tikka', name: 'Paneer tikka with salad', emoji: '🧀',
    cuisine: 'Punjabi', slots: ['dinner', 'snack'],
    kcal: 400, protein: 26, carbs: 16, fat: 26, fibre: 4, prepMins: 30, difficulty: 2, costRupees: 100,
    veg: true, vegan: false, gi: 25, goalTags: ['muscle_gain', 'fat_loss'],
    tasteTags: ['smoky', 'spiced'], tags: ['high-protein', 'low-carb'],
    ingredients: [['Paneer', '150 g', 'Protein'], ['Curd', '3 tbsp', 'Dairy'], ['Capsicum', '1', 'Vegetables'], ['Tikka masala', '1 tbsp', 'Pantry']],
    steps: ['Marinate paneer and vegetables in spiced curd for 20 minutes.', 'Grill or air-fry until charred at the edges.', 'Serve with onion salad and lemon.'],
  },
  {
    id: 'r_dal_roti_sabzi', name: 'Dal, roti and seasonal sabzi', emoji: '🍛',
    cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 470, protein: 18, carbs: 62, fat: 15, fibre: 12, prepMins: 35, difficulty: 2, costRupees: 45,
    veg: true, vegan: true, gi: 45, goalTags: ['maintenance', 'wellness', 'consistency'],
    tasteTags: ['comfort'], tags: ['classic', 'budget', 'high-fibre'],
    ingredients: [['Toor dal', '1/2 cup', 'Pantry'], ['Wheat flour', '100 g', 'Grains'], ['Seasonal vegetable', '200 g', 'Vegetables'], ['Onion', '1', 'Vegetables']],
    steps: ['Pressure cook dal, temper with cumin and garlic.', 'Cook the sabzi with minimal oil.', 'Serve with fresh rotis.'],
  },
  {
    id: 'r_sprout_chaat', name: 'Sprout chaat', emoji: '🥗',
    cuisine: 'Maharashtrian', slots: ['snack', 'breakfast'],
    kcal: 220, protein: 14, carbs: 32, fat: 4, fibre: 10, prepMins: 10, difficulty: 1, costRupees: 25,
    veg: true, vegan: true, gi: 35, goalTags: ['fat_loss', 'wellness'],
    tasteTags: ['tangy', 'fresh'], tags: ['no-cook', 'high-fibre', 'vegan', 'budget'],
    ingredients: [['Moong sprouts', '1.5 cups', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Lemon', '1', 'Fruit']],
    steps: ['Steam sprouts three minutes if you prefer them soft.', 'Toss with chopped vegetables, lemon, salt and chaat masala.'],
  },
  {
    id: 'r_upma_veg', name: 'Vegetable upma', emoji: '🍲',
    cuisine: 'South Indian', slots: ['breakfast'],
    kcal: 330, protein: 9, carbs: 48, fat: 11, fibre: 6, prepMins: 20, difficulty: 1, costRupees: 26,
    veg: true, vegan: true, gi: 66, goalTags: ['energy', 'maintenance'],
    tasteTags: ['savoury', 'mild'], tags: ['quick', 'budget', 'vegan'],
    ingredients: [['Semolina', '1 cup', 'Grains'], ['Carrot & peas', '1 cup', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '8', 'Vegetables']],
    steps: ['Dry-roast semolina until fragrant.', 'Temper spices, add vegetables and water.', 'Stir in semolina, cook until it comes together.'],
  },
  {
    id: 'r_rajgira_bowl', name: 'Rajgira and curd bowl (fasting)', emoji: '🥛',
    cuisine: 'Gujarati', slots: ['breakfast', 'snack', 'dinner'],
    kcal: 300, protein: 11, carbs: 40, fat: 10, fibre: 5, prepMins: 10, difficulty: 1, costRupees: 45,
    veg: true, vegan: false, jainSafe: true, gi: 50, goalTags: ['wellness', 'consistency'],
    tasteTags: ['mild'], tags: ['fasting', 'navratri', 'no-onion-garlic'],
    ingredients: [['Rajgira flour', '50 g', 'Grains'], ['Curd', '1 cup', 'Dairy'], ['Peanuts', '2 tbsp', 'Protein'], ['Rock salt', 'to taste', 'Pantry']],
    steps: ['Make thin rajgira rotis on a tawa.', 'Serve with whisked curd and roasted peanuts.'],
  },
  {
    id: 'r_sabudana_khichdi', name: 'Sabudana khichdi (fasting)', emoji: '⚪',
    cuisine: 'Maharashtrian', slots: ['breakfast', 'snack'],
    kcal: 380, protein: 8, carbs: 56, fat: 14, fibre: 4, prepMins: 20, difficulty: 2, costRupees: 40,
    veg: true, vegan: true, jainSafe: true, gi: 70, goalTags: ['energy'],
    tasteTags: ['mild', 'nutty'], tags: ['fasting', 'navratri', 'no-onion-garlic'],
    ingredients: [['Sabudana', '1 cup', 'Grains'], ['Peanuts', '3 tbsp', 'Protein'], ['Potato', '1', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Soak sabudana overnight and drain well.', 'Fry cubed potato with cumin.', 'Add sabudana and crushed peanuts, cook until translucent.'],
  },
  {
    id: 'r_dahi_chana_chaat', name: 'Dahi chana chaat', emoji: '🥣',
    cuisine: 'North Indian', slots: ['snack'],
    kcal: 260, protein: 15, carbs: 32, fat: 7, fibre: 9, prepMins: 8, difficulty: 1, costRupees: 30,
    veg: true, vegan: false, gi: 30, goalTags: ['fat_loss', 'muscle_gain'],
    tasteTags: ['tangy'], tags: ['no-cook', 'high-protein', 'quick'],
    ingredients: [['Roasted chana', '50 g', 'Pantry'], ['Curd', '1 cup', 'Dairy'], ['Onion', '1/2', 'Vegetables'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Whisk curd smooth.', 'Fold in chana and onion.', 'Top with chaat masala and coriander.'],
  },
  {
    id: 'r_veg_biryani', name: 'Vegetable biryani', emoji: '🍚',
    cuisine: 'Mughlai', slots: ['lunch', 'dinner'],
    kcal: 560, protein: 14, carbs: 82, fat: 19, fibre: 8, prepMins: 55, difficulty: 3, costRupees: 90,
    veg: true, vegan: false, gi: 65, goalTags: ['maintenance'],
    tasteTags: ['rich', 'aromatic'], tags: ['festive', 'weekend', 'heavy'],
    ingredients: [['Basmati rice', '1.5 cups', 'Grains'], ['Mixed vegetables', '2 cups', 'Vegetables'], ['Curd', '1/2 cup', 'Dairy'], ['Biryani masala', '2 tbsp', 'Pantry'], ['Fried onion', '1/2 cup', 'Vegetables']],
    steps: ['Par-boil rice with whole spices.', 'Cook vegetables in spiced curd masala.', 'Layer rice and masala, dum on low heat 20 minutes.'],
  },
  {
    id: 'r_omelette_toast', name: 'Three-egg omelette with toast', emoji: '🍳',
    cuisine: 'Continental', slots: ['breakfast'],
    kcal: 430, protein: 26, carbs: 30, fat: 23, fibre: 4, prepMins: 12, difficulty: 1, costRupees: 45,
    veg: false, vegan: false, egg: true, goalTags: ['muscle_gain', 'energy'],
    tasteTags: ['savoury'], tags: ['quick', 'high-protein'],
    ingredients: [['Eggs', '3', 'Protein'], ['Brown bread', '2 slices', 'Grains'], ['Onion & tomato', '1 each', 'Vegetables'], ['Butter', '1 tsp', 'Dairy']],
    steps: ['Beat eggs with chopped vegetables and salt.', 'Cook on medium heat, fold once.', 'Serve with toast.'],
  },
  {
    id: 'r_thepla_curd', name: 'Methi thepla with curd', emoji: '🫓',
    cuisine: 'Gujarati', slots: ['breakfast', 'lunch'],
    kcal: 400, protein: 14, carbs: 52, fat: 15, fibre: 8, prepMins: 30, difficulty: 2, costRupees: 38,
    veg: true, vegan: false, gi: 55, goalTags: ['consistency', 'maintenance'],
    tasteTags: ['savoury', 'herby'], tags: ['travel-friendly', 'meal-prep'],
    ingredients: [['Wheat flour', '150 g', 'Grains'], ['Fenugreek leaves', '1 cup', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Gram flour', '2 tbsp', 'Pantry']],
    steps: ['Knead flours with chopped methi, curd and spices.', 'Roll thin and cook on a tawa with a little oil.', 'Keeps well for a day of travel.'],
  },
  {
    id: 'r_paneer_bhurji_roti', name: 'Paneer bhurji with roti', emoji: '🧀',
    cuisine: 'North Indian', slots: ['breakfast', 'dinner'],
    kcal: 520, protein: 28, carbs: 40, fat: 27, fibre: 6, prepMins: 20, difficulty: 1, costRupees: 85,
    veg: true, vegan: false, gi: 40, goalTags: ['muscle_gain'],
    tasteTags: ['savoury', 'spiced'], tags: ['high-protein', 'quick'],
    ingredients: [['Paneer', '150 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Wheat flour', '100 g', 'Grains']],
    steps: ['Crumble paneer.', 'Sauté onion and tomato, add paneer and spices.', 'Cook three minutes; serve with rotis.'],
  },
  {
    id: 'r_millet_khichdi', name: 'Bajra vegetable khichdi', emoji: '🌾',
    cuisine: 'Gujarati', slots: ['lunch', 'dinner'],
    kcal: 400, protein: 14, carbs: 58, fat: 11, fibre: 12, prepMins: 30, difficulty: 2, costRupees: 35,
    veg: true, vegan: true, gi: 50, goalTags: ['fat_loss', 'wellness'],
    tasteTags: ['earthy'], tags: ['millet', 'high-fibre', 'low-gi', 'vegan', 'diabetes-friendly'],
    ingredients: [['Bajra', '1/2 cup', 'Grains'], ['Moong dal', '1/4 cup', 'Pantry'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Soak bajra four hours.', 'Pressure cook with dal, vegetables and turmeric.', 'Temper with cumin.'],
  },
  {
    id: 'r_chicken_curry_roti', name: 'Home-style chicken curry with roti', emoji: '🍗',
    cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 540, protein: 38, carbs: 42, fat: 24, fibre: 6, prepMins: 45, difficulty: 2, costRupees: 120,
    veg: false, vegan: false, goalTags: ['muscle_gain', 'maintenance'],
    tasteTags: ['spiced', 'comfort'], tags: ['high-protein', 'classic'],
    ingredients: [['Chicken', '250 g', 'Protein'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Wheat flour', '100 g', 'Grains'], ['Ginger-garlic', '1 tbsp', 'Vegetables']],
    steps: ['Brown onions, add ginger-garlic and tomatoes.', 'Add chicken and spices, cook covered 25 minutes.', 'Serve with rotis.'],
  },
  {
    id: 'r_greek_yog_fruit', name: 'Greek yogurt with fruit and nuts', emoji: '🍓',
    cuisine: 'Continental', slots: ['snack', 'breakfast'],
    kcal: 280, protein: 20, carbs: 28, fat: 10, fibre: 4, prepMins: 5, difficulty: 1, costRupees: 90,
    veg: true, vegan: false, gi: 25, goalTags: ['muscle_gain', 'fat_loss'],
    tasteTags: ['sweet', 'fresh'], tags: ['no-cook', 'high-protein', 'quick'],
    ingredients: [['Greek yogurt', '150 g', 'Dairy'], ['Seasonal fruit', '1 cup', 'Fruit'], ['Almonds', '10', 'Protein']],
    steps: ['Spoon yogurt into a bowl.', 'Top with chopped fruit and nuts.'],
  },
  {
    id: 'r_masala_dosa', name: 'Masala dosa with chutney', emoji: '🥞',
    cuisine: 'South Indian', slots: ['breakfast', 'dinner'],
    kcal: 450, protein: 10, carbs: 66, fat: 16, fibre: 6, prepMins: 25, difficulty: 2, costRupees: 45,
    veg: true, vegan: true, gi: 65, goalTags: ['maintenance', 'energy'],
    tasteTags: ['crisp', 'savoury'], tags: ['classic', 'vegan'],
    ingredients: [['Dosa batter', '2 cups', 'Grains'], ['Potato', '2', 'Vegetables'], ['Coconut', '1/2 cup', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry']],
    steps: ['Make the potato masala with mustard, onion and turmeric.', 'Spread batter thin on a hot tawa.', 'Fill and fold; serve with coconut chutney.'],
  },
];

/* ============================================================
   Wider seed set.

   PROVENANCE: these rows are seed data written for the prototype
   from standard Indian home portions and published composition
   tables. They are not dietitian-curated and not chef-refined —
   the marketing plan treats that curation as work still to be
   commissioned, and the app should not imply it has happened.
   ============================================================ */

const S2: Seed[] = [
  /* ------------------------------ breakfast ----------------------------- */
  { id: 'r_besan_toast', name: 'Besan toast with onion', emoji: '🍞', cuisine: 'North Indian', slots: ['breakfast'],
    kcal: 330, protein: 15, carbs: 40, fat: 12, fibre: 6, prepMins: 12, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 55, goalTags: ['fat_loss', 'energy'], tasteTags: ['savoury'], tags: ['quick', 'high-protein'],
    occasions: ['everyday', 'office-lunch'], satiety: 2, portable: true,
    ingredients: [['Gram flour', '50 g', 'Grains'], ['Bread', '3', 'Grains'], ['Onion', '1', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Whisk gram flour with water, onion, turmeric and salt into a thick batter.', 'Coat each slice and pan-fry on low heat.', 'Serve hot with chutney or ketchup.'] },

  { id: 'r_ragi_dosa', name: 'Ragi dosa with coconut chutney', emoji: '🥞', cuisine: 'South Indian', slots: ['breakfast', 'dinner'],
    kcal: 340, protein: 11, carbs: 52, fat: 9, fibre: 8, prepMins: 20, difficulty: 2, costRupees: 34,
    veg: true, vegan: true, gi: 48, goalTags: ['wellness', 'fat_loss'], tasteTags: ['earthy'], tags: ['millet', 'high-fibre'],
    satiety: 2, batchFriendly: true,
    ingredients: [['Ragi flour', '80 g', 'Grains'], ['Rice', '20 g', 'Grains'], ['Coconut', '1/4 cup', 'Fruit'], ['Green chilli', '1', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry']],
    steps: ['Mix ragi and rice flour with water and salt to a thin batter; rest 10 minutes.', 'Pour on a hot tawa and cook until the edges lift.', 'Grind coconut with chilli for the chutney.'] },

  { id: 'r_oats_upma', name: 'Oats upma with vegetables', emoji: '🥣', cuisine: 'South Indian', slots: ['breakfast'],
    kcal: 310, protein: 12, carbs: 44, fat: 9, fibre: 9, prepMins: 15, difficulty: 1, costRupees: 32,
    veg: true, vegan: true, gi: 52, goalTags: ['fat_loss', 'wellness'], tasteTags: ['savoury'], tags: ['quick', 'high-fibre'],
    satiety: 3,
    ingredients: [['Oats', '60 g', 'Grains'], ['Carrot & peas', '1 cup', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '8', 'Vegetables']],
    steps: ['Dry-roast the oats for two minutes.', 'Temper mustard and curry leaves, add onion and vegetables.', 'Add oats and hot water, cook until it thickens.'] },

  { id: 'r_paneer_paratha', name: 'Paneer paratha with curd', emoji: '🫓', cuisine: 'Punjabi', slots: ['breakfast', 'dinner'],
    kcal: 480, protein: 24, carbs: 48, fat: 22, fibre: 6, prepMins: 25, difficulty: 2, costRupees: 62,
    veg: true, vegan: false, gi: 55, goalTags: ['muscle_gain', 'performance'], tasteTags: ['rich', 'savoury'], tags: ['high-protein', 'filling'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Wheat flour', '80 g', 'Grains'], ['Paneer', '100 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Ghee', '1 tsp', 'Dairy']],
    steps: ['Knead the flour into a soft dough.', 'Crumble paneer with onion, chilli and salt for the filling.', 'Stuff, roll and cook on a tawa with a little ghee.'] },

  { id: 'r_veg_vermicelli', name: 'Vegetable vermicelli upma', emoji: '🍜', cuisine: 'South Indian', slots: ['breakfast', 'snack'],
    kcal: 300, protein: 9, carbs: 50, fat: 7, fibre: 5, prepMins: 15, difficulty: 1, costRupees: 28,
    veg: true, vegan: true, gi: 62, goalTags: ['energy'], tasteTags: ['savoury'], tags: ['quick'],
    satiety: 2, portable: true,
    ingredients: [['Vermicelli', '70 g', 'Grains'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Roast the vermicelli until pale gold.', 'Temper mustard, add onion and vegetables, cook three minutes.', 'Add vermicelli and hot water, cover until absorbed.'] },

  { id: 'r_moong_dosa', name: 'Green moong pesarattu', emoji: '🥞', cuisine: 'South Indian', slots: ['breakfast', 'dinner'],
    kcal: 360, protein: 20, carbs: 46, fat: 10, fibre: 11, prepMins: 20, difficulty: 2, costRupees: 30,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss', 'muscle_gain'], tasteTags: ['earthy'], tags: ['high-protein', 'high-fibre'],
    satiety: 3,
    ingredients: [['Green moong', '100 g', 'Protein'], ['Ginger', '1 inch', 'Vegetables'], ['Green chilli', '2', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Soak green moong overnight, grind with ginger and chilli.', 'Spread thin on a hot tawa, scatter onion on top.', 'Cook both sides and serve with chutney.'] },

  { id: 'r_egg_paratha', name: 'Egg stuffed paratha', emoji: '🍳', cuisine: 'North Indian', slots: ['breakfast'],
    kcal: 420, protein: 22, carbs: 44, fat: 18, fibre: 5, prepMins: 20, difficulty: 2, costRupees: 42,
    veg: false, vegan: false, egg: true, gi: 58, goalTags: ['muscle_gain', 'performance'], tasteTags: ['savoury'], tags: ['high-protein'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Wheat flour', '80 g', 'Grains'], ['Eggs', '2', 'Protein'], ['Onion', '1', 'Vegetables'], ['Green chilli', '1', 'Vegetables'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Roll a paratha and half-cook it on the tawa.', 'Beat eggs with onion and chilli, pour into the pocket.', 'Seal and cook until the egg is set.'] },

  { id: 'r_muesli_curd', name: 'Muesli with curd and banana', emoji: '🥛', cuisine: 'Continental', slots: ['breakfast', 'snack'],
    kcal: 380, protein: 16, carbs: 56, fat: 10, fibre: 7, prepMins: 3, difficulty: 1, costRupees: 55,
    veg: true, vegan: false, gi: 55, goalTags: ['energy', 'consistency'], tasteTags: ['sweet'], tags: ['no-cook', 'quick'],
    noCook: true, satiety: 2, occasions: ['everyday', 'post-workout'],
    ingredients: [['Muesli', '60 g', 'Grains'], ['Curd', '200 g', 'Dairy'], ['Banana', '1', 'Fruit'], ['Honey', '1 tsp', 'Pantry']],
    steps: ['Spoon curd into a bowl.', 'Add muesli and sliced banana.', 'Drizzle honey and eat straight away so it stays crunchy.'] },

  { id: 'r_pb_toast', name: 'Peanut butter banana toast', emoji: '🍌', cuisine: 'Continental', slots: ['breakfast', 'snack'],
    kcal: 350, protein: 13, carbs: 44, fat: 14, fibre: 6, prepMins: 4, difficulty: 1, costRupees: 32,
    veg: true, vegan: true, gi: 55, goalTags: ['energy', 'performance'], tasteTags: ['sweet'], tags: ['quick', 'no-cook'],
    noCook: true, satiety: 2, portable: true, occasions: ['everyday', 'post-workout'],
    ingredients: [['Brown bread', '2 slices', 'Grains'], ['Peanut butter', '2 tbsp', 'Protein'], ['Banana', '1', 'Fruit']],
    steps: ['Toast the bread if you have a toaster; it works untoasted too.', 'Spread peanut butter.', 'Top with banana slices.'] },

  { id: 'r_masala_omelette', name: 'Masala omelette with toast', emoji: '🍳', cuisine: 'North Indian', slots: ['breakfast'],
    kcal: 390, protein: 24, carbs: 30, fat: 20, fibre: 4, prepMins: 10, difficulty: 1, costRupees: 40,
    veg: false, vegan: false, egg: true, gi: 50, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['savoury', 'spicy'], tags: ['quick', 'high-protein'],
    satiety: 3,
    ingredients: [['Eggs', '3', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Brown bread', '2 slices', 'Grains'], ['Green chilli', '1', 'Vegetables']],
    steps: ['Beat the eggs with chopped onion, tomato, chilli and salt.', 'Cook on a hot pan, folding once.', 'Serve with toast.'] },

  { id: 'r_sprouts_poha', name: 'Poha with sprouts', emoji: '🍚', cuisine: 'Maharashtrian', slots: ['breakfast'],
    kcal: 320, protein: 13, carbs: 50, fat: 8, fibre: 7, prepMins: 15, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 58, goalTags: ['fat_loss', 'wellness'], tasteTags: ['savoury'], tags: ['quick', 'high-fibre'],
    satiety: 2,
    ingredients: [['Poha', '70 g', 'Grains'], ['Moong sprouts', '1 cup', 'Protein'], ['Onion', '1', 'Vegetables'], ['Peanuts', '2 tbsp', 'Protein'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Rinse the poha and drain well.', 'Temper mustard and peanuts, add onion and sprouts.', 'Fold in the poha with turmeric and salt.'] },

  { id: 'r_ragi_porridge', name: 'Ragi porridge with jaggery', emoji: '🥣', cuisine: 'South Indian', slots: ['breakfast'],
    kcal: 300, protein: 9, carbs: 54, fat: 5, fibre: 8, prepMins: 10, difficulty: 1, costRupees: 24,
    veg: true, vegan: false, gi: 50, goalTags: ['wellness', 'energy'], tasteTags: ['sweet', 'earthy'], tags: ['quick', 'high-fibre'],
    satiety: 2, kitchens: ['home', 'hostel', 'pg'], equipment: ['stove'],
    ingredients: [['Ragi flour', '50 g', 'Grains'], ['Milk', '1 cup', 'Dairy'], ['Jaggery', '2 tbsp', 'Pantry'], ['Almonds', '6', 'Protein']],
    steps: ['Whisk ragi flour into cold water so it does not lump.', 'Cook with milk on low heat until thick.', 'Stir in jaggery and top with chopped almonds.'] },

  { id: 'r_chana_chaat_bowl', name: 'White chana breakfast bowl', emoji: '🥗', cuisine: 'North Indian', slots: ['breakfast', 'snack'],
    kcal: 330, protein: 17, carbs: 44, fat: 9, fibre: 12, prepMins: 8, difficulty: 1, costRupees: 34,
    veg: true, vegan: true, gi: 40, goalTags: ['fat_loss', 'wellness'], tasteTags: ['tangy'], tags: ['no-cook', 'high-fibre', 'high-protein'],
    noCook: true, satiety: 3, portable: true,
    ingredients: [['Boiled chickpeas', '150 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Chop the onion and tomato fine.', 'Toss with the chickpeas, lemon and chaat masala.', 'Eat cold; it keeps well in a box.'] },

  { id: 'r_jowar_upma', name: 'Jowar upma', emoji: '🥣', cuisine: 'Maharashtrian', slots: ['breakfast'],
    kcal: 320, protein: 10, carbs: 52, fat: 8, fibre: 9, prepMins: 18, difficulty: 2, costRupees: 26,
    veg: true, vegan: true, gi: 50, goalTags: ['wellness', 'fat_loss'], tasteTags: ['earthy'], tags: ['millet', 'high-fibre'],
    satiety: 3,
    ingredients: [['Jowar', '70 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Carrot & peas', '1/2 cup', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '8', 'Vegetables']],
    steps: ['Coarsely grind or use broken jowar.', 'Temper, add vegetables and cook briefly.', 'Add jowar and water, cover until soft.'] },

  { id: 'r_cornflakes_milk', name: 'Corn flakes with milk and fruit', emoji: '🥣', cuisine: 'Continental', slots: ['breakfast'],
    kcal: 300, protein: 11, carbs: 52, fat: 5, fibre: 4, prepMins: 2, difficulty: 1, costRupees: 34,
    veg: true, vegan: false, gi: 74, goalTags: ['energy'], tasteTags: ['sweet'], tags: ['no-cook', 'quick'],
    noCook: true, satiety: 1,
    ingredients: [['Corn flakes', '50 g', 'Grains'], ['Milk', '1 cup', 'Dairy'], ['Apple', '1', 'Fruit']],
    steps: ['Pour the flakes into a bowl.', 'Add cold or warm milk.', 'Top with chopped apple.'] },

  /* -------------------------- lunch and dinner -------------------------- */
  { id: 'r_rajma_salad', name: 'Rajma and corn salad', emoji: '🥗', cuisine: 'North Indian', slots: ['lunch', 'snack'],
    kcal: 350, protein: 18, carbs: 46, fat: 9, fibre: 14, prepMins: 10, difficulty: 1, costRupees: 40,
    veg: true, vegan: true, gi: 38, goalTags: ['fat_loss', 'wellness'], tasteTags: ['fresh', 'tangy'], tags: ['no-cook', 'high-fibre'],
    noCook: true, satiety: 3, portable: true, occasions: ['everyday', 'office-lunch'],
    ingredients: [['Rajma', '120 g', 'Protein'], ['Sweet corn', '1/2 cup', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Cucumber', '1', 'Vegetables'], ['Lemon', '1', 'Fruit']],
    steps: ['Use boiled or tinned rajma, drained.', 'Toss everything with lemon, salt and pepper.', 'Chill for ten minutes if you have time.'] },

  { id: 'r_chole_rice', name: 'Chole with jeera rice', emoji: '🍛', cuisine: 'Punjabi', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 19, carbs: 78, fat: 14, fibre: 13, prepMins: 30, difficulty: 2, costRupees: 55,
    veg: true, vegan: true, gi: 52, goalTags: ['maintenance', 'energy'], tasteTags: ['spicy', 'rich'], tags: ['classic', 'filling'],
    satiety: 3, kitchens: ['home', 'pg'], batchFriendly: true,
    ingredients: [['Boiled chickpeas', '150 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Brown onion, add ginger-garlic and tomato until the oil separates.', 'Add chickpeas and simmer twenty minutes.', 'Temper rice with cumin and serve alongside.'] },

  { id: 'r_paneer_bowl', name: 'Paneer and quinoa bowl', emoji: '🥣', cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 470, protein: 30, carbs: 44, fat: 18, fibre: 8, prepMins: 20, difficulty: 2, costRupees: 110,
    veg: true, vegan: false, gi: 45, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['fresh'], tags: ['high-protein', 'meal-prep'],
    satiety: 3, portable: true, occasions: ['everyday', 'office-lunch', 'post-workout'],
    ingredients: [['Quinoa', '70 g', 'Grains'], ['Paneer', '100 g', 'Protein'], ['Capsicum', '1', 'Vegetables'], ['Cucumber', '1', 'Vegetables'], ['Lemon', '1', 'Fruit']],
    steps: ['Rinse and boil the quinoa until the germ uncoils.', 'Pan-sear cubed paneer with salt and pepper.', 'Toss everything with lemon and olive oil or mustard.'] },

  { id: 'r_lauki_chana_dal', name: 'Lauki chana dal with roti', emoji: '🍲', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 420, protein: 18, carbs: 58, fat: 11, fibre: 12, prepMins: 30, difficulty: 2, costRupees: 40,
    veg: true, vegan: true, gi: 42, goalTags: ['fat_loss', 'wellness'], tasteTags: ['mild'], tags: ['high-fibre', 'homely'],
    satiety: 3, kitchens: ['home', 'pg'], batchFriendly: true,
    ingredients: [['Chana dal', '80 g', 'Protein'], ['Bottle gourd', '200 g', 'Vegetables'], ['Wheat flour', '60 g', 'Grains'], ['Tomato', '1', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Pressure cook chana dal with diced lauki and turmeric.', 'Temper cumin and tomato, add to the dal.', 'Serve with two rotis.'] },

  { id: 'r_veg_khichdi_curd', name: 'Vegetable khichdi with curd', emoji: '🍚', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 420, protein: 17, carbs: 62, fat: 10, fibre: 10, prepMins: 25, difficulty: 1, costRupees: 38,
    veg: true, vegan: false, gi: 50, goalTags: ['wellness', 'consistency'], tasteTags: ['mild', 'comforting'], tags: ['one-pot', 'homely'],
    satiety: 3, kitchens: ['home', 'hostel', 'pg'], batchFriendly: true,
    ingredients: [['Rice', '1/2 cup', 'Grains'], ['Moong dal', '60 g', 'Protein'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Ghee', '1 tsp', 'Dairy']],
    steps: ['Rinse rice and dal together.', 'Pressure cook with vegetables, turmeric and salt.', 'Finish with ghee and serve with curd.'] },

  { id: 'r_soya_keema', name: 'Soya keema with pav', emoji: '🌯', cuisine: 'Maharashtrian', slots: ['lunch', 'dinner'],
    kcal: 460, protein: 28, carbs: 52, fat: 15, fibre: 11, prepMins: 25, difficulty: 2, costRupees: 50,
    veg: true, vegan: true, gi: 55, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['spicy'], tags: ['high-protein', 'budget'],
    satiety: 3, batchFriendly: true,
    ingredients: [['Soya chunks', '80 g', 'Protein'], ['Bread', '2', 'Grains'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Pav bhaji masala', '1 tbsp', 'Pantry']],
    steps: ['Soak soya chunks in hot water, squeeze dry and mince.', 'Brown onion and tomato, add the masala.', 'Add the soya, cook ten minutes and serve with pav.'] },

  { id: 'r_fish_light_curry', name: 'Light fish curry with rice', emoji: '🐟', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 480, protein: 34, carbs: 56, fat: 12, fibre: 4, prepMins: 30, difficulty: 2, costRupees: 120,
    veg: false, vegan: false, gi: 55, goalTags: ['muscle_gain', 'performance'], tasteTags: ['tangy'], tags: ['high-protein'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Fish fillet', '150 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Mustard paste', '1 tbsp', 'Pantry'], ['Tomato', '1', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Marinate the fish with turmeric and salt.', 'Simmer in a thin mustard and tomato gravy.', 'Serve with steamed rice.'] },

  { id: 'r_chicken_bowl_brown', name: 'Chicken and brown rice bowl', emoji: '🍗', cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 42, carbs: 52, fat: 14, fibre: 7, prepMins: 25, difficulty: 2, costRupees: 130,
    veg: false, vegan: false, gi: 50, goalTags: ['muscle_gain', 'performance'], tasteTags: ['savoury'], tags: ['high-protein', 'meal-prep'],
    satiety: 3, portable: true, occasions: ['everyday', 'post-workout', 'office-lunch'],
    ingredients: [['Chicken breast', '150 g', 'Protein'], ['Brown rice', '70 g', 'Grains'], ['Broccoli or beans', '1 cup', 'Vegetables'], ['Garlic', '3', 'Vegetables'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Marinate and grill or pan-cook the chicken.', 'Boil the brown rice.', 'Steam the greens and assemble with garlic and pepper.'] },

  { id: 'r_mushroom_masala', name: 'Mushroom masala with roti', emoji: '🍄', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 400, protein: 16, carbs: 48, fat: 16, fibre: 9, prepMins: 25, difficulty: 2, costRupees: 70,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss', 'wellness'], tasteTags: ['savoury'], tags: ['low-calorie'],
    satiety: 2, kitchens: ['home', 'pg'],
    ingredients: [['Mushroom', '200 g', 'Vegetables'], ['Wheat flour', '60 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Sauté mushrooms on high heat until the water evaporates.', 'Add onion-tomato masala and cook down.', 'Serve with two rotis.'] },

  { id: 'r_lobia_curry', name: 'Lobia curry with rice', emoji: '🍲', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 460, protein: 20, carbs: 70, fat: 10, fibre: 14, prepMins: 30, difficulty: 2, costRupees: 42,
    veg: true, vegan: true, gi: 42, goalTags: ['wellness', 'fat_loss'], tasteTags: ['mild'], tags: ['high-fibre', 'budget'],
    satiety: 3, kitchens: ['home', 'pg'], batchFriendly: true,
    ingredients: [['Lobia', '120 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Onion', '1', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Coriander powder', '1 tsp', 'Pantry']],
    steps: ['Soak lobia for a few hours, then pressure cook.', 'Make an onion-tomato base and add the beans.', 'Simmer and serve with rice.'] },

  { id: 'r_egg_curry_rice', name: 'Egg curry with rice', emoji: '🥚', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 510, protein: 26, carbs: 62, fat: 18, fibre: 5, prepMins: 25, difficulty: 2, costRupees: 60,
    veg: false, vegan: false, egg: true, gi: 55, goalTags: ['muscle_gain'], tasteTags: ['spicy'], tags: ['high-protein'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Eggs', '3', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Boil the eggs and halve them.', 'Cook an onion-tomato gravy with the spices.', 'Add the eggs, simmer five minutes, serve with rice.'] },

  { id: 'r_pumpkin_dal_rice', name: 'Pumpkin dal with rice', emoji: '🎃', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 410, protein: 16, carbs: 66, fat: 8, fibre: 11, prepMins: 25, difficulty: 1, costRupees: 32,
    veg: true, vegan: true, gi: 48, goalTags: ['wellness'], tasteTags: ['mild', 'sweet'], tags: ['budget', 'homely'],
    satiety: 3, kitchens: ['home', 'hostel', 'pg'],
    ingredients: [['Masoor dal', '80 g', 'Protein'], ['Pumpkin', '200 g', 'Vegetables'], ['Rice', '1/2 cup', 'Grains'], ['Cumin', '1 tsp', 'Pantry'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Cook dal with diced pumpkin and turmeric until both collapse.', 'Temper with cumin.', 'Serve over rice.'] },

  { id: 'r_tofu_bhurji_roti', name: 'Tofu bhurji with roti', emoji: '🍳', cuisine: 'North Indian', slots: ['lunch', 'dinner', 'breakfast'],
    kcal: 420, protein: 27, carbs: 42, fat: 16, fibre: 8, prepMins: 18, difficulty: 1, costRupees: 62,
    veg: true, vegan: true, gi: 42, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['savoury'], tags: ['high-protein', 'vegan'],
    satiety: 3,
    ingredients: [['Tofu', '150 g', 'Protein'], ['Wheat flour', '60 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Crumble the tofu.', 'Cook onion and tomato with turmeric, then fold in the tofu.', 'Serve with two rotis.'] },

  { id: 'r_prawn_pulao', name: 'Prawn pulao', emoji: '🍤', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 500, protein: 32, carbs: 62, fat: 14, fibre: 5, prepMins: 30, difficulty: 3, costRupees: 150,
    veg: false, vegan: false, gi: 58, goalTags: ['muscle_gain', 'performance'], tasteTags: ['rich'], tags: ['high-protein', 'social'],
    satiety: 3, kitchens: ['home'], occasions: ['everyday', 'social'],
    ingredients: [['Prawns', '150 g', 'Protein'], ['Basmati rice', '1 cup', 'Grains'], ['Onion', '2', 'Vegetables'], ['Ginger-garlic', '1 tbsp', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Sear the prawns briefly and set aside so they do not toughen.', 'Fry onion and ginger-garlic, add rice and water.', 'Fold the prawns back in for the last five minutes.'] },

  { id: 'r_cabbage_paratha', name: 'Cabbage paratha with curd', emoji: '🫓', cuisine: 'Punjabi', slots: ['lunch', 'dinner', 'breakfast'],
    kcal: 380, protein: 14, carbs: 52, fat: 13, fibre: 9, prepMins: 22, difficulty: 2, costRupees: 32,
    veg: true, vegan: false, gi: 52, goalTags: ['fat_loss', 'wellness'], tasteTags: ['mild'], tags: ['budget', 'high-fibre'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Wheat flour', '80 g', 'Grains'], ['Cabbage', '150 g', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Green chilli', '1', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Grate the cabbage and squeeze out the water.', 'Mix into the dough with chilli, cumin and salt.', 'Roll and cook on a tawa; serve with curd.'] },

  /* --------------------------- snacks and quick -------------------------- */
  { id: 'r_curd_fruit_nuts', name: 'Curd with fruit and seeds', emoji: '🥣', cuisine: 'Continental', slots: ['snack', 'breakfast'],
    kcal: 260, protein: 14, carbs: 30, fat: 9, fibre: 5, prepMins: 3, difficulty: 1, costRupees: 42,
    veg: true, vegan: false, gi: 35, goalTags: ['fat_loss', 'wellness'], tasteTags: ['fresh', 'sweet'], tags: ['no-cook', 'quick'],
    noCook: true, satiety: 2, occasions: ['everyday', 'post-workout'],
    ingredients: [['Curd', '200 g', 'Dairy'], ['Seasonal fruit', '1 cup', 'Fruit'], ['Pumpkin seeds', '2 tbsp', 'Protein']],
    steps: ['Spoon the curd into a bowl.', 'Add chopped fruit.', 'Scatter seeds on top.'] },

  { id: 'r_bhel', name: 'Sprouted bhel', emoji: '🥗', cuisine: 'Maharashtrian', slots: ['snack'],
    kcal: 240, protein: 10, carbs: 38, fat: 6, fibre: 8, prepMins: 8, difficulty: 1, costRupees: 26,
    veg: true, vegan: true, gi: 55, goalTags: ['fat_loss'], tasteTags: ['tangy', 'crisp'], tags: ['no-cook', 'quick', 'budget'],
    noCook: true, satiety: 2, portable: true,
    ingredients: [['Puffed rice', '40 g', 'Grains'], ['Moong sprouts', '1/2 cup', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Toss everything together just before eating.', 'Add lemon and chaat masala.', 'Eat immediately so the puffed rice stays crisp.'] },

  { id: 'r_roasted_chana_snack', name: 'Roasted chana and peanuts', emoji: '🥜', cuisine: 'North Indian', slots: ['snack'],
    kcal: 230, protein: 12, carbs: 24, fat: 10, fibre: 7, prepMins: 2, difficulty: 1, costRupees: 20,
    veg: true, vegan: true, gi: 35, goalTags: ['fat_loss', 'muscle_gain'], tasteTags: ['crisp'], tags: ['no-cook', 'quick', 'budget', 'portable'],
    noCook: true, satiety: 2, portable: true, occasions: ['everyday', 'travel'],
    ingredients: [['Roasted chana', '40 g', 'Protein'], ['Peanuts', '20 g', 'Protein'], ['Chaat masala', '1/2 tsp', 'Pantry']],
    steps: ['Mix in a bowl or a box.', 'Dust with chaat masala.'] },

  { id: 'r_masala_chaas', name: 'Masala chaas with roasted chana', emoji: '🥛', cuisine: 'Gujarati', slots: ['snack'],
    kcal: 190, protein: 11, carbs: 22, fat: 6, fibre: 5, prepMins: 4, difficulty: 1, costRupees: 22,
    veg: true, vegan: false, gi: 30, goalTags: ['fat_loss', 'wellness'], tasteTags: ['tangy', 'cooling'], tags: ['no-cook', 'quick'],
    noCook: true, satiety: 1,
    ingredients: [['Buttermilk', '1 cup', 'Dairy'], ['Roasted chana', '30 g', 'Protein'], ['Cumin', '1/2 tsp', 'Pantry'], ['Mint', '4', 'Vegetables']],
    steps: ['Whisk buttermilk with roasted cumin, salt and crushed mint.', 'Serve cold with roasted chana on the side.'] },

  { id: 'r_paneer_tikka_snack', name: 'Pan-tikka paneer cubes', emoji: '🧀', cuisine: 'Punjabi', slots: ['snack'],
    kcal: 280, protein: 22, carbs: 10, fat: 18, fibre: 2, prepMins: 12, difficulty: 1, costRupees: 75,
    veg: true, vegan: false, gi: 25, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['smoky'], tags: ['high-protein', 'low-carb'],
    satiety: 2, occasions: ['everyday', 'post-workout', 'social'],
    ingredients: [['Paneer', '120 g', 'Protein'], ['Curd', '2 tbsp', 'Dairy'], ['Tandoori masala', '1 tsp', 'Pantry'], ['Capsicum', '1', 'Vegetables']],
    steps: ['Marinate paneer and capsicum in spiced curd for fifteen minutes.', 'Sear in a hot pan until charred at the edges.'] },

  { id: 'r_sweet_potato_chaat', name: 'Sweet potato chaat', emoji: '🍠', cuisine: 'North Indian', slots: ['snack'],
    kcal: 250, protein: 6, carbs: 48, fat: 5, fibre: 8, prepMins: 15, difficulty: 1, costRupees: 28,
    veg: true, vegan: true, gi: 55, goalTags: ['energy', 'wellness'], tasteTags: ['sweet', 'tangy'], tags: ['high-fibre'],
    satiety: 2, occasions: ['everyday', 'fasting'],
    ingredients: [['Sweet potato', '200 g', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry'], ['Coriander', '4', 'Vegetables']],
    steps: ['Boil or roast the sweet potato until tender.', 'Cube it and toss with lemon and chaat masala.', 'Finish with coriander.'] },

  { id: 'r_protein_shake_banana', name: 'Banana protein shake', emoji: '🥤', cuisine: 'Continental', slots: ['snack'],
    kcal: 300, protein: 28, carbs: 38, fat: 4, fibre: 3, prepMins: 3, difficulty: 1, costRupees: 70,
    veg: true, vegan: false, gi: 50, goalTags: ['muscle_gain', 'performance'], tasteTags: ['sweet'], tags: ['no-cook', 'quick', 'high-protein'],
    noCook: true, equipment: ['blender'], satiety: 2, occasions: ['post-workout'],
    ingredients: [['Whey protein', '30 g', 'Protein'], ['Milk', '1 cup', 'Dairy'], ['Banana', '1', 'Fruit']],
    steps: ['Blend everything with a little ice.', 'Drink within the hour after training.'] },

  { id: 'r_makhana_roast', name: 'Roasted makhana with peanuts', emoji: '🍿', cuisine: 'North Indian', slots: ['snack'],
    kcal: 210, protein: 8, carbs: 28, fat: 8, fibre: 5, prepMins: 8, difficulty: 1, costRupees: 30,
    veg: true, vegan: false, gi: 45, goalTags: ['fat_loss'], tasteTags: ['crisp'], tags: ['budget', 'fasting'],
    satiety: 1, portable: true, occasions: ['everyday', 'fasting', 'travel'],
    ingredients: [['Puffed rice', '20 g', 'Grains'], ['Peanuts', '20 g', 'Protein'], ['Ghee', '1 tsp', 'Dairy'], ['Rock salt', '1/2 tsp', 'Pantry']],
    steps: ['Roast the peanuts in ghee until they colour.', 'Add the puffed grain and toss for two minutes.', 'Season with rock salt.'] },

  /* --------------------- hostel, office and no-kitchen ------------------- */
  { id: 'r_hostel_oats_pb', name: 'Kettle oats with peanut butter', emoji: '🥣', cuisine: 'Continental', slots: ['breakfast', 'snack'],
    kcal: 380, protein: 16, carbs: 48, fat: 15, fibre: 8, prepMins: 5, difficulty: 1, costRupees: 36,
    veg: true, vegan: true, gi: 50, goalTags: ['energy', 'consistency'], tasteTags: ['sweet'], tags: ['hostel', 'quick'],
    kitchens: ['hostel', 'office', 'pg', 'home'], equipment: ['kettle'], satiety: 3,
    ingredients: [['Oats', '60 g', 'Grains'], ['Peanut butter', '1 tbsp', 'Protein'], ['Banana', '1', 'Fruit'], ['Honey', '1 tsp', 'Pantry']],
    steps: ['Pour boiling water from a kettle over the oats and cover for three minutes.', 'Stir in peanut butter.', 'Top with banana and honey.'] },

  { id: 'r_microwave_besan_mug', name: 'Microwave besan mug savoury cake', emoji: '☕', cuisine: 'North Indian', slots: ['breakfast', 'snack'],
    kcal: 320, protein: 16, carbs: 36, fat: 12, fibre: 6, prepMins: 6, difficulty: 1, costRupees: 26,
    veg: true, vegan: true, gi: 48, goalTags: ['fat_loss'], tasteTags: ['savoury'], tags: ['hostel', 'quick'],
    kitchens: ['hostel', 'office', 'pg', 'home'], equipment: ['microwave'], satiety: 2,
    ingredients: [['Gram flour', '50 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry'], ['Oil', '1 tsp', 'Pantry']],
    steps: ['Mix gram flour, chopped onion, turmeric, salt and water into a thick batter in a mug.', 'Microwave two minutes, check, then thirty seconds more if needed.'] },

  { id: 'r_office_curd_rice_box', name: 'Office curd rice box', emoji: '🍱', cuisine: 'South Indian', slots: ['lunch'],
    kcal: 380, protein: 14, carbs: 58, fat: 9, fibre: 4, prepMins: 10, difficulty: 1, costRupees: 34,
    veg: true, vegan: false, gi: 55, goalTags: ['consistency', 'wellness'], tasteTags: ['cooling'], tags: ['office', 'portable'],
    satiety: 2, portable: true, occasions: ['office-lunch', 'travel'],
    ingredients: [['Cooked rice', '1 cup', 'Grains'], ['Curd', '200 g', 'Dairy'], ['Cucumber', '1', 'Vegetables'], ['Seasonal fruit', '1/4 cup', 'Fruit'], ['Rock salt', '1/2 tsp', 'Pantry']],
    steps: ['Mash the rice into the curd with salt.', 'Add chopped cucumber.', 'It travels well and needs no reheating.'] },

  { id: 'r_wrap_box', name: 'Chana wrap for the tiffin', emoji: '🌯', cuisine: 'North Indian', slots: ['lunch', 'snack'],
    kcal: 420, protein: 19, carbs: 56, fat: 13, fibre: 12, prepMins: 12, difficulty: 1, costRupees: 44,
    veg: true, vegan: false, gi: 48, goalTags: ['fat_loss', 'consistency'], tasteTags: ['tangy'], tags: ['office', 'portable', 'high-fibre'],
    satiety: 3, portable: true, occasions: ['office-lunch', 'travel'],
    ingredients: [['Wheat tortilla or roti', '2', 'Grains'], ['Boiled chickpeas', '120 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Curd', '2 tbsp', 'Dairy'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Mash the chickpeas roughly with curd and chaat masala.', 'Spread on the rotis with sliced onion.', 'Roll tightly and wrap in foil.'] },

  { id: 'r_mess_upgrade_dal_egg', name: 'Mess dal-rice, upgraded', emoji: '🍛', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 480, protein: 26, carbs: 64, fat: 13, fibre: 8, prepMins: 8, difficulty: 1, costRupees: 45,
    veg: false, vegan: false, egg: true, gi: 55, goalTags: ['muscle_gain', 'consistency'], tasteTags: ['savoury'], tags: ['hostel', 'budget'],
    kitchens: ['hostel', 'pg', 'home'], satiety: 3,
    ingredients: [['Toor dal', '80 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Eggs', '2', 'Protein'], ['Curd', '1 katori', 'Dairy']],
    steps: ['Take the dal and rice from the mess.', 'Add two boiled eggs and a katori of curd.', 'That is roughly fifteen grams of protein the mess plate was missing.'] },

  /* ------------------------ festival and fasting ------------------------- */
  { id: 'r_kuttu_roti_curd', name: 'Kuttu roti with curd (fasting)', emoji: '🫓', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 390, protein: 13, carbs: 54, fat: 13, fibre: 7, prepMins: 20, difficulty: 2, costRupees: 44,
    veg: true, vegan: false, gi: 50, goalTags: ['wellness'], tasteTags: ['earthy'], tags: ['fasting'],
    satiety: 3, occasions: ['fasting', 'festival'], kitchens: ['home', 'pg'],
    ingredients: [['Rajgira flour', '80 g', 'Grains'], ['Potato', '1', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Rock salt', '1/2 tsp', 'Pantry']],
    steps: ['Knead the flour with boiled mashed potato and rock salt.', 'Roll gently between two sheets and cook on a tawa.', 'Serve with curd.'] },

  { id: 'r_festive_thali_light', name: 'Lighter festive thali', emoji: '🪔', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 560, protein: 22, carbs: 74, fat: 19, fibre: 11, prepMins: 35, difficulty: 3, costRupees: 95,
    veg: true, vegan: false, gi: 55, goalTags: ['maintenance'], tasteTags: ['rich'], tags: ['festival', 'social'],
    satiety: 3, occasions: ['festival', 'social'], kitchens: ['home'],
    ingredients: [['Paneer', '80 g', 'Protein'], ['Wheat flour', '60 g', 'Grains'], ['Rice', '1/2 cup', 'Grains'], ['Seasonal vegetable', '1 cup', 'Vegetables'], ['Curd', '1 katori', 'Dairy']],
    steps: ['Keep one fried item only and make the rest tawa-cooked.', 'Fill half the plate with the vegetable and curd.', 'Serve the sweet on a separate small plate so the portion is a decision, not an accident.'] },

  { id: 'r_sabudana_light', name: 'Lighter sabudana khichdi', emoji: '⚪', cuisine: 'Maharashtrian', slots: ['breakfast', 'lunch'],
    kcal: 340, protein: 9, carbs: 52, fat: 12, fibre: 4, prepMins: 20, difficulty: 2, costRupees: 34,
    veg: true, vegan: true, gi: 62, goalTags: ['energy'], tasteTags: ['nutty'], tags: ['fasting'],
    satiety: 2, occasions: ['fasting', 'festival'],
    ingredients: [['Sabudana', '80 g', 'Grains'], ['Peanuts', '2 tbsp', 'Protein'], ['Potato', '1', 'Vegetables'], ['Green chilli', '1', 'Vegetables'], ['Rock salt', '1/2 tsp', 'Pantry']],
    steps: ['Soak sabudana for four hours and drain completely.', 'Use one teaspoon of fat rather than three, and more peanuts for body.', 'Cook until translucent; do not stir it to paste.'] },

  /* ---------------------------- eating out ------------------------------ */
  { id: 'r_eatout_tandoori_plate', name: 'Tandoori plate, restaurant order', emoji: '🍽️', cuisine: 'Punjabi', slots: ['lunch', 'dinner'],
    kcal: 480, protein: 40, carbs: 28, fat: 22, fibre: 6, prepMins: 0, difficulty: 1, costRupees: 320,
    veg: false, vegan: false, gi: 30, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['smoky'], tags: ['eat-out', 'high-protein'],
    noCook: true, kitchens: ['home', 'hostel', 'office', 'pg'], equipment: ['none'], satiety: 3, occasions: ['social'],
    ingredients: [['Chicken', '200 g', 'Protein'], ['Salad vegetables', '1 cup', 'Vegetables'], ['Curd dip', '1/2 cup', 'Dairy']],
    steps: ['Order the tandoori or grilled option rather than the gravy.', 'Ask for extra salad and skip the butter finish.', 'Two rotis, not four, and no naan.'] },

  { id: 'r_eatout_south_plate', name: 'South Indian plate, ordered well', emoji: '🍽️', cuisine: 'South Indian', slots: ['breakfast', 'dinner'],
    kcal: 420, protein: 14, carbs: 62, fat: 13, fibre: 7, prepMins: 0, difficulty: 1, costRupees: 160,
    veg: true, vegan: true, gi: 58, goalTags: ['wellness'], tasteTags: ['savoury'], tags: ['eat-out'],
    noCook: true, kitchens: ['home', 'hostel', 'office', 'pg'], equipment: ['none'], satiety: 2, occasions: ['social'],
    ingredients: [['Idli batter', '1 cup', 'Grains'], ['Toor dal', '1/2 cup', 'Protein'], ['Coconut', '2 tbsp', 'Fruit']],
    steps: ['Two idlis and sambar beat one masala dosa by a wide margin.', 'Ask for extra sambar, which is where the protein is.', 'Skip the vada.'] },

  { id: 'r_eatout_chinese_plate', name: 'Indo-Chinese, ordered well', emoji: '🥡', cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 26, carbs: 62, fat: 18, fibre: 6, prepMins: 0, difficulty: 1, costRupees: 260,
    veg: true, vegan: false, gi: 60, goalTags: ['maintenance'], tasteTags: ['spicy'], tags: ['eat-out'],
    noCook: true, kitchens: ['home', 'hostel', 'office', 'pg'], equipment: ['none'], satiety: 3, occasions: ['social'],
    ingredients: [['Paneer', '100 g', 'Protein'], ['Rice', '1 cup', 'Grains'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Soy sauce', '1 tbsp', 'Pantry']],
    steps: ['Choose steamed rice over fried, and a dry starter over a gravy.', 'Add a protein — paneer, chicken or egg — rather than ordering two carbohydrate dishes.', 'Share the noodles if they arrive.'] },
];

/* ============================================================
   Third batch, written against the gaps the validator measured
   rather than by adding more of what the set already had:
   fast lunches and dinners, high-protein snacks, and the
   regional cuisines that were thin.
   ============================================================ */

const S3: Seed[] = [
  /* ------------------- fast lunches and dinners (<=15m) ------------------ */
  { id: 'r_quick_paneer_toast', name: 'Open paneer chilli toast', emoji: '🧀', cuisine: 'Continental', slots: ['lunch', 'snack', 'dinner'],
    kcal: 400, protein: 25, carbs: 34, fat: 18, fibre: 5, prepMins: 10, difficulty: 1, costRupees: 70,
    veg: true, vegan: false, gi: 48, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['spicy'], tags: ['quick', 'high-protein'],
    satiety: 2,
    ingredients: [['Brown bread', '2 slices', 'Grains'], ['Paneer', '100 g', 'Protein'], ['Capsicum', '1', 'Vegetables'], ['Green chilli', '1', 'Vegetables'], ['Chaat masala', '1/2 tsp', 'Pantry']],
    steps: ['Crumble paneer with chopped capsicum, chilli and chaat masala.', 'Pile on the bread and toast on a pan, covered, for four minutes.'] },

  { id: 'r_quick_dal_tadka_rice', name: 'Ten-minute masoor dal with rice', emoji: '🍲', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 420, protein: 18, carbs: 68, fat: 8, fibre: 11, prepMins: 15, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss', 'wellness'], tasteTags: ['mild'], tags: ['quick', 'budget'],
    satiety: 3, kitchens: ['home', 'hostel', 'pg'],
    ingredients: [['Masoor dal', '80 g', 'Protein'], ['Rice', '1/2 cup', 'Grains'], ['Tomato', '1', 'Vegetables'], ['Cumin', '1 tsp', 'Pantry'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Masoor cooks in ten minutes without soaking — that is the whole trick.', 'Boil with turmeric and salt, temper with cumin and tomato.', 'Serve over rice.'] },

  { id: 'r_quick_egg_fried_rice', name: 'Egg fried rice from leftovers', emoji: '🍚', cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 470, protein: 24, carbs: 58, fat: 16, fibre: 5, prepMins: 12, difficulty: 1, costRupees: 48,
    veg: false, vegan: false, egg: true, gi: 58, goalTags: ['muscle_gain'], tasteTags: ['savoury'], tags: ['quick', 'leftovers'],
    satiety: 3,
    ingredients: [['Cooked rice', '1 cup', 'Grains'], ['Eggs', '2', 'Protein'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Soy sauce', '1 tbsp', 'Pantry'], ['Garlic', '3', 'Vegetables']],
    steps: ['Scramble the eggs and set aside.', 'Fry garlic and vegetables on high heat, add cold rice.', 'Return the egg, splash soy sauce, done.'] },

  { id: 'r_quick_chana_roti', name: 'Five-minute chana roti roll', emoji: '🌯', cuisine: 'North Indian', slots: ['lunch', 'dinner', 'snack'],
    kcal: 390, protein: 18, carbs: 52, fat: 11, fibre: 12, prepMins: 8, difficulty: 1, costRupees: 40,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss'], tasteTags: ['tangy'], tags: ['quick', 'high-fibre'],
    satiety: 3, portable: true,
    ingredients: [['Wheat tortilla or roti', '2', 'Grains'], ['Boiled chickpeas', '120 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Mash the chickpeas with lemon, onion and chaat masala.', 'Warm the rotis, fill and roll.'] },

  { id: 'r_quick_tofu_stir', name: 'Ten-minute tofu and greens', emoji: '🥬', cuisine: 'Continental', slots: ['lunch', 'dinner'],
    kcal: 360, protein: 26, carbs: 24, fat: 18, fibre: 8, prepMins: 12, difficulty: 1, costRupees: 80,
    veg: true, vegan: true, gi: 35, goalTags: ['fat_loss', 'muscle_gain'], tasteTags: ['savoury'], tags: ['quick', 'low-carb', 'vegan'],
    satiety: 2,
    ingredients: [['Tofu', '150 g', 'Protein'], ['Broccoli or beans', '1 cup', 'Vegetables'], ['Garlic', '3', 'Vegetables'], ['Soy sauce', '1 tbsp', 'Pantry'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Press and cube the tofu, sear until golden.', 'Add garlic and greens, cook three minutes on high.', 'Finish with soy sauce.'] },

  { id: 'r_quick_curd_rice_tadka', name: 'Curd rice with a quick tadka', emoji: '🍚', cuisine: 'South Indian', slots: ['lunch', 'dinner'],
    kcal: 390, protein: 14, carbs: 58, fat: 11, fibre: 3, prepMins: 8, difficulty: 1, costRupees: 34,
    veg: true, vegan: false, gi: 52, goalTags: ['wellness', 'consistency'], tasteTags: ['cooling'], tags: ['quick', 'leftovers'],
    satiety: 2, kitchens: ['home', 'hostel', 'pg'],
    ingredients: [['Cooked rice', '1 cup', 'Grains'], ['Curd', '200 g', 'Dairy'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '8', 'Vegetables'], ['Green chilli', '1', 'Vegetables']],
    steps: ['Mash rice into curd with salt.', 'Heat a teaspoon of oil, pop mustard with curry leaves and chilli.', 'Pour over and stir.'] },

  { id: 'r_quick_sprout_khichdi', name: 'Sprout and poha khichdi', emoji: '🍲', cuisine: 'Maharashtrian', slots: ['lunch', 'dinner'],
    kcal: 380, protein: 17, carbs: 56, fat: 9, fibre: 10, prepMins: 14, difficulty: 1, costRupees: 32,
    veg: true, vegan: true, gi: 50, goalTags: ['fat_loss'], tasteTags: ['savoury'], tags: ['quick', 'budget', 'high-fibre'],
    satiety: 3, kitchens: ['home', 'hostel', 'pg'],
    ingredients: [['Poha', '70 g', 'Grains'], ['Moong sprouts', '1 cup', 'Protein'], ['Potato', '1', 'Vegetables'], ['Peanuts', '2 tbsp', 'Protein'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Cook diced potato with peanuts and turmeric.', 'Add sprouts, cook four minutes.', 'Fold in rinsed poha and cover for two minutes.'] },

  { id: 'r_quick_besan_cheela_lunch', name: 'Besan cheela plate', emoji: '🥞', cuisine: 'North Indian', slots: ['lunch', 'dinner', 'breakfast'],
    kcal: 390, protein: 19, carbs: 44, fat: 14, fibre: 8, prepMins: 14, difficulty: 1, costRupees: 34,
    veg: true, vegan: false, gi: 45, goalTags: ['fat_loss', 'muscle_gain'], tasteTags: ['savoury'], tags: ['quick', 'high-protein'],
    satiety: 3, kitchens: ['home', 'hostel', 'pg'],
    ingredients: [['Gram flour', '80 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Curd', '1 katori', 'Dairy'], ['Green chilli', '1', 'Vegetables']],
    steps: ['Whisk gram flour with water, onion, tomato and chilli.', 'Cook two thin cheelas on a tawa.', 'Serve with curd.'] },

  { id: 'r_quick_chicken_wrap', name: 'Quick chicken roti wrap', emoji: '🌯', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 460, protein: 38, carbs: 42, fat: 14, fibre: 5, prepMins: 15, difficulty: 1, costRupees: 110,
    veg: false, vegan: false, gi: 48, goalTags: ['muscle_gain', 'performance'], tasteTags: ['smoky'], tags: ['quick', 'high-protein', 'portable'],
    satiety: 3, portable: true, occasions: ['everyday', 'office-lunch', 'post-workout'],
    ingredients: [['Chicken breast', '150 g', 'Protein'], ['Wheat tortilla or roti', '2', 'Grains'], ['Onion', '1', 'Vegetables'], ['Curd', '2 tbsp', 'Dairy'], ['Tandoori masala', '1 tsp', 'Pantry']],
    steps: ['Cube and pan-cook the chicken with the masala.', 'Mix curd with a pinch of salt as the dressing.', 'Roll into warm rotis with onion.'] },

  { id: 'r_quick_noodle_upgrade', name: 'Noodles, upgraded with egg and veg', emoji: '🍜', cuisine: 'Continental', slots: ['lunch', 'dinner', 'snack'],
    kcal: 440, protein: 20, carbs: 56, fat: 16, fibre: 6, prepMins: 10, difficulty: 1, costRupees: 45,
    veg: false, vegan: false, egg: true, gi: 62, goalTags: ['energy'], tasteTags: ['savoury'], tags: ['hostel', 'quick'],
    kitchens: ['hostel', 'pg', 'home'], satiety: 2,
    ingredients: [['Vermicelli', '60 g', 'Grains'], ['Eggs', '2', 'Protein'], ['Mixed vegetables', '1 cup', 'Vegetables'], ['Soy sauce', '1 tsp', 'Pantry']],
    steps: ['Boil the noodles with a cup of chopped vegetables in the same pot.', 'Crack in two eggs at the end and stir until set.', 'That is twenty grams of protein instead of six.'] },

  /* ----------------------- high-protein snacks -------------------------- */
  { id: 'r_snack_egg_chaat', name: 'Boiled egg chaat', emoji: '🥚', cuisine: 'North Indian', slots: ['snack'],
    kcal: 240, protein: 20, carbs: 10, fat: 14, fibre: 3, prepMins: 10, difficulty: 1, costRupees: 32,
    veg: false, vegan: false, egg: true, gi: 25, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['tangy'], tags: ['high-protein', 'quick'],
    satiety: 2, occasions: ['everyday', 'post-workout'],
    ingredients: [['Eggs', '3', 'Protein'], ['Onion', '1', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Boil and halve the eggs.', 'Toss with onion, lemon and chaat masala.'] },

  { id: 'r_snack_paneer_bhurji_cup', name: 'Paneer bhurji cup', emoji: '🧀', cuisine: 'North Indian', slots: ['snack'],
    kcal: 260, protein: 21, carbs: 9, fat: 16, fibre: 2, prepMins: 10, difficulty: 1, costRupees: 66,
    veg: true, vegan: false, gi: 25, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['savoury'], tags: ['high-protein', 'low-carb'],
    satiety: 2, occasions: ['everyday', 'post-workout'],
    ingredients: [['Paneer', '120 g', 'Protein'], ['Onion', '1', 'Vegetables'], ['Tomato', '1', 'Vegetables'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Crumble the paneer.', 'Cook onion and tomato two minutes, fold in the paneer and take it off.'] },

  { id: 'r_snack_greek_savoury', name: 'Savoury Greek yogurt dip with veg', emoji: '🥒', cuisine: 'Continental', slots: ['snack'],
    kcal: 230, protein: 22, carbs: 16, fat: 8, fibre: 4, prepMins: 5, difficulty: 1, costRupees: 78,
    veg: true, vegan: false, gi: 25, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['fresh'], tags: ['no-cook', 'high-protein'],
    noCook: true, satiety: 2,
    ingredients: [['Greek yogurt', '150 g', 'Dairy'], ['Cucumber', '1', 'Vegetables'], ['Carrot & peas', '1/2 cup', 'Vegetables'], ['Mint', '4', 'Vegetables']],
    steps: ['Season the yogurt with salt, pepper and crushed mint.', 'Cut the vegetables into sticks and dip.'] },

  { id: 'r_snack_sprout_peanut', name: 'Sprout and peanut salad', emoji: '🥗', cuisine: 'Maharashtrian', slots: ['snack'],
    kcal: 280, protein: 20, carbs: 26, fat: 11, fibre: 10, prepMins: 6, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 35, goalTags: ['fat_loss', 'muscle_gain'], tasteTags: ['fresh'], tags: ['no-cook', 'high-protein', 'budget'],
    noCook: true, satiety: 3, portable: true,
    ingredients: [['Moong sprouts', '1 cup', 'Protein'], ['Peanuts', '3 tbsp', 'Protein'], ['Onion', '1', 'Vegetables'], ['Lemon', '1', 'Fruit'], ['Chaat masala', '1 tsp', 'Pantry']],
    steps: ['Toss everything cold.', 'Lemon last, or the sprouts go soft.'] },

  { id: 'r_snack_chana_curd_cup', name: 'Chana and curd protein cup', emoji: '🥣', cuisine: 'North Indian', slots: ['snack'],
    kcal: 290, protein: 21, carbs: 30, fat: 8, fibre: 9, prepMins: 4, difficulty: 1, costRupees: 40,
    veg: true, vegan: false, gi: 32, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['tangy'], tags: ['no-cook', 'high-protein'],
    noCook: true, satiety: 3, portable: true, occasions: ['everyday', 'post-workout'],
    ingredients: [['Boiled chickpeas', '120 g', 'Protein'], ['Curd', '150 g', 'Dairy'], ['Cucumber', '1', 'Vegetables'], ['Cumin', '1/2 tsp', 'Pantry']],
    steps: ['Stir roasted cumin and salt into the curd.', 'Fold in chickpeas and chopped cucumber.'] },

  { id: 'r_snack_soya_chilli', name: 'Chilli soya bites', emoji: '🌶️', cuisine: 'Continental', slots: ['snack'],
    kcal: 270, protein: 24, carbs: 22, fat: 9, fibre: 9, prepMins: 14, difficulty: 2, costRupees: 34,
    veg: true, vegan: true, gi: 40, goalTags: ['muscle_gain', 'fat_loss'], tasteTags: ['spicy'], tags: ['high-protein', 'budget', 'vegan'],
    satiety: 2,
    ingredients: [['Soya chunks', '60 g', 'Protein'], ['Capsicum', '1', 'Vegetables'], ['Onion', '1', 'Vegetables'], ['Soy sauce', '1 tbsp', 'Pantry'], ['Garlic', '3', 'Vegetables']],
    steps: ['Soak, squeeze and pat the soya dry — wet chunks will never brown.', 'Sear with garlic on high heat.', 'Add peppers, onion and soy sauce for two minutes.'] },

  /* ------------------------- regional depth ----------------------------- */
  { id: 'r_gujarati_thepla_box', name: 'Methi thepla travel box', emoji: '🫓', cuisine: 'Gujarati', slots: ['breakfast', 'lunch', 'snack'],
    kcal: 400, protein: 14, carbs: 54, fat: 14, fibre: 9, prepMins: 25, difficulty: 2, costRupees: 38,
    veg: true, vegan: false, gi: 48, goalTags: ['consistency'], tasteTags: ['savoury'], tags: ['portable', 'travel'],
    satiety: 3, portable: true, batchFriendly: true, occasions: ['travel', 'office-lunch'],
    ingredients: [['Wheat flour', '80 g', 'Grains'], ['Fenugreek leaves', '1 cup', 'Vegetables'], ['Gram flour', '20 g', 'Grains'], ['Curd', '2 tbsp', 'Dairy'], ['Turmeric', '1/2 tsp', 'Pantry']],
    steps: ['Knead both flours with chopped methi, curd and spices.', 'Roll thin and cook dry, then brush lightly with oil.', 'They keep two days without refrigeration, which is the point.'] },

  { id: 'r_gujarati_dhokla', name: 'Steamed besan dhokla', emoji: '🟨', cuisine: 'Gujarati', slots: ['snack', 'breakfast'],
    kcal: 260, protein: 13, carbs: 36, fat: 7, fibre: 5, prepMins: 25, difficulty: 2, costRupees: 30,
    veg: true, vegan: false, gi: 45, goalTags: ['fat_loss', 'wellness'], tasteTags: ['tangy'], tags: ['steamed', 'low-fat'],
    satiety: 2, kitchens: ['home', 'pg'],
    ingredients: [['Gram flour', '80 g', 'Grains'], ['Curd', '2 tbsp', 'Dairy'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Green chilli', '2', 'Vegetables'], ['Sugar', '1 tsp', 'Pantry']],
    steps: ['Whisk a loose batter and rest it briefly.', 'Steam fifteen minutes until a knife comes out clean.', 'Temper mustard and chilli over the top.'] },

  { id: 'r_gujarati_khichdi_kadhi', name: 'Khichdi with kadhi', emoji: '🍲', cuisine: 'Gujarati', slots: ['lunch', 'dinner'],
    kcal: 450, protein: 17, carbs: 66, fat: 12, fibre: 8, prepMins: 30, difficulty: 2, costRupees: 40,
    veg: true, vegan: false, gi: 52, goalTags: ['wellness', 'consistency'], tasteTags: ['mild', 'tangy'], tags: ['homely', 'comforting'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Rice', '1/2 cup', 'Grains'], ['Moong dal', '60 g', 'Protein'], ['Curd', '1 cup', 'Dairy'], ['Gram flour', '2 tbsp', 'Grains'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Cook rice and dal together until soft.', 'Whisk curd with gram flour and simmer gently — do not boil hard or it splits.', 'Temper both with cumin.'] },

  { id: 'r_bengali_cholar_dal', name: 'Cholar dal with rice', emoji: '🍛', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 460, protein: 18, carbs: 70, fat: 11, fibre: 12, prepMins: 30, difficulty: 2, costRupees: 40,
    veg: true, vegan: false, gi: 45, goalTags: ['wellness'], tasteTags: ['sweet', 'mild'], tags: ['festival', 'homely'],
    satiety: 3, kitchens: ['home', 'pg'], occasions: ['everyday', 'festival'],
    ingredients: [['Chana dal', '90 g', 'Protein'], ['Rice', '1/2 cup', 'Grains'], ['Coconut', '2 tbsp', 'Fruit'], ['Ghee', '1 tsp', 'Dairy'], ['Cumin', '1 tsp', 'Pantry']],
    steps: ['Cook chana dal until just tender, not collapsing.', 'Temper cumin and coconut slivers in ghee.', 'Simmer together and serve with rice.'] },

  { id: 'r_bengali_egg_jhol', name: 'Bengali egg jhol', emoji: '🥚', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 440, protein: 25, carbs: 52, fat: 15, fibre: 6, prepMins: 25, difficulty: 2, costRupees: 55,
    veg: false, vegan: false, egg: true, gi: 52, goalTags: ['muscle_gain'], tasteTags: ['mild'], tags: ['homely', 'high-protein'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Eggs', '3', 'Protein'], ['Potato', '1', 'Vegetables'], ['Rice', '3/4 cup', 'Grains'], ['Turmeric', '1/2 tsp', 'Pantry'], ['Tomato', '1', 'Vegetables']],
    steps: ['Boil the eggs, then turn them in turmeric and salt and lightly fry.', 'Make a thin potato and tomato gravy.', 'Slide the eggs in for the last five minutes.'] },

  { id: 'r_bengali_veg_labra', name: 'Mixed vegetable labra', emoji: '🍲', cuisine: 'Bengali', slots: ['lunch', 'dinner'],
    kcal: 300, protein: 9, carbs: 44, fat: 10, fibre: 12, prepMins: 25, difficulty: 2, costRupees: 34,
    veg: true, vegan: true, gi: 45, goalTags: ['wellness', 'fat_loss'], tasteTags: ['mild'], tags: ['high-fibre', 'festival'],
    satiety: 2, kitchens: ['home', 'pg'], occasions: ['everyday', 'festival'],
    ingredients: [['Pumpkin', '150 g', 'Vegetables'], ['Bottle gourd', '150 g', 'Vegetables'], ['Potato', '1', 'Vegetables'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Ginger', '1 inch', 'Vegetables']],
    steps: ['Temper mustard seeds and ginger.', 'Add all the vegetables and cook covered until they melt together.', 'No water — the gourd releases plenty.'] },

  { id: 'r_mughlai_korma_light', name: 'Lighter chicken korma with roti', emoji: '🍗', cuisine: 'Mughlai', slots: ['lunch', 'dinner'],
    kcal: 520, protein: 38, carbs: 40, fat: 22, fibre: 5, prepMins: 35, difficulty: 3, costRupees: 140,
    veg: false, vegan: false, gi: 40, goalTags: ['muscle_gain'], tasteTags: ['rich'], tags: ['social', 'high-protein'],
    satiety: 3, kitchens: ['home'], occasions: ['social', 'festival'],
    ingredients: [['Chicken', '200 g', 'Protein'], ['Curd', '1 cup', 'Dairy'], ['Onion', '2', 'Vegetables'], ['Cashews', '10', 'Protein'], ['Wheat flour', '60 g', 'Grains']],
    steps: ['Marinate the chicken in curd and spices for thirty minutes.', 'Use a cashew paste rather than cream — same body, less saturated fat.', 'Simmer gently and serve with two rotis.'] },

  { id: 'r_mughlai_veg_seekh', name: 'Vegetable seekh with mint chutney', emoji: '🍢', cuisine: 'Mughlai', slots: ['snack', 'dinner'],
    kcal: 320, protein: 14, carbs: 38, fat: 12, fibre: 9, prepMins: 30, difficulty: 3, costRupees: 55,
    veg: true, vegan: true, gi: 45, goalTags: ['fat_loss'], tasteTags: ['smoky', 'spicy'], tags: ['social'],
    satiety: 2, kitchens: ['home'], occasions: ['social'],
    ingredients: [['Boiled chickpeas', '100 g', 'Protein'], ['Potato', '1', 'Vegetables'], ['Gram flour', '2 tbsp', 'Grains'], ['Mint', '6', 'Vegetables'], ['Garam masala', '1 tsp', 'Pantry']],
    steps: ['Mash chickpeas and potato with gram flour and spices.', 'Shape onto skewers and grill or pan-sear.', 'Grind mint with chilli and lemon for the chutney.'] },

  { id: 'r_punjabi_sarson_makki', name: 'Sarson saag with millet roti', emoji: '🌿', cuisine: 'Punjabi', slots: ['lunch', 'dinner'],
    kcal: 470, protein: 16, carbs: 60, fat: 18, fibre: 14, prepMins: 40, difficulty: 3, costRupees: 50,
    veg: true, vegan: false, gi: 48, goalTags: ['wellness'], tasteTags: ['earthy'], tags: ['seasonal', 'high-fibre'],
    satiety: 3, kitchens: ['home'], occasions: ['everyday', 'festival'],
    ingredients: [['Spinach', '200 g', 'Vegetables'], ['Fenugreek leaves', '1 cup', 'Vegetables'], ['Bajra', '80 g', 'Grains'], ['Ghee', '1 tsp', 'Dairy'], ['Ginger-garlic', '1 tbsp', 'Vegetables']],
    steps: ['Boil the greens, then blend coarsely.', 'Cook down with ginger-garlic until it thickens.', 'Serve with a millet roti and a small spoon of ghee.'] },

  { id: 'r_south_lemon_rice', name: 'Lemon rice with peanuts', emoji: '🍋', cuisine: 'South Indian', slots: ['lunch', 'snack'],
    kcal: 400, protein: 10, carbs: 62, fat: 13, fibre: 5, prepMins: 12, difficulty: 1, costRupees: 32,
    veg: true, vegan: true, gi: 58, goalTags: ['energy'], tasteTags: ['tangy'], tags: ['quick', 'leftovers', 'portable'],
    satiety: 2, portable: true, occasions: ['everyday', 'office-lunch', 'travel'],
    ingredients: [['Cooked rice', '1 cup', 'Grains'], ['Peanuts', '3 tbsp', 'Protein'], ['Lemon', '1', 'Fruit'], ['Mustard seeds', '1 tsp', 'Pantry'], ['Curry leaves', '8', 'Vegetables']],
    steps: ['Temper mustard, peanuts and curry leaves.', 'Fold through cold rice with turmeric.', 'Lemon off the heat, always.'] },

  { id: 'r_south_rasam_rice', name: 'Rasam with rice', emoji: '🍲', cuisine: 'South Indian', slots: ['lunch', 'dinner'],
    kcal: 360, protein: 11, carbs: 62, fat: 7, fibre: 7, prepMins: 20, difficulty: 2, costRupees: 28,
    veg: true, vegan: true, gi: 55, goalTags: ['wellness'], tasteTags: ['tangy', 'spicy'], tags: ['budget', 'comforting'],
    satiety: 2, kitchens: ['home', 'pg'],
    ingredients: [['Toor dal', '40 g', 'Protein'], ['Rice', '3/4 cup', 'Grains'], ['Tamarind', '1 tbsp', 'Pantry'], ['Tomato', '1', 'Vegetables'], ['Curry leaves', '8', 'Vegetables']],
    steps: ['Cook a small amount of dal until soft.', 'Simmer with tamarind water, tomato and rasam spices.', 'Do not boil it hard once the tamarind is in.'] },

  { id: 'r_maha_misal', name: 'Misal with pav', emoji: '🍲', cuisine: 'Maharashtrian', slots: ['breakfast', 'lunch', 'snack'],
    kcal: 460, protein: 20, carbs: 62, fat: 15, fibre: 14, prepMins: 25, difficulty: 2, costRupees: 44,
    veg: true, vegan: true, gi: 48, goalTags: ['fat_loss'], tasteTags: ['spicy'], tags: ['high-fibre', 'budget'],
    satiety: 3, kitchens: ['home', 'pg'],
    ingredients: [['Moong sprouts', '1 cup', 'Protein'], ['Bread', '2', 'Grains'], ['Onion', '1', 'Vegetables'], ['Besan sev', '2 tbsp', 'Grains'], ['Red chilli powder', '1 tsp', 'Pantry']],
    steps: ['Cook the sprouts with onion and a spicy masala until saucy.', 'Top with raw onion and sev at the table, not before.', 'Serve with pav.'] },

  { id: 'r_north_baingan_bharta', name: 'Baingan bharta with roti', emoji: '🍆', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 380, protein: 12, carbs: 48, fat: 16, fibre: 12, prepMins: 35, difficulty: 2, costRupees: 40,
    veg: true, vegan: true, gi: 40, goalTags: ['fat_loss', 'wellness'], tasteTags: ['smoky'], tags: ['high-fibre', 'low-calorie'],
    satiety: 2, kitchens: ['home'],
    ingredients: [['Brinjal', '2', 'Vegetables'], ['Wheat flour', '60 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Garlic', '4', 'Vegetables']],
    steps: ['Char the brinjal directly on the flame until the skin blisters.', 'Peel and mash, then cook into an onion-tomato-garlic base.', 'Serve with two rotis.'] },

  { id: 'r_north_bhindi_roti', name: 'Bhindi masala with roti', emoji: '🌿', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 370, protein: 11, carbs: 48, fat: 15, fibre: 11, prepMins: 25, difficulty: 2, costRupees: 42,
    veg: true, vegan: true, gi: 42, goalTags: ['wellness', 'fat_loss'], tasteTags: ['savoury'], tags: ['high-fibre'],
    satiety: 2, kitchens: ['home', 'pg'],
    ingredients: [['Okra', '200 g', 'Vegetables'], ['Wheat flour', '60 g', 'Grains'], ['Onion', '1', 'Vegetables'], ['Coriander powder', '1 tsp', 'Pantry'], ['Oil', '1 tbsp', 'Pantry']],
    steps: ['Dry the okra completely before cutting, or it turns slimy.', 'Fry on high heat without stirring much.', 'Add onion and spices at the end; serve with rotis.'] },

  { id: 'r_north_rajma_roti', name: 'Rajma with roti', emoji: '🫘', cuisine: 'North Indian', slots: ['lunch', 'dinner'],
    kcal: 440, protein: 21, carbs: 58, fat: 13, fibre: 15, prepMins: 35, difficulty: 2, costRupees: 42,
    veg: true, vegan: true, gi: 38, goalTags: ['fat_loss', 'wellness'], tasteTags: ['rich'], tags: ['high-fibre', 'high-protein'],
    satiety: 3, kitchens: ['home', 'pg'], batchFriendly: true,
    ingredients: [['Rajma', '120 g', 'Protein'], ['Wheat flour', '60 g', 'Grains'], ['Onion', '2', 'Vegetables'], ['Tomato', '2', 'Vegetables'], ['Ginger-garlic', '1 tbsp', 'Vegetables']],
    steps: ['Soak overnight and pressure cook until a bean crushes between two fingers.', 'Cook down an onion-tomato base and add the beans with their water.', 'Simmer twenty minutes; roti rather than rice gives you more fibre for the same plate.'] },

  { id: 'r_beetroot_salad', name: 'Beetroot, carrot and peanut salad', emoji: '🥗', cuisine: 'Maharashtrian', slots: ['snack', 'lunch'],
    kcal: 250, protein: 9, carbs: 32, fat: 11, fibre: 10, prepMins: 8, difficulty: 1, costRupees: 30,
    veg: true, vegan: true, gi: 40, goalTags: ['wellness', 'fat_loss'], tasteTags: ['fresh', 'sweet'], tags: ['no-cook', 'high-fibre'],
    noCook: true, satiety: 2, portable: true,
    ingredients: [['Beetroot', '1', 'Vegetables'], ['Carrot & peas', '1/2 cup', 'Vegetables'], ['Peanuts', '2 tbsp', 'Protein'], ['Lemon', '1', 'Fruit'], ['Coriander', '4', 'Vegetables']],
    steps: ['Grate the beetroot and carrot.', 'Toss with crushed peanuts, lemon and salt.'] },

  { id: 'r_dates_walnut_bites', name: 'Date and walnut bites', emoji: '🍫', cuisine: 'North Indian', slots: ['snack'],
    kcal: 230, protein: 6, carbs: 30, fat: 11, fibre: 5, prepMins: 10, difficulty: 1, costRupees: 55,
    veg: true, vegan: true, gi: 45, goalTags: ['energy', 'performance'], tasteTags: ['sweet'], tags: ['no-cook', 'portable', 'festival'],
    noCook: true, equipment: ['blender'], satiety: 1, portable: true, occasions: ['everyday', 'festival', 'travel', 'post-workout'],
    ingredients: [['Dates', '8', 'Fruit'], ['Walnuts', '10', 'Protein'], ['Coconut', '2 tbsp', 'Fruit']],
    steps: ['Blitz dates and walnuts to a coarse paste.', 'Roll into balls and coat in coconut.', 'Keeps a week in the fridge — the honest alternative to a shop-bought festival sweet.'] },
];

export const RECIPES: Recipe[] = [...S, ...S2, ...S3].map((s) => {
  const ingredients = s.ingredients.map(([name, qty, group]) => ({ name, qty, group }));
  // Cost is summed from the ingredient price table rather than typed in, so
  // "about ₹72" and the grocery total can never disagree with each other.
  // The seeded figure stays as a fallback if the sum comes out at nothing.
  const computed = recipeCost(ingredients);
  return {
  id: s.id,
  name: s.name,
  emoji: s.emoji,
  cuisine: s.cuisine,
  slots: s.slots,
  kcal: s.kcal,
  protein: s.protein,
  carbs: s.carbs,
  fat: s.fat,
  fibre: s.fibre,
  prepMins: s.prepMins,
  difficulty: s.difficulty,
  costRupees: computed > 0 ? computed : s.costRupees,
  servings: 1,
  ingredients,
  steps: s.steps,
  veg: s.veg,
  vegan: s.vegan,
  egg: s.egg,
  jainSafe: s.jainSafe ?? !s.ingredients.some(([n]) => /onion|garlic|potato/i.test(n)),
  gi: s.gi,
  // Defaults, derived rather than typed out on every row: anything needing a
  // stove and more than twenty minutes is a home-kitchen job; a no-cook dish
  // can be made anywhere.
  kitchens: s.kitchens ?? (s.noCook ? ALL_KITCHENS : s.prepMins <= 20 && s.difficulty === 1 ? ALL_KITCHENS : ['home', 'pg']),
  equipment: s.equipment ?? (s.noCook ? ['none'] : ['stove']),
  noCook: s.noCook,
  occasions: s.occasions ?? ['everyday'],
  satiety: s.satiety ?? (s.protein >= 25 || s.fibre >= 8 ? 3 : s.kcal >= 350 ? 2 : 1),
  portable: s.portable,
  batchFriendly: s.batchFriendly,
  goalTags: s.goalTags,
  tasteTags: s.tasteTags,
  tags: s.tags,
  };
});

export const recipeById = (id: string, extra: Recipe[] = []) =>
  [...RECIPES, ...extra].find((r) => r.id === id);
