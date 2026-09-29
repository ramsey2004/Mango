import type { DB } from './types';
import type { NutritionProfile, GoalTrack, Intent } from './nutrition-types';
import { emptyNutrition } from './nutrition-seed';
import { emptyMail } from './mail-types';
import { NUTRITION_WIDGETS, defaultSettings } from './seed';

/* ============================================================
   Persistence — IndexedDB, with a localStorage mirror as a
   fallback for private-mode Safari where IDB can throw.
   The whole document is written under one key; writes are
   debounced so typing never blocks on disk.
   ============================================================ */

const DB_NAME = 'mango';
const STORE = 'state';
const KEY = 'db';
const MIRROR = 'mango:db';

export const SCHEMA_VERSION = 1;

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openIDB(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

/**
 * What the last load actually found. "Nothing saved" and "something was saved
 * but it cannot be read" are very different situations, and the app used to
 * treat both as a fresh install — which silently replaced a corrupted
 * workspace with demo data.
 */
export type LoadOutcome =
  | { kind: 'loaded'; db: DB; from: 'idb' | 'mirror' }
  | { kind: 'empty' }
  | { kind: 'unreadable'; detail: string; raw?: string }
  | { kind: 'newer'; version: number; raw: string };

let lastOutcome: LoadOutcome = { kind: 'empty' };
export const lastLoadOutcome = (): LoadOutcome => lastOutcome;

/** A saved document has to at least look like one before it is trusted. */
function looksLikeDB(v: unknown): v is DB {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DB>;
  return Array.isArray(d.tasks) || Array.isArray(d.areas) || typeof d.settings === 'object';
}

export async function loadDB(): Promise<DB | null> {
  const db = await openIDB();
  if (db) {
    const fromIdb = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb) {
      if (!looksLikeDB(fromIdb)) {
        lastOutcome = { kind: 'unreadable', detail: 'The saved workspace is not in a shape Mango recognises.' };
        return null;
      }
      const v = Number((fromIdb as DB).version ?? 1);
      if (Number.isFinite(v) && v > SCHEMA_VERSION) {
        // A newer build wrote this. Downgrading it would quietly drop whatever
        // that version added, so refuse and keep the document intact.
        lastOutcome = { kind: 'newer', version: v, raw: safeStringify(fromIdb) };
        return null;
      }
      const out = migrate(fromIdb as DB);
      lastOutcome = { kind: 'loaded', db: out, from: 'idb' };
      return out;
    }
  }
  try {
    const raw = localStorage.getItem(MIRROR);
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastOutcome = { kind: 'unreadable', detail: 'The backup copy in this browser is corrupted and could not be parsed.', raw };
        return null;
      }
      if (!looksLikeDB(parsed)) {
        lastOutcome = { kind: 'unreadable', detail: 'The backup copy in this browser is not in a shape Mango recognises.', raw };
        return null;
      }
      const out = migrate(parsed as DB);
      lastOutcome = { kind: 'loaded', db: out, from: 'mirror' };
      return out;
    }
  } catch {
    /* storage blocked entirely — treated as a fresh install */
  }
  lastOutcome = { kind: 'empty' };
  return null;
}

const safeStringify = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

/**
 * Writes to both stores and reports which succeeded.
 *
 * The earlier version resolved on `onerror` and `onabort` exactly as it did on
 * success, so a failed write was indistinguishable from a good one and the UI
 * showed "Saved on this device" over data that had gone nowhere. A storage
 * layer is allowed to fail; it is not allowed to say it succeeded.
 */
