import { useMemo, useState } from 'react';
import type { DB } from '../../lib/types';
import type { Recipe, MealSlot, Cuisine } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { RECIPES } from '../../lib/recipe-db';
import { FOODS } from '../../lib/food-db';
import { fromPantry, isEligible, recommend, SLOT_SHARE } from '../../engine/mealRecommender';
import { sameIngredient } from '../../lib/ingredient-db';
import { targetsFor } from '../../engine/calories';
import { remainingOn, consumedOn, budgetLeft, trainedOn, recentRecipeIds, currentSlot, SLOT_LABEL, targets} from '../../engine/nutritionSelectors';
import { Panel, SectionHeader, Segmented, Chip, Empty, Field, Select, Modal, Bar, useToast , Locked } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { entitlements, lockReason } from '../../engine/entitlements';
import { RatingModal } from './NutritionHome';
import { cn, formatMins, todayISO, pluralise, toISODate, addDays } from '../../lib/util';

type Tab = 'browse' | 'saved' | 'kitchen' | 'eatout' | 'festival';

/** One place that turns a capability into the locked panel for it. */
function GateCard({ cap }: { cap: Parameters<typeof lockReason>[0] }) {
  const nav = useNav();
  const r = lockReason(cap);
  return <Panel className="p-1"><Locked title={r.title} body={r.body} onUpgrade={() => nav.go('settings', 'plan')} /></Panel>;
}

export function Meals({ db }: { db: DB }) {
  const [tab, setTab] = useState<Tab>('browse');
  const ent = entitlements(db.nutrition);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">Recipes, your kitchen, restaurants and festivals</div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Meals</h1>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="Meals section"
          options={[
            { value: 'browse', label: 'Browse', icon: 'BookOpen' },
            { value: 'saved', label: 'Saved', icon: 'Bookmark' },
            { value: 'kitchen', label: 'My kitchen', icon: 'Boxes' },
            { value: 'eatout', label: 'Eat out', icon: 'Building2' },
            { value: 'festival', label: 'Festival', icon: 'Sparkles' },
          ]}
        />
      </header>
      {tab === 'browse' && <Browse db={db} />}
      {tab === 'saved' && <SavedMeals db={db} />}
      {tab === 'kitchen' && <Kitchen db={db} />}
      {tab === 'eatout' && (ent.can('eatOutMode') ? <EatOut db={db} /> : <GateCard cap="eatOutMode" />)}
      {tab === 'festival' && (ent.can('festivalMode') ? <Festival db={db} /> : <GateCard cap="festivalMode" />)}
    </div>
  );
}

/* --------------------------------- browse --------------------------------- */

