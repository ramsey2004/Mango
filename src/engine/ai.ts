import type { DB } from '../lib/types';

/* ============================================================
   AI integration seam.

   Nothing here pretends. With no endpoint configured, isConfigured()
   is false and the assistant answers from local rules only — the UI
   says so plainly. Supply an OpenAI-compatible endpoint in Settings
   and free-form questions route through it, with a compact summary
   of your data as context. Your records never leave the device
   until you choose to configure this.
   ============================================================ */

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  ask(prompt: string, context: string, signal?: AbortSignal): Promise<string>;
}

/**
 * Endpoints are user-supplied, so they are checked before anything is sent.
 * Plain http would put the key and a summary of the user's data on the wire in
 * clear text; localhost is the one place that is reasonable, because it never
 * leaves the machine.
 */
export function checkEndpoint(url: string): { ok: boolean; why?: string; host?: string } {
  if (!url.trim()) return { ok: false, why: 'No endpoint set.' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, why: 'That is not a valid URL.' };
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    return { ok: false, why: 'Only https endpoints are allowed, because your key and a summary of your data are sent to them. http is permitted for localhost only.' };
  }
  return { ok: true, host: u.host };
}

/** Requests are given a deadline; a silent endpoint must not hang the UI forever. */
const AI_TIMEOUT_MS = 30_000;
/** A reply larger than this is not a reply, it is a problem. */
const AI_MAX_CHARS = 20_000;

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'OpenAI-compatible endpoint';
  constructor(
    private endpoint: string,
    private model: string,
    private key: string,
  ) {}

  isConfigured() {
    return Boolean(this.endpoint && this.model) && checkEndpoint(this.endpoint).ok;
  }

  async ask(prompt: string, context: string, signal?: AbortSignal): Promise<string> {
    const check = checkEndpoint(this.endpoint);
    if (!check.ok) throw new Error(check.why ?? 'The endpoint is not usable.');

    // Own timeout, combined with any caller signal, so a hanging endpoint
    // cannot leave the assistant spinning indefinitely.
    const timer = new AbortController();
    const t = setTimeout(() => timer.abort(), AI_TIMEOUT_MS);
    const onAbort = () => timer.abort();
    signal?.addEventListener('abort', onAbort);

    try {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      signal: timer.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are the assistant inside Mango, a personal operating system. Answer only from the user data provided. If the data does not contain the answer, say so. Be concise and concrete.',
          },
          { role: 'user', content: `${context}\n\nQuestion: ${prompt}` },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${check.host} returned ${res.status}. ${body.slice(0, 200)}`);
    }
    // Read as text first so an enormous body can be rejected before parsing.
    const raw = await res.text();
    if (raw.length > AI_MAX_CHARS * 4) throw new Error(`${check.host} sent back more data than Mango will read.`);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`${check.host} did not return JSON.`);
    }
    const j = json as Record<string, any>;
    const text = j?.choices?.[0]?.message?.content ?? j?.content?.[0]?.text ?? j?.output_text;
    if (typeof text !== 'string') throw new Error('The endpoint replied in a shape Mango does not recognise.');
    // Model output is displayed, never executed, and is always labelled as
    // coming from the endpoint rather than from Mango.
    return text.slice(0, AI_MAX_CHARS);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new Error(signal?.aborted ? 'Cancelled.' : `${check.host} did not answer within 30 seconds.`);
      }
      throw e;
    } finally {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

export const providerFrom = (db: DB): AIProvider =>
  new OpenAICompatibleProvider(db.settings.aiEndpoint, db.settings.aiModel, db.settings.aiKey);

/** A compact, token-cheap picture of the workspace for the AI seam. */
export function buildContext(db: DB): string {
  const open = db.tasks.filter((t) => !t.archived && t.status !== 'done');
  const lines: string[] = [];
  lines.push(`Areas: ${db.areas.map((a) => a.name).join(', ')}`);
  lines.push(
    `Goals:\n${db.goals
      .filter((g) => !g.archived)
      .map((g) => ` - ${g.name} [${g.status}] deadline ${g.deadline ?? 'none'}`)
      .join('\n')}`,
  );
  lines.push(
    `Open tasks (${open.length}):\n${open
      .slice(0, 80)
      .map(
        (t) =>
          ` - ${t.title} | due ${t.due ?? 'none'} | ${db.priorities.find((p) => p.id === t.priorityId)?.name ?? '?'} | ${
            t.effortMins
          }m`,
      )
      .join('\n')}`,
  );
  return lines.join('\n\n');
}