async function writeNow(data: DB): Promise<{ idb: boolean; mirror: boolean }> {
  const db = await openIDB();
  let idb = false;
  if (db) {
    idb = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
  let mirror = false;
  try {
    localStorage.setItem(MIRROR, JSON.stringify(data));
    mirror = true;
  } catch {
    // Quota, private mode, or a document that has outgrown localStorage. Only
    // a problem if IndexedDB also failed, which the caller decides.
    mirror = false;
  }
  return { idb, mirror };
}

/* ------------------------------ other tabs -------------------------------
   Every write puts the WHOLE document, so two tabs open on the same browser
   will overwrite each other's work with whichever saved last — silently, and
   with no way to tell afterwards. Proper multi-tab editing needs per-record
   writes or a lock, which is a bigger change than this release; what the app
   can honestly do today is notice and say so. */

const TAB_ID = Math.random().toString(36).slice(2);
const TAB_CHANNEL = 'mango:tabs';
let otherTabListeners: Array<(open: boolean) => void> = [];
let sawOtherTab = false;
let channel: BroadcastChannel | null = null;

export const onOtherTab = (fn: (open: boolean) => void) => {
  otherTabListeners.push(fn);
  if (sawOtherTab) fn(true);
  return () => {
    otherTabListeners = otherTabListeners.filter((l) => l !== fn);
  };
};

export function watchTabs(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(TAB_CHANNEL);
    channel.onmessage = (e) => {
      const msg = e.data as { type: string; id: string };
      if (!msg || msg.id === TAB_ID) return;
      if (msg.type === 'hello') channel?.postMessage({ type: 'here', id: TAB_ID });
      if (msg.type === 'hello' || msg.type === 'here') {
        if (!sawOtherTab) {
          sawOtherTab = true;
          otherTabListeners.forEach((l) => l(true));
        }
      }
    };
    channel.postMessage({ type: 'hello', id: TAB_ID });
  } catch {
    channel = null;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: DB | null = null;
let listeners: Array<(s: 'saving' | 'saved' | 'error') => void> = [];

export const onSaveState = (fn: (s: 'saving' | 'saved' | 'error') => void) => {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
};
const emit = (s: 'saving' | 'saved' | 'error') => listeners.forEach((l) => l(s));

export function saveDB(data: DB): void {
  pending = data;
  emit('saving');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const snapshot = pending;
    pending = null;
    timer = null;
    if (!snapshot) return;
    writeNow(snapshot).then(
      (r) => emit(r.idb || r.mirror ? 'saved' : 'error'),
      () => emit('error'),
    );
  }, 250);
}

/** Force a write immediately — used before export and on page hide. */
export async function flushDB(data?: DB): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const snapshot = data ?? pending;
  pending = null;
  if (!snapshot) {
    emit('saved');
    return;
  }
  const r = await writeNow(snapshot);
  emit(r.idb || r.mirror ? 'saved' : 'error');
}

export async function wipeDB(): Promise<void> {
  const db = await openIDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    localStorage.removeItem(MIRROR);
  } catch {
    /* nothing to clear */
  }
}

