import type { FoodItem, Cuisine, MealSlot } from './nutrition-types';

/* ============================================================
   Seed food database — everyday Indian foods, per realistic
   home serving. Figures are rounded from standard composition
   tables and are guidance, not laboratory values.

   Shape is deliberately flat so this can grow to thousands of
   rows, or be replaced by a fetched dataset, without touching
   any component.
   ============================================================ */

type Row = [
  id: string, name: string, cat: MealSlot | 'staple' | 'drink',
  serving: string, grams: number,
  kcal: number, protein: number, carbs: number, fat: number, fibre: number,
  cuisine: Cuisine, veg: boolean, vegan: boolean, egg: boolean,
  prep: number, cost: number, gi: number | 0, ingredients: string, tags: string,
];

const ROWS: Row[] = [
  // ---------------------------------------------------------------- breakfast
  ['f_poha','Poha','breakfast','1 bowl',180,250,5,45,6,3,'Maharashtrian',true,true,false,15,25,60,'flattened rice,onion,peanuts,curry leaves,turmeric','quick,light,budget'],
  ['f_upma','Upma','breakfast','1 bowl',200,270,6,40,9,3,'South Indian',true,true,false,20,22,66,'semolina,onion,mustard seeds,curry leaves','quick,budget'],
  ['f_idli','Idli (2)','breakfast','2 pieces',150,116,4,24,1,2,'South Indian',true,true,false,10,20,55,'idli batter','steamed,light,low-fat'],
  ['f_dosa','Plain dosa','breakfast','1 dosa',120,168,4,29,4,1,'South Indian',true,true,false,12,25,60,'dosa batter,oil','crisp'],
  ['f_chilla','Besan chilla (2)','breakfast','2 chillas',180,240,12,24,10,5,'North Indian',true,true,false,15,25,45,'gram flour,onion,tomato,coriander','high-protein,quick'],
  ['f_moongchilla','Moong dal chilla (2)','breakfast','2 chillas',180,220,13,26,6,6,'North Indian',true,true,false,20,28,42,'moong dal,ginger,green chilli','high-protein,high-fibre'],
  ['f_oats','Masala oats','breakfast','1 bowl',250,210,7,32,5,5,'Continental',true,true,false,8,20,55,'oats,vegetables,milk','quick,high-fibre'],
  ['f_paneerbhurji','Paneer bhurji','breakfast','1 serving',150,305,18,8,22,2,'North Indian',true,false,false,15,55,25,'paneer,onion,tomato,capsicum','high-protein'],
  ['f_aloo_paratha','Aloo paratha','breakfast','1 paratha',150,290,6,38,12,4,'Punjabi',true,false,false,25,25,70,'wheat flour,potato,ghee','comfort,heavy'],
  ['f_egg_boiled','Boiled eggs (2)','breakfast','2 eggs',100,156,13,1,11,0,'Pan-Indian',false,false,true,10,20,0,'eggs','high-protein,quick'],
  ['f_omelette','Masala omelette (2 egg)','breakfast','1 omelette',140,240,14,4,18,1,'Pan-Indian',false,false,true,10,25,0,'eggs,onion,tomato,green chilli','high-protein,quick'],
  ['f_sprouts','Sprouts salad','breakfast','1 cup',150,125,9,22,1,6,'Pan-Indian',true,true,false,10,18,35,'moong sprouts,onion,tomato,lemon','high-fibre,raw,light'],
  ['f_pbtoast','Peanut butter toast','breakfast','2 slices',90,320,11,34,16,5,'Continental',true,true,false,5,30,65,'brown bread,peanut butter','quick,high-calorie'],
  ['f_dhokla','Dhokla (3 pieces)','breakfast','3 pieces',120,150,6,22,4,2,'Gujarati',true,true,false,25,25,50,'gram flour,curd,eno','steamed,light'],
  ['f_pongal','Ven pongal','breakfast','1 bowl',220,290,9,42,9,4,'South Indian',true,false,false,25,30,68,'rice,moong dal,ghee,pepper','comfort'],

  // ------------------------------------------------------------ mains / sides
  ['f_dal','Dal tadka','lunch','1 katori',150,180,9,22,6,6,'North Indian',true,false,false,25,20,30,'toor dal,onion,tomato,ghee','staple,high-protein'],
  ['f_rajma','Rajma','lunch','1 katori',180,210,11,30,5,8,'Punjabi',true,true,false,40,28,29,'kidney beans,onion,tomato','high-fibre,high-protein'],
  ['f_chole','Chole','lunch','1 katori',180,240,12,34,7,9,'Punjabi',true,true,false,35,28,28,'chickpeas,onion,tomato,spices','high-fibre,high-protein'],
  ['f_sambar','Sambar','lunch','1 katori',180,140,7,20,4,5,'South Indian',true,true,false,30,20,32,'toor dal,vegetables,tamarind','high-fibre'],
  ['f_pbm','Paneer butter masala','dinner','1 serving',150,350,14,12,28,3,'Mughlai',true,false,false,30,70,30,'paneer,cream,tomato,butter','rich,occasional'],
  ['f_palakpaneer','Palak paneer','dinner','1 serving',150,280,15,10,20,4,'Punjabi',true,false,false,30,65,25,'paneer,spinach,cream','high-protein,iron'],
  ['f_soya','Soya chunk curry','dinner','1 serving',150,230,25,15,7,6,'North Indian',true,true,false,25,25,35,'soya chunks,onion,tomato','high-protein,budget'],
  ['f_tofu','Tofu bhurji','dinner','1 serving',150,220,18,8,13,2,'Pan-Indian',true,true,false,15,55,20,'tofu,onion,capsicum','high-protein,vegan'],
  ['f_bhindi','Bhindi masala','lunch','1 serving',150,160,3,13,11,5,'North Indian',true,true,false,25,25,20,'okra,onion,spices','high-fibre'],
  ['f_mixveg','Mixed vegetable sabzi','lunch','1 serving',150,150,4,16,8,5,'Pan-Indian',true,true,false,25,25,25,'seasonal vegetables,spices','high-fibre'],
  ['f_chickencurry','Chicken curry','dinner','1 serving',150,290,26,8,17,1,'North Indian',false,false,false,40,80,0,'chicken,onion,tomato,spices','high-protein'],
  ['f_tandoori','Tandoori chicken','dinner','2 pieces',150,250,32,3,12,0,'Punjabi',false,false,false,45,110,0,'chicken,curd,spices','high-protein,low-carb'],
  ['f_fishcurry','Fish curry','dinner','1 serving',150,240,24,6,13,1,'Bengali',false,false,false,35,90,0,'fish,mustard,onion','high-protein,omega-3'],
  ['f_grilledfish','Grilled fish','dinner','1 fillet',150,210,30,0,9,0,'Continental',false,false,false,20,110,0,'fish,lemon,pepper','high-protein,low-carb'],
  ['f_eggcurry','Egg curry (2 eggs)','dinner','1 serving',200,300,15,8,23,1,'North Indian',false,false,true,30,35,0,'eggs,onion,tomato','high-protein'],
  ['f_khichdi','Moong dal khichdi','dinner','1 bowl',250,250,9,40,6,5,'Pan-Indian',true,false,false,25,22,55,'rice,moong dal,ghee','light,gut-friendly'],
  ['f_pulao','Vegetable pulao','lunch','1 cup',200,280,6,45,8,4,'North Indian',true,true,false,30,30,65,'rice,vegetables,spices','one-pot'],
  ['f_curdrice','Curd rice','lunch','1 bowl',250,260,8,42,6,1,'South Indian',true,false,false,10,22,60,'rice,curd,tempering','cooling,quick'],
  ['f_biryani','Chicken biryani','dinner','1 plate',300,520,25,60,20,3,'Mughlai',false,false,false,60,150,65,'rice,chicken,spices','festive,heavy'],

  // ------------------------------------------------------------------ staples
  ['f_roti','Roti (1)','staple','1 roti',45,104,3,20,2,3,'Pan-Indian',true,true,false,5,5,62,'wheat flour','staple'],
  ['f_rice','Steamed rice','staple','1 cup cooked',160,205,4,45,0,1,'Pan-Indian',true,true,false,20,10,73,'white rice','staple'],
  ['f_brownrice','Brown rice','staple','1 cup cooked',160,216,5,45,2,4,'Pan-Indian',true,true,false,35,15,55,'brown rice','staple,high-fibre'],
  ['f_bajra','Bajra roti (1)','staple','1 roti',50,120,3,22,3,4,'Gujarati',true,true,false,10,6,55,'pearl millet flour','high-fibre,millet'],

  // ------------------------------------------------------------------- snacks
  ['f_apple','Apple','snack','1 medium',180,95,1,25,0,4,'Pan-Indian',true,true,false,1,25,36,'apple','fruit,fibre'],
  ['f_banana','Banana','snack','1 medium',120,105,1,27,0,3,'Pan-Indian',true,true,false,1,10,51,'banana','fruit,pre-workout'],
  ['f_chana','Roasted chana','snack','30 g',30,110,7,17,2,5,'Pan-Indian',true,true,false,1,10,28,'roasted chickpeas','high-protein,budget'],
  ['f_makhana','Roasted makhana','snack','25 g',25,90,3,17,1,2,'North Indian',true,true,false,5,25,50,'fox nuts,ghee','light,crunchy'],
  ['f_almonds','Almonds (15)','snack','15 nuts',18,100,4,4,9,2,'Pan-Indian',true,true,false,1,25,15,'almonds','healthy-fat'],
  ['f_peanuts','Roasted peanuts','snack','30 g',30,170,7,5,14,3,'Pan-Indian',true,true,false,1,10,14,'peanuts','budget,high-protein'],
  ['f_greekyog','Greek yogurt','snack','150 g',150,130,15,7,4,0,'Continental',true,false,false,1,60,11,'greek yogurt','high-protein'],
  ['f_curd','Curd','snack','1 katori',150,90,6,7,4,0,'Pan-Indian',true,false,false,1,15,14,'curd','probiotic'],
  ['f_whey','Whey protein shake','snack','1 scoop',30,120,24,3,1,0,'Continental',true,false,false,2,60,0,'whey protein,water','high-protein,post-workout'],
  ['f_buttermilk','Buttermilk','drink','1 glass',200,60,3,6,2,0,'Pan-Indian',true,false,false,2,12,15,'curd,water,spices','light,cooling'],
  ['f_corn','Boiled corn','snack','1 cup',160,130,5,29,2,4,'Pan-Indian',true,true,false,15,20,52,'sweetcorn','fibre'],
  ['f_bhel','Bhel puri','snack','1 plate',120,250,6,40,8,4,'Maharashtrian',true,true,false,10,30,70,'puffed rice,sev,onion,chutney','street-food,occasional'],
  ['f_dates','Dates (3)','snack','3 dates',30,120,1,32,0,3,'Pan-Indian',true,true,false,1,15,42,'dates','natural-sugar,pre-workout'],
  ['f_fruitbowl','Mixed fruit bowl','snack','1 bowl',200,110,2,28,1,5,'Pan-Indian',true,true,false,8,40,45,'seasonal fruit','fibre,vitamins'],

  // ------------------------------------------------------------------- drinks
  ['f_milk','Milk','drink','1 glass',200,120,6,9,6,0,'Pan-Indian',true,false,false,2,20,31,'milk','calcium'],
  ['f_chai','Chai with sugar','drink','1 cup',150,90,3,10,4,0,'Pan-Indian',true,false,false,5,10,65,'tea,milk,sugar','habit'],
  ['f_greentea','Green tea','drink','1 cup',200,2,0,0,0,0,'Pan-Indian',true,true,false,3,8,0,'green tea','zero-calorie'],
  ['f_blackcoffee','Black coffee','drink','1 cup',200,5,0,1,0,0,'Continental',true,true,false,3,15,0,'coffee','zero-calorie'],

  // ---------------------------------------------------------------- festive
  ['f_gulabjamun','Gulab jamun (1)','snack','1 piece',40,150,2,25,5,0,'North Indian',true,false,false,0,20,75,'khoya,sugar syrup','festive,dessert'],
  ['f_ladoo','Besan ladoo (1)','snack','1 piece',40,180,4,20,10,1,'North Indian',true,false,false,0,25,60,'gram flour,ghee,sugar','festive,dessert'],
  ['f_kheer','Rice kheer','snack','1 katori',150,220,5,35,7,0,'Pan-Indian',true,false,false,40,30,72,'rice,milk,sugar','festive,dessert'],
  ['f_samosa','Samosa (1)','snack','1 piece',90,260,4,30,14,3,'North Indian',true,false,false,0,20,60,'refined flour,potato,oil','fried,occasional'],
];

export const FOODS: FoodItem[] = ROWS.map((r) => ({
  id: r[0],
  name: r[1],
  category: r[2],
  servingLabel: r[3],
  servingGrams: r[4],
  kcal: r[5],
  protein: r[6],
  carbs: r[7],
  fat: r[8],
  fibre: r[9],
  cuisine: r[10],
  veg: r[11],
  vegan: r[12],
  egg: r[13],
  jainSafe: !/onion|garlic|potato/.test(r[17]),
  prepMins: r[14],
  costRupees: r[15],
  gi: r[16] || undefined,
  ingredients: r[17].split(','),
  tags: r[18].split(','),
}));

export const foodById = (id: string, extra: FoodItem[] = []) =>
  [...FOODS, ...extra].find((f) => f.id === id);
