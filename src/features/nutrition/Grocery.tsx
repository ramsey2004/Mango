import { useMemo, useState } from 'react';
import type { DB } from '../../lib/types';
import type { GroceryGroup } from '../../lib/nutrition-types';
import { nutrition } from '../../store/store';
import { useNav } from '../../store/nav';
import { planFor } from '../../engine/nutritionSelectors';
import { recipeById } from '../../lib/recipe-db';
import { Panel, SectionHeader, Empty, Field, Select, Modal, Chip, useToast , Locked } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { entitlements, lockReason } from '../../engine/entitlements';
import { cn, todayISO } from '../../lib/util';

const GROUPS: GroceryGroup[] = ['Vegetables', 'Fruit', 'Dairy', 'Protein', 'Grains', 'Pantry', 'Other'];
const GROUP_ICON: Record<GroceryGroup, string> = {
  Vegetables: 'Boxes', Fruit: 'Heart', Dairy: 'Circle', Protein: 'Dumbbell',
  Grains: 'Layers', Pantry: 'Archive', Other: 'Box',
};


/* ============================================================
   Grocery generation is a Premium capability. The gate lives in a
   wrapper rather than an early return inside the view, because an
   early return before the view's own hooks would change the hook
   order the moment the tier changed.
   ============================================================ */
export function Grocery({ db }: { db: DB }) {
  const nav = useNav();
  if (entitlements(db.nutrition).can('grocery')) return <GroceryInner db={db} />;
  const r = lockReason('grocery');
  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="label mb-2">Shopping</div>
        <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Grocery</h1>
      </header>
      <Panel className="p-1">
        <Locked
          title={r.title}
          body={r.body}
          onUpgrade={() => nav.go('settings', 'plan')}
          instead={
            <p className="text-[12.5px] text-[var(--ink-3)]">
              Every recipe still shows its ingredients and cost on the Meals screen. The free tier
              simply does not roll a week of them up into one costed list.
            </p>
          }
        />
      </Panel>
    </div>
  );
}