/** Forward-compatible: new schema versions add their step here. */
function migrate(db: DB): DB {
  let out = db;
  if (!out.version || out.version < 1) out = { ...out, version: 1 };
  // Defensive: a field added in a later release must never crash an older
  // document, and neither must a truncated or partially written one. Every
  // top-level collection the app iterates gets a floor here.
  out.settings ||= defaultSettings();
  out.areas ||= [];
  out.objectives ||= [];
  out.goals ||= [];
  out.projects ||= [];
  out.milestones ||= [];
  out.tasks ||= [];
  out.habits ||= [];
  out.habitEntries ||= [];
  out.notes ||= [];
  out.applications ||= [];
  out.stages ||= [];
  out.priorities ||= [];
  out.modules ||= [];
  out.moduleRecords ||= [];
  out.focusSessions ||= [];
  out.notifications ||= [];
  out.periods ||= [];
  out.reviews ||= [];
  out.noteFolders ||= [];
  if (typeof out.demo !== 'boolean') out.demo = !!out.settings?.seeded;
  // Nutrition widgets arrived after the first release; add any a saved
  // dashboard is missing rather than resetting the user's arrangement.
  if (out.settings?.widgets) {
    const have = new Set(out.settings.widgets.map((w) => w.type));
    const missing = NUTRITION_WIDGETS.filter((t) => !have.has(t));
    if (missing.length) {
      const shifted = out.settings.widgets.map((w) => ({ ...w, order: w.order + missing.length }));
      out = {
        ...out,
        settings: {
          ...out.settings,
          widgets: [
            ...missing.map((type, i) => ({
              id: `w_${type}`, type, visible: type === 'nut_meal' || type === 'nut_macros', order: i, span: (type === 'nut_meal' ? 2 : 1) as 1 | 2,
            })),
            ...shifted,
          ],
        },
      };
    }
  }
  // A document written before the nutrition module existed must still open.
  if (!out.nutrition) {
    out.nutrition = emptyNutrition();
  }

  /* Mail arrived after the productivity and nutrition modules, so every
     document written before it is missing the whole slice. Defended field by
     field rather than wholesale, because a half-written mail slice (an
     interrupted sync, say) is the realistic failure, not a missing one. */
  if (!out.mail || typeof out.mail !== 'object') {
    out.mail = emptyMail();
  } else {
    const base = emptyMail();
    out.mail = {
      ...base,
      ...out.mail,
      account: out.mail.account ?? null,
      auth: out.mail.auth ?? null,
      items: Array.isArray(out.mail.items) ? out.mail.items : [],
      corrections: Array.isArray(out.mail.corrections) ? out.mail.corrections : [],
      sync: { ...base.sync, ...(out.mail.sync ?? {}), seen: Array.isArray(out.mail.sync?.seen) ? out.mail.sync.seen : [] },
      settings: { ...base.settings, ...(out.mail.settings ?? {}) },
    };
    // A token that expired while the app was closed is not worth keeping.
    if (out.mail.auth && (!out.mail.auth.accessToken || out.mail.auth.expiresAt < Date.now())) {
      out.mail.auth = null;
    }
  }
  out.nutrition.saved ||= [];
  // The pantry used to be a plain list of names.
  if (Array.isArray(out.nutrition.pantry) && typeof out.nutrition.pantry[0] === 'string') {
    out.nutrition = {
      ...out.nutrition,
      pantry: (out.nutrition.pantry as unknown as string[]).map((name, i) => ({
        id: `pi_migrated_${i}`, name, addedAt: new Date().toISOString(),
      })),
    };
  }
  out.nutrition.dataConsent ||= { wearable: true, grocery: true, activity: true, health: true };
  out.nutrition.plan ||= 'free';
  /* Activity factors were re-based onto the FAO/WHO/UNU bands. The old
     sedentary factor of 1.2 sat below the entire range those authors report
     for free-living adults, so every existing target was low. The change is
     flagged rather than applied silently — a calorie target moving by 200-300
     kcal without explanation is exactly the kind of thing that destroys trust
     in a health app. */
  if (out.nutrition.profile && !out.nutrition.energyMethodNotice) {
    out.nutrition.energyMethodNotice = 'pending';
  }
  if (!out.nutrition.usage || typeof out.nutrition.usage !== 'object') out.nutrition.usage = {};
  // Seven overlapping goals became one track plus optional secondary intents.
  // Derive the track from whichever old goal actually moved the calorie target,
  // and keep the rest as intents rather than throwing them away.
  const prof = out.nutrition.profile as unknown as
    | (NutritionProfile & { primaryGoal?: string; goals?: string[] })
    | null;
  if (prof && (prof.primaryGoal !== undefined || prof.goals !== undefined)) {
    const TRACK_FROM: Record<string, GoalTrack> = { fat_loss: 'fat_loss', muscle_gain: 'muscle_gain' };
    const INTENT_FROM: Record<string, Intent> = {
      energy: 'energy', consistency: 'consistency', performance: 'performance', maintenance: 'maintain_weight',
    };
    const legacyGoals = prof.goals ?? (prof.primaryGoal ? [prof.primaryGoal] : []);
    const track = TRACK_FROM[prof.primaryGoal ?? ''] ?? prof.track ?? 'wellness';
    const intents = [...new Set(legacyGoals.map((g) => INTENT_FROM[g]).filter(Boolean))] as Intent[];
    const { primaryGoal: _pg, goals: _gs, ...rest } = prof;
    out.nutrition = { ...out.nutrition, profile: { ...rest, track, intents } as NutritionProfile };
  }
  if (out.nutrition.profile && !Array.isArray(out.nutrition.profile.intents)) {
    out.nutrition = { ...out.nutrition, profile: { ...out.nutrition.profile, intents: [] } };
  }

  // Condition tracks were replaced by three goal tracks. Map old documents over.
  const p = out.nutrition.profile;
  if (p) {
    const legacy: Record<string, 'wellness' | 'fat_loss' | 'muscle_gain'> = {
      none: 'wellness', diabetes: 'wellness', weight: 'fat_loss', fitness: 'muscle_gain',
    };
    if (legacy[p.track as unknown as string]) {
      out.nutrition = { ...out.nutrition, profile: { ...p, track: legacy[p.track as unknown as string] } };
    }
  }
  return out;
}