function Browse({ db }: { db: DB }) {
  const n = db.nutrition;
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState<MealSlot | ''>('');
  const [maxMins, setMaxMins] = useState(0);
  const [maxCost, setMaxCost] = useState(0);
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [lens, setLens] = useState<'' | 'noCook' | 'highProtein' | 'pantry'>('');
  const [open, setOpen] = useState<Recipe | null>(null);
  const [rating, setRating] = useState<Recipe | null>(null);

  const pool = [...RECIPES, ...n.customRecipes];
  const kitchenNames = useMemo(() => n.pantry.map((p) => p.name), [n.pantry]);
  const list = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return pool.filter((r) => {
      if (onlyEligible && n.profile && !isEligible(r, n.profile).ok) return false;
      if (slot && !r.slots.includes(slot)) return false;
      if (maxMins && r.prepMins > maxMins) return false;
      if (maxCost && r.costRupees > maxCost) return false;
      if (lens === 'noCook' && !r.noCook) return false;
      if (lens === 'highProtein' && r.protein < 20) return false;
      if (lens === 'pantry' && !r.ingredients.some((i) => kitchenNames.some((k) => sameIngredient(k, i.name)))) return false;
      if (needle && !`${r.name} ${r.cuisine} ${r.tags.join(' ')} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [q, slot, maxMins, maxCost, lens, onlyEligible, n.profile, pool, kitchenNames]);

  return (
    <>
      <Panel className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
            <input className="field !pl-8" placeholder="Search recipes, cuisines, ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select
            value={slot}
            onChange={(v) => setSlot(v as MealSlot | '')}
            ariaLabel="Meal"
            className="w-[9rem]"
            options={[{ value: '', label: 'Any meal' }, ...(['breakfast', 'lunch', 'snack', 'dinner'] as MealSlot[]).map((s) => ({ value: s, label: SLOT_LABEL[s] }))]}
          />
          <Select
            value={String(maxMins)}
            onChange={(v) => setMaxMins(Number(v))}
            ariaLabel="Time"
            className="w-[9.5rem]"
            options={[{ value: '0', label: 'Any time' }, { value: '10', label: 'Under 10 min' }, { value: '20', label: 'Under 20 min' }, { value: '30', label: 'Under 30 min' }]}
          />
          {/* Time and money are the two things people actually filter on, so they
              get their own controls rather than hiding inside a tag search. */}
          <Select
            value={String(maxCost)}
            onChange={(v) => setMaxCost(Number(v))}
            ariaLabel="Budget"
            className="w-[9.5rem]"
            options={[{ value: '0', label: 'Any budget' }, { value: '50', label: 'Under ₹50' }, { value: '100', label: 'Under ₹100' }, { value: '150', label: 'Under ₹150' }]}
          />
          <button className="btn !text-[12.5px]" onClick={() => setOnlyEligible((x) => !x)}>
            <Icon name={onlyEligible ? 'CheckCircle2' : 'Circle'} size={13} />
            Only what I can eat
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {([
            ['', 'Everything'],
            ['pantry', 'Uses my kitchen'],
            ['highProtein', '20 g protein or more'],
            ['noCook', 'No cooking'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              className="chip row-hover"
              aria-pressed={lens === k}
              style={lens === k ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
              onClick={() => setLens(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] text-[var(--ink-3)]">
          {list.length} of {pool.length} recipes. Seed data written for this prototype from standard home portions and published composition
          tables — not dietitian-curated, and the app does not claim otherwise. The schema holds thousands of rows without a code change.
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <div key={r.id} className="relative">
          <SaveButton db={db} recipe={r} />
          <button
            onClick={() => setOpen(r)}
            className="w-full rounded-xl p-4 text-left row-hover"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-8">
                <div className="text-[15px] font-bold leading-snug">
                  <span aria-hidden className="mr-1.5">{r.emoji}</span>
                  {r.name}
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--ink-3)]">{r.cuisine} · {r.slots.map((s) => SLOT_LABEL[s]).join(', ')}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] num text-[var(--ink-3)]">
              <span><span className="text-[var(--ink)]">{r.kcal}</span> kcal</span>
              <span><span className="text-[var(--ink)]">{r.protein}</span> g P</span>
              <span>{formatMins(r.prepMins)}</span>
              <span>₹{r.costRupees}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {r.vegan ? <Chip color="var(--good)">vegan</Chip> : r.veg ? <Chip color="var(--good)">veg</Chip> : <Chip color="var(--critical)">non-veg</Chip>}
              {r.gi !== undefined && r.gi <= 55 && <Chip color="var(--info)">low GI</Chip>}
              {r.tags.slice(0, 2).map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </button>
          </div>
        ))}
        {list.length === 0 && (
          <Panel className="sm:col-span-2 xl:col-span-3 p-2">
            <Empty icon="Search" title="Nothing matches those filters" body="Loosen the time limit, or turn off the dietary filter to see everything." />
          </Panel>
        )}
      </div>

      <RecipeModal recipe={open} db={db} onClose={() => setOpen(null)} onRate={(r) => { setOpen(null); setRating(r); }} />
      <RatingModal recipe={rating} onClose={() => setRating(null)} />
    </>
  );
}

/* ---------------------------- saved / favourites -------------------------- */

/** A small bookmark that sits above the card rather than inside its button. */
export function SaveButton({ db, recipe, className }: { db: DB; recipe: Recipe; className?: string }) {
  const toast = useToast();
  const on = db.nutrition.saved.includes(recipe.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
      title={on ? 'Saved' : 'Save'}
      className={cn('absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-lg', className)}
      style={{ background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--ink-3)' }}
      onClick={(e) => {
        e.stopPropagation();
        const nowSaved = nutrition.toggleSaved(recipe.id);
        toast({ text: nowSaved ? `${recipe.name} saved` : `${recipe.name} removed from saved`, tone: nowSaved ? 'good' : 'info' });
      }}
    >
      <Icon name={on ? 'BookmarkCheck' : 'Bookmark'} size={16} />
    </button>
  );
}

function SavedMeals({ db }: { db: DB }) {
  const n = db.nutrition;
  const [open, setOpen] = useState<Recipe | null>(null);
  const [rating, setRating] = useState<Recipe | null>(null);
  const pool = useMemo(() => [...RECIPES, ...n.customRecipes], [n.customRecipes]);
  const find = (id: string) => pool.find((r) => r.id === id);

  const saved = n.saved.map(find).filter(Boolean) as Recipe[];
  const recent = recentRecipeIds(n, 7).map(find).filter(Boolean) as Recipe[];
  const swapped = n.rejected.map(find).filter(Boolean) as Recipe[];

  const Grid = ({ items, empty }: { items: Recipe[]; empty: React.ReactNode }) =>
    items.length === 0 ? <>{empty}</> : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((r) => (
          <div key={r.id} className="relative">
            <SaveButton db={db} recipe={r} />
            <button
              onClick={() => setOpen(r)}
              className="w-full rounded-xl p-4 text-left row-hover"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <div className="text-[15px] font-bold leading-snug pr-8">
                <span aria-hidden className="mr-1.5">{r.emoji}</span>{r.name}
              </div>
              <div className="mt-1 text-[11.5px] text-[var(--ink-3)]">{r.cuisine}</div>
              <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] num text-[var(--ink-3)]">
                <span><span className="text-[var(--ink)]">{r.kcal}</span> kcal</span>
                <span><span className="text-[var(--ink)]">{r.protein}</span> g P</span>
                <span>{formatMins(r.prepMins)}</span>
                <span>₹{r.costRupees}</span>
              </div>
            </button>
          </div>
        ))}
      </div>
    );

  return (
    <>
      <SectionHeader title="Saved" right={<span className="text-[11.5px] text-[var(--ink-3)]">{saved.length} {pluralise(saved.length, 'recipe')}</span>} />
      <Grid
        items={saved}
        empty={<Panel className="p-2"><Empty icon="Bookmark" title="Nothing saved yet" body="Tap the bookmark on any recipe and it will wait for you here." /></Panel>}
      />

      <SectionHeader title="Recently eaten or planned" right={<span className="text-[11.5px] text-[var(--ink-3)]">Last 7 days</span>} />
      <Grid
        items={recent}
        empty={<Panel className="p-2"><Empty icon="History" title="No history yet" body="Log a meal or build a plan and it will show up here." /></Panel>}
      />

      {swapped.length > 0 && (
        <>
          <SectionHeader title="Swapped away" right={<span className="text-[11.5px] text-[var(--ink-3)]">Not offered again until you bring them back</span>} />
          <Panel className="p-3 sm:p-4">
            <ul className="flex flex-col gap-2">
              {swapped.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px]"><span aria-hidden className="mr-1.5">{r.emoji}</span>{r.name}</span>
                  <span className="shrink-0 num text-[11.5px] text-[var(--ink-3)]">{r.kcal} kcal · {r.protein} g P</span>
                  <button className="btn shrink-0 !text-[12px]" onClick={() => nutrition.unreject(r.id)}>
                    <Icon name="Undo2" size={13} />
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <RecipeModal recipe={open} db={db} onClose={() => setOpen(null)} onRate={(r) => { setOpen(null); setRating(r); }} />
      <RatingModal recipe={rating} onClose={() => setRating(null)} />
    </>
  );
}

export function RecipeModal({
  recipe, db, onClose, onRate,
}: { recipe: Recipe | null; db: DB; onClose: () => void; onRate?: (r: Recipe) => void }) {
  const toast = useToast();
  const n = db.nutrition;
  if (!recipe) return null;
  const inPantry = (name: string) => n.pantry.some((p) => name.toLowerCase().includes(p.name.toLowerCase()));

  return (
    <Modal
      open={!!recipe}
      onClose={onClose}
      wide
      title={`${recipe.emoji} ${recipe.name}`}
      footer={
        <>
          {onRate && (
            <button className="btn mr-auto" onClick={() => onRate(recipe)}>
              <Icon name="Star" size={14} />
              Rate it
            </button>
          )}
          <button
            className="btn"
            aria-pressed={n.saved.includes(recipe.id)}
            onClick={() => {
              const nowSaved = nutrition.toggleSaved(recipe.id);
              toast({ text: nowSaved ? `${recipe.name} saved` : `${recipe.name} removed from saved`, tone: nowSaved ? 'good' : 'info' });
            }}
          >
            <Icon name={n.saved.includes(recipe.id) ? 'BookmarkCheck' : 'Bookmark'} size={14} />
            {n.saved.includes(recipe.id) ? 'Saved' : 'Save'}
          </button>
          <button className="btn" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              nutrition.addLog({
                date: todayISO(), slot: recipe.slots[0], sourceId: recipe.id, sourceKind: 'recipe',
                name: recipe.name, servings: 1, kcal: recipe.kcal, protein: recipe.protein,
                carbs: recipe.carbs, fat: recipe.fat, fibre: recipe.fibre,
              });
              toast({ text: `${recipe.name} logged`, tone: 'good' });
              onClose();
            }}
          >
            Log this
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {([['Calories', recipe.kcal, 'kcal'], ['Protein', recipe.protein, 'g'], ['Carbs', recipe.carbs, 'g'], ['Fat', recipe.fat, 'g'], ['Fibre', recipe.fibre, 'g']] as const).map(([l, v, u]) => (
          <div key={l}>
            <div className="label mb-1">{l}</div>
            <div className="num text-[18px] font-semibold">{v}<span className="text-[11px] text-[var(--ink-3)] font-normal"> {u}</span></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--ink-3)]">
        <span>{formatMins(recipe.prepMins)}</span>
        <span>About ₹{recipe.costRupees}</span>
        <span>{['Easy', 'Moderate', 'Involved'][recipe.difficulty - 1]}</span>
        {recipe.gi !== undefined && <span>Glycaemic index {recipe.gi}</span>}
        <span>{recipe.cuisine}</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="label mb-2">Ingredients</div>
          <ul className="flex flex-col gap-1.5">
            {recipe.ingredients.map((i) => (
              <li key={i.name} className="flex items-center gap-2 text-[13px]">
                <Icon
                  name={inPantry(i.name) ? 'CheckCircle2' : 'Circle'}
                  size={13}
                  style={{ color: inPantry(i.name) ? 'var(--good)' : 'var(--ink-3)' }}
                />
                <span className="flex-1">{i.name}</span>
                <span className="text-[11.5px] text-[var(--ink-3)] num">{i.qty}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">Ticked items are already in your kitchen.</p>
        </div>
        <div>
          <div className="label mb-2">Method</div>
          <ol className="flex flex-col gap-2 list-decimal pl-4">
            {recipe.steps.map((s, i) => (
              <li key={i} className="text-[12.5px] text-[var(--ink-2)] leading-relaxed">{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------- kitchen -------------------------------- */

function Kitchen({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [open, setOpen] = useState<Recipe | null>(null);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newExp, setNewExp] = useState('');

  const names = useMemo(() => n.pantry.map((p) => p.name), [n.pantry]);
  const matches = useMemo(
    () => (n.profile ? fromPantry(n.profile, names, [...RECIPES, ...n.customRecipes]) : []),
    [n.profile, names, n.customRecipes],
  );

  const soonISO = toISODate(addDays(new Date(), 3));
  const today = todayISO();
  const useSoon = n.pantry.filter((p) => p.expiresOn && p.expiresOn <= soonISO);

  const COMMON = ['paneer', 'atta', 'rice', 'onion', 'tomato', 'potato', 'curd', 'dal', 'eggs', 'capsicum', 'spinach', 'chickpeas', 'soya chunks', 'oats', 'milk'];

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    nutrition.addPantryItem({ name, qty: newQty.trim() || undefined, expiresOn: newExp || undefined });
    setNewName(''); setNewQty(''); setNewExp('');
    toast({ text: `${name} added to your kitchen`, tone: 'good' });
  };

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader
          label="Meals built from what you already own"
          title="What's in your kitchen?"
          right={
            <button
              className="btn btn-primary"
              onClick={() => {
                nutrition.regeneratePlan();
                toast({ text: "Today's plan rebuilt around your kitchen", tone: 'good' });
              }}
            >
              <Icon name="RotateCcw" size={14} />
              Use what I have
            </button>
          }
        />

        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-2)] max-w-[70ch]">
          Quantity and expiry are optional. Add a name and stop there if you like — the only thing the engine
          needs is what you have. If you do add a date, meals that use it get pushed up the list before it spoils.
        </p>

        {/* add a thing */}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-[11rem]">
            <Field label="Ingredient">
              <input
                className="field"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                placeholder="paneer"
              />
            </Field>
          </div>
          <div className="w-[7.5rem] shrink-0">
            <Field label="How much" hint="optional">
              <input className="field" value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="200 g" />
            </Field>
          </div>
          <div className="w-[10rem] shrink-0">
            <Field label="Use by" hint="optional">
              <input className="field" type="date" value={newExp} onChange={(e) => setNewExp(e.target.value)} />
            </Field>
          </div>
          <button className="btn shrink-0" onClick={add} disabled={!newName.trim()}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        </div>

        {/* quick adds */}
        <div className="mt-4">
          <div className="label mb-2">Common things</div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON.map((c) => {
              const on = names.some((x) => x.toLowerCase() === c);
              return (
                <button
                  key={c}
                  className="chip row-hover"
                  aria-pressed={on}
                  style={on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                  onClick={() => {
                    const item = n.pantry.find((p) => p.name.toLowerCase() === c);
                    if (item) nutrition.removePantryItem(item.id);
                    else nutrition.addPantryItem({ name: c });
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      {useSoon.length > 0 && (
        <Panel className="p-4 sm:p-5" style={{ borderColor: 'var(--warning)' }}>
          <SectionHeader label="Cook these first" title="About to go off" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {useSoon.map((p) => (
              <Chip key={p.id} color="var(--warning)">
                {p.name}{p.qty ? ` · ${p.qty}` : ''} · {p.expiresOn! < today ? 'past its date' : `by ${p.expiresOn!.slice(8)}/${p.expiresOn!.slice(5, 7)}`}
              </Chip>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] text-[var(--ink-3)]">
            Recipes using these are scored higher today.
          </p>
        </Panel>
      )}

      {n.pantry.length > 0 && (
        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionHeader
            title="Your kitchen"
            right={<span className="num text-[11.5px] text-[var(--ink-3)]">{n.pantry.length} {pluralise(n.pantry.length, 'item')}</span>}
          />
          <div className="mt-3 flex flex-col gap-1">
            {n.pantry.map((p) => (
              <div key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-1 py-1 -mx-1 row-hover">
                <span className="min-w-0 flex-1 basis-[7rem] truncate text-[13px] font-medium">{p.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <input
                    className="field !w-[5.5rem] !py-1.5 !text-[12px]"
                    value={p.qty ?? ''}
                    placeholder="qty"
                    onChange={(e) => nutrition.updatePantryItem(p.id, { qty: e.target.value || undefined })}
                    aria-label={`Quantity of ${p.name}`}
                  />
                  <input
                    className="field !w-[8.5rem] !py-1.5 !text-[12px]"
                    type="date"
                    value={p.expiresOn ?? ''}
                    onChange={(e) => nutrition.updatePantryItem(p.id, { expiresOn: e.target.value || undefined })}
                    aria-label={`Use ${p.name} by`}
                  />
                  <button
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg -my-1 text-[var(--ink-3)] row-hover"
                    onClick={() => nutrition.removePantryItem(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <Icon name="X" size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {matches.length === 0 ? (
        <Panel className="p-2">
          <Empty icon="Boxes" title="Nothing to match against yet" body="Add a few ingredients above and Mango will rank every recipe by how much of it you already own." />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((m) => (
            <button
              key={m.recipe.id}
              onClick={() => setOpen(m.recipe)}
              className="rounded-xl p-4 text-left row-hover"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <div className="text-[15px] font-bold leading-snug">
                <span aria-hidden className="mr-1.5">{m.recipe.emoji}</span>
                {m.recipe.name}
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[11.5px] text-[var(--ink-3)]">You have {m.have.length} of {m.recipe.ingredients.length}</span>
                  <span className="num text-[11.5px]">{Math.round(m.coverage * 100)}%</span>
                </div>
                <Bar value={m.coverage * 100} color={m.coverage > 0.7 ? 'var(--good)' : 'var(--warning)'} height={6} label={m.recipe.name} />
              </div>
              {/* The useful form of "what's missing" is what it would cost to fix. */}
              {m.needToBuy.length === 0 ? (
                <div className="mt-2 text-[11.5px] font-semibold" style={{ color: 'var(--good)' }}>
                  You can make this now
                </div>
              ) : (
                <div className="mt-2 text-[11.5px] text-[var(--ink-3)]">
                  <span className="font-semibold text-[var(--ink-2)]">
                    {m.needToBuy.length === 1 ? "You're one ingredient away" : `${m.needToBuy.length} ingredients away`}
                    {m.missingCost > 0 ? ` · about ₹${m.missingCost}` : ''}
                  </span>
                  <br />
                  {m.needToBuy.join(', ')}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3.5 text-[11.5px] num text-[var(--ink-3)]">
                <span>{m.recipe.kcal} kcal</span>
                <span>{m.recipe.protein} g P</span>
                <span>{formatMins(m.recipe.prepMins)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <RecipeModal recipe={open} db={db} onClose={() => setOpen(null)} />
    </>
  );
}

/* --------------------------------- eat out -------------------------------- */

interface OutOption { name: string; kcal: number; note: string }
const EATOUT: Record<string, { better: OutOption[]; moderate: OutOption[]; occasional: OutOption[] }> = {
  'North Indian': {
    better: [
      { name: 'Tandoori chicken or paneer tikka', kcal: 300, note: 'Grilled, not gravy. Ask for extra onion salad.' },
      { name: 'Dal (tadka or fry)', kcal: 200, note: 'One katori. Ask for less ghee on top.' },
      { name: 'Tandoori roti', kcal: 110, note: 'Two, not four. Roti over naan saves ~120 kcal each.' },
      { name: 'Green salad with lemon', kcal: 40, note: 'Order it first — it slows the meal down.' },
    ],
    moderate: [
      { name: 'Paneer tikka masala', kcal: 380, note: 'Share it, or take half home.' },
      { name: 'Jeera rice', kcal: 250, note: 'Half a plate is plenty alongside roti.' },
      { name: 'Raita', kcal: 120, note: 'Good protein, watch the boondi version.' },
    ],
    occasional: [
      { name: 'Butter chicken', kcal: 520, note: 'Cream and butter base. Worth it occasionally, not weekly.' },
      { name: 'Naan or butter naan', kcal: 320, note: 'Roughly three rotis in one bread.' },
      { name: 'Gulab jamun', kcal: 150, note: 'One piece. Two is where it stops being a taste.' },
    ],
  },
  'South Indian': {
    better: [
      { name: 'Idli (2–3)', kcal: 175, note: 'Steamed, easy on the stomach.' },
      { name: 'Sambar', kcal: 140, note: 'Dal plus vegetables — take an extra bowl.' },
      { name: 'Plain dosa', kcal: 170, note: 'Ask for less oil on the tawa.' },
    ],
    moderate: [
      { name: 'Masala dosa', kcal: 450, note: 'The potato filling and oil do the damage, not the crepe.' },
      { name: 'Uttapam', kcal: 300, note: 'Thicker but usually less oil than a dosa.' },
      { name: 'Curd rice', kcal: 260, note: 'A good closing course if the meal was spicy.' },
    ],
    occasional: [
      { name: 'Ghee roast dosa', kcal: 600, note: 'The ghee is most of it.' },
      { name: 'Vada (2)', kcal: 350, note: 'Deep fried. One, with sambar, is the compromise.' },
    ],
  },
  Chinese: {
    better: [
      { name: 'Clear soup', kcal: 80, note: 'Fills you before the fried courses arrive.' },
      { name: 'Steamed momos', kcal: 260, note: 'Steamed, not fried — that is a 200 kcal difference.' },
      { name: 'Stir-fried vegetables', kcal: 180, note: 'Ask for less sauce; that is where the sugar hides.' },
    ],
    moderate: [
      { name: 'Hakka noodles', kcal: 400, note: 'Share a plate rather than ordering one each.' },
      { name: 'Chilli paneer (dry)', kcal: 380, note: 'Dry over gravy every time.' },
    ],
    occasional: [
      { name: 'Fried rice with Manchurian', kcal: 750, note: 'Two starch-heavy dishes together. Pick one.' },
      { name: 'Spring rolls', kcal: 300, note: 'Deep fried.' },
    ],
  },
  'Café / Continental': {
    better: [
      { name: 'Grilled chicken or paneer salad', kcal: 350, note: 'Dressing on the side.' },
      { name: 'Soup and a bread roll', kcal: 300, note: 'Clear or lentil soup, not cream.' },
      { name: 'Black coffee or green tea', kcal: 5, note: 'A latte is 150 kcal before the syrup.' },
    ],
    moderate: [
      { name: 'Grilled sandwich', kcal: 420, note: 'Ask for it without extra butter or mayonnaise.' },
      { name: 'Pasta in red sauce', kcal: 480, note: 'Red over white saves about 200 kcal.' },
    ],
    occasional: [
      { name: 'Cheesecake or brownie', kcal: 450, note: 'Share one across the table.' },
      { name: 'Frappé or thickshake', kcal: 400, note: 'Liquid calories that do not fill you up.' },
    ],
  },
};

function EatOut({ db }: { db: DB }) {
  const n = db.nutrition;
  const [cuisine, setCuisine] = useState<string>('North Indian');
  const left = remainingOn(n);
  const t = targets(n)!;
  const data = EATOUT[cuisine];

  const tier = (title: string, note: string, items: OutOption[], color: string) => (
    <Panel className="p-4 sm:p-5">
      <SectionHeader label={note} title={<span className="flex items-center gap-2"><span className="h-4 w-[3px] rounded-full" style={{ background: color }} />{title}</span>} />
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((o) => (
          <li key={o.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-semibold">{o.name}</span>
              <span className="num text-[11.5px] text-[var(--ink-3)] shrink-0">~{o.kcal} kcal</span>
            </div>
            <div className="text-[11.5px] text-[var(--ink-3)] mt-0.5">{o.note}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label mb-1.5">Where are you eating?</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(EATOUT).map((c) => (
                <button
                  key={c}
                  onClick={() => setCuisine(c)}
                  className="chip row-hover"
                  style={cuisine === c ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="label mb-1">Room left today</div>
            <div className="num text-[22px] font-semibold leading-none">{Math.max(0, left.kcal)} kcal</div>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-[70ch]">
          No food here is forbidden. These are three tiers of fit against today's remaining room — the top tier leaves you the most space, the
          bottom tier uses most of it. Choose accordingly and enjoy the meal.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {tier('Better fit for today', 'Leaves room for the rest of the day', data.better, 'var(--good)')}
        {tier('Middle ground', 'Fine, with portion sense', data.moderate, 'var(--warning)')}
        {tier('Save for occasions', 'Uses most of the day in one dish', data.occasional, 'var(--critical)')}
      </div>

      <Panel className="p-4 sm:p-5">
        <SectionHeader title="Portion guidance that works anywhere" />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            'Order a clear soup or salad first — it slows everything that follows.',
            'Grilled, tandoori, steamed or roasted beats anything in a cream gravy.',
            'Roti over naan, dry over gravy, share the dessert.',
            'Ask for the gravy on the side; you will use half of it.',
            'A glass of water before the meal genuinely reduces how much you order.',
            'If you know it will be heavy, keep lunch protein-forward and light.',
          ].map((s) => (
            <li key={s} className="flex gap-2 text-[12.5px] text-[var(--ink-2)]">
              <span className="text-[var(--ink-3)]">•</span>
              {s}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/* -------------------------------- festival -------------------------------- */

const FESTIVALS = [
  { id: 'diwali', name: 'Diwali', note: 'Mithai, fried snacks, and several days of it' },
  { id: 'navratri', name: 'Navratri', note: 'Fasting foods — sabudana, rajgira, no onion or garlic' },
  { id: 'karva', name: 'Karva Chauth', note: 'A long fast then one large meal' },
  { id: 'eid', name: 'Eid / Ramadan', note: 'Suhoor and iftar, with a long gap between' },
  { id: 'ekadashi', name: 'Ekadashi', note: 'Grain-free fasting' },
  { id: 'wedding', name: 'A wedding', note: 'Buffet, late dinner, several courses' },
];

const TREATS = [
  { name: 'Gulab jamun', kcal: 150 },
  { name: 'Besan ladoo', kcal: 180 },
  { name: 'Kaju katli (2 pieces)', kcal: 160 },
  { name: 'Rice kheer (katori)', kcal: 220 },
  { name: 'Jalebi (2)', kcal: 300 },
  { name: 'Samosa', kcal: 260 },
  { name: 'Namkeen (handful)', kcal: 150 },
];

function Festival({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [fest, setFest] = useState('diwali');
  const [counts, setCounts] = useState<Record<string, number>>({});

  const t = targets(n)!;
  const left = remainingOn(n);
  const treatKcal = TREATS.reduce((s, x) => s + x.kcal * (counts[x.name] ?? 0), 0);
  const after = left.kcal - treatKcal;
  const chosen = FESTIVALS.find((f) => f.id === fest)!;

  const fastingRecipes = RECIPES.filter((r) => r.tags.includes('fasting'));

  return (
    <>
      <Panel className="p-4 sm:p-5">
        <SectionHeader label="Culture is not a cheat day" title="Festival mode" />
        <p className="mt-2 text-[12.5px] text-[var(--ink-2)] leading-relaxed max-w-[70ch]">
          Telling someone to avoid mithai at Diwali is advice nobody follows, and following it would not make the festival better. Tell Mango what
          you are actually going to eat and it plans the rest of the day around it.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {FESTIVALS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFest(f.id)}
              className="chip row-hover"
              style={fest === f.id ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] text-[var(--ink-3)]">{chosen.note}</div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Tell me what you are having" title="Your sweet budget" />
          <div className="mt-3 flex flex-col gap-2">
            {TREATS.map((tr) => {
              const c = counts[tr.name] ?? 0;
              return (
                <div key={tr.name} className="flex items-center gap-3">
                  <span className="flex-1 text-[13px]">{tr.name}</span>
                  <span className="num text-[11.5px] text-[var(--ink-3)]">{tr.kcal} kcal</span>
                  <div className="flex items-center gap-1">
                    <button className="btn btn-ghost !px-2 !py-1" onClick={() => setCounts({ ...counts, [tr.name]: Math.max(0, c - 1) })} aria-label="Fewer">
                      <Icon name="Minus" size={13} />
                    </button>
                    <span className="num w-6 text-center text-[13px]">{c}</span>
                    <button className="btn btn-ghost !px-2 !py-1" onClick={() => setCounts({ ...counts, [tr.name]: c + 1 })} aria-label="More">
                      <Icon name="Plus" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader label="How the day looks with it" title="The arithmetic" />
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <div className="label mb-1">Room left</div>
              <div className="num text-[20px] font-semibold">{Math.max(0, left.kcal)}</div>
            </div>
            <div>
              <div className="label mb-1">Sweets</div>
              <div className="num text-[20px] font-semibold" style={{ color: 'var(--warning)' }}>{treatKcal}</div>
            </div>
            <div>
              <div className="label mb-1">After</div>
              <div className="num text-[20px] font-semibold" style={{ color: after < 0 ? 'var(--critical)' : 'var(--good)' }}>{after}</div>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-[var(--ink-2)] leading-relaxed">
            {treatKcal === 0
              ? 'Add what you plan to eat and I will tell you what the rest of the day should look like.'
              : after >= 300
                ? `That fits. You still have ${after} kcal, which is a proper dinner — keep it protein-forward and you will finish the day on target.`
                : after >= 0
                  ? `Tight but fine. ${after} kcal left means a light dinner: curd with sprouts, or a bowl of dal. Do not skip it entirely.`
                  : `That puts you ${Math.abs(after)} kcal over. That is one festival day inside a whole year — it will not undo anything. Eat a normal breakfast tomorrow, walk in the evening, and carry on.`}
          </p>

          {treatKcal > 0 && (
            <button
              className="btn btn-primary mt-4"
              onClick={() => {
                const items = TREATS.filter((tr) => (counts[tr.name] ?? 0) > 0);
                nutrition.addLogs(
                  items.map((tr) => ({
                    date: todayISO(), slot: 'snack' as const, sourceKind: 'manual' as const,
                    name: tr.name, servings: counts[tr.name],
                    kcal: tr.kcal * counts[tr.name], protein: Math.round(tr.kcal * counts[tr.name] * 0.01),
                    carbs: Math.round(tr.kcal * counts[tr.name] * 0.15), fat: Math.round(tr.kcal * counts[tr.name] * 0.04), fibre: 0,
                  })),
                );
                setCounts({});
                toast({ text: 'Logged into today', tone: 'good' });
              }}
            >
              Log these into today
            </button>
          )}
        </Panel>
      </div>

      {(fest === 'navratri' || fest === 'ekadashi') && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="No grain, no onion, no garlic" title="Fasting-friendly meals" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fastingRecipes.map((r) => (
              <div key={r.id} className="rounded-xl p-3.5" style={{ background: 'var(--sunken)', border: '1px solid var(--hairline)' }}>
                <div className="text-[14px] font-semibold">
                  <span aria-hidden className="mr-1.5">{r.emoji}</span>
                  {r.name}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] num text-[var(--ink-3)]">
                  <span>{r.kcal} kcal</span>
                  <span>{r.protein} g P</span>
                  <span>{formatMins(r.prepMins)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