function GroceryInner({ db }: { db: DB }) {
  const n = db.nutrition;
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [cart, setCart] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', qty: '1', group: 'Other' as GroceryGroup, estCost: 30 });

  const items = n.grocery;
  const total = items.reduce((s, g) => s + g.estCost, 0);
  const remaining = items.filter((g) => !g.checked);
  const remainingCost = remaining.reduce((s, g) => s + g.estCost, 0);
  const plan = planFor(n);

  const byGroup = useMemo(() => {
    const m = new Map<GroceryGroup, typeof items>();
    for (const g of GROUPS) {
      const list = items.filter((x) => x.group === g);
      if (list.length) m.set(g, list);
    }
    return [...m.entries()];
  }, [items]);

  const stores = n.integrations.filter((i) => i.kind === 'grocery');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">
            {items.length} items · about ₹{total} · ₹{remainingCost} still to buy
          </div>
          <h1 className="display text-[clamp(26px,4vw,38px)] leading-none">Grocery</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="Plus" size={14} />
            Add item
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              nutrition.generateGrocery();
              toast({ text: "Built from today's plan", tone: 'good' });
            }}
          >
            <Icon name="RotateCcw" size={14} />
            Build from today's plan
          </button>
        </div>
      </header>

      {plan && (
        <Panel className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-[var(--ink-2)]">
            <span className="label">From today's plan</span>
            {plan.meals.map((m) => {
              const r = recipeById(m.recipeId, n.customRecipes);
              return r ? (
                <span key={m.slot}>
                  {r.emoji} {r.name}
                </span>
              ) : null;
            })}
          </div>
        </Panel>
      )}

      {items.length === 0 ? (
        <Panel className="p-2">
          <Empty
            icon="ShoppingBag"
            title="Nothing on the list"
            body="Build it from today's plan and every ingredient lands here, grouped by aisle — that is the gap between deciding to eat well and actually having the food."
            action={
              <button className="btn btn-primary" onClick={() => nutrition.generateGrocery()}>
                Build from today's plan
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {byGroup.map(([group, list]) => (
            <Panel key={group} className="min-w-0 p-4 sm:p-5">
              <SectionHeader
                title={
                  <span className="flex items-center gap-2">
                    <Icon name={GROUP_ICON[group]} size={14} className="text-[var(--ink-3)]" />
                    {group}
                  </span>
                }
                right={<span className="num text-[11.5px] text-[var(--ink-3)]">{list.filter((x) => !x.checked).length}/{list.length}</span>}
              />
              <div className="mt-3 flex flex-col gap-1">
                {list.map((g) => (
                  <div key={g.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-1 py-1 -mx-1 row-hover">
                    {/* A comfortable tap area around a small tick — the box you see is 18px, the thing you hit is 40. */}
                    <button
                      onClick={() => nutrition.updateGroceryItem(g.id, { checked: !g.checked })}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg -my-1"
                      aria-pressed={g.checked}
                      aria-label={g.checked ? `Mark ${g.name} as not bought` : `Mark ${g.name} as bought`}
                    >
                      <span
                        className="grid h-[18px] w-[18px] place-items-center rounded-[6px]"
                        style={{ border: `1.5px solid ${g.checked ? 'var(--good)' : 'var(--hairline-strong)'}`, background: g.checked ? 'var(--good)' : 'transparent' }}
                      >
                        {g.checked && <Icon name="Check" size={12} strokeWidth={3} style={{ color: 'var(--ground)' }} />}
                      </span>
                    </button>
                    <span className={cn('min-w-0 flex-1 basis-[7rem] truncate text-[13px]', g.checked && 'line-through text-[var(--ink-3)]')}>
                      {g.name}
                      {g.manual && <span className="text-[var(--ink-3)]"> · added by you</span>}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <input
                        className="field !w-[4.25rem] shrink-0 !py-1.5 !text-[12px]"
                        value={g.qty}
                        onChange={(e) => nutrition.updateGroceryItem(g.id, { qty: e.target.value })}
                        aria-label={`Quantity for ${g.name}`}
                      />
                      <span className="num w-10 shrink-0 text-right text-[11.5px] text-[var(--ink-3)]">₹{g.estCost}</span>
                      <button
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg -my-1 text-[var(--ink-3)] row-hover"
                        onClick={() => nutrition.deleteGroceryItem(g.id)}
                        aria-label={`Remove ${g.name}`}
                      >
                        <Icon name="X" size={14} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <SectionHeader label="Turn the list into a basket" title="Build my cart" />
          <p className="mt-2 text-[12.5px] text-[var(--ink-2)] max-w-[68ch] leading-relaxed">
            The gap between a plan and a meal is usually the shop. These are simulated baskets — Mango is not connected to any of these services,
            and will say so on the screen rather than pretending otherwise. Each one would need that company's partner API to become real.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stores.map((s) => (
              <button key={s.id} className="btn" onClick={() => setCart(s.name)}>
                <Icon name="ShoppingBag" size={14} />
                {s.name}
                <Chip color="var(--warning)">Demo</Chip>
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => nutrition.clearChecked()}>
              Clear what I have bought
            </button>
          </div>
        </Panel>
      )}

      {/* ------------------------------ cart modal ---------------------------- */}
      <Modal
        open={!!cart}
        onClose={() => setCart(null)}
        title={`${cart} — simulated basket`}
        footer={<button className="btn" onClick={() => setCart(null)}>Close</button>}
      >
        <div className="rounded-lg p-3 mb-4 text-[12.5px]" style={{ background: 'var(--sunken)', border: '1px solid var(--warning)' }}>
          <strong>This is a simulation.</strong> No request has been sent to {cart} and no order exists. The basket below is built from your list
          so you can see the flow; making it real needs a partner integration with their API.
        </div>
        <div className="flex flex-col gap-1.5">
          {remaining.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate">{g.name}</span>
              <span className="text-[var(--ink-3)] num shrink-0">{g.qty} · ₹{g.estCost}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t pt-3 text-[14px] font-semibold" style={{ borderColor: 'var(--hairline)' }}>
          <span>Estimated total</span>
          <span className="num">₹{remainingCost}</span>
        </div>
      </Modal>

      {/* ------------------------------- add item ----------------------------- */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add to the list"
        footer={
          <>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!draft.name.trim()}
              onClick={() => {
                nutrition.addGroceryItem({ ...draft, name: draft.name.trim() });
                setDraft({ name: '', qty: '1', group: 'Other', estCost: 30 });
                setAdding(false);
              }}
            >
              Add
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item" className="sm:col-span-2">
            <input className="field" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Quantity">
            <input className="field" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
          </Field>
          <Field label="Aisle" as="div">
            <Select value={draft.group} onChange={(v) => setDraft({ ...draft, group: v as GroceryGroup })} options={GROUPS.map((g) => ({ value: g, label: g }))} />
          </Field>
          <Field label="Estimated cost (₹)">
            <input className="field" type="number" min={0} value={draft.estCost} onChange={(e) => setDraft({ ...draft, estCost: Number(e.target.value) })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
