import type { RawMessage } from './mail-types';
import { htmlToText, isBulk, emailOf } from '../engine/mail/clean';

/* ============================================================
   Gmail, from the browser, with no server in the middle.

   Mango has no backend and should not grow one for this. Google
   supports OAuth directly from a browser application, so the
   token is obtained in a popup, held in this device's IndexedDB
   alongside the rest of the document, and used to call the Gmail
   REST API from the page.

   The honest cost of having no server: a browser-obtained access
   token lasts about an hour and there is no refresh token to
   renew it silently, because issuing one requires a client secret
   and a client secret cannot live in frontend code. So the app
   asks for a click when the hour is up. That is a real limitation
   and the UI says so plainly rather than failing quietly.

   Scope is read-only. Mango never sends, deletes or modifies
   anything in the mailbox, and the scope it requests makes that
   true rather than promised.
   ============================================================ */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class MailError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'network' | 'server' | 'config' | 'cancelled',
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

/* --------------------------------- auth --------------------------------- */

export interface Token { accessToken: string; expiresAt: number; scope: string }

const randomState = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Opens Google's consent screen in a popup and resolves with a token.
 * Must be called from a user gesture or the browser will block the popup.
 */
export function connect(clientId: string, loginHint?: string): Promise<Token> {
  if (!clientId || !/\.apps\.googleusercontent\.com$/.test(clientId.trim())) {
    return Promise.reject(new MailError('That does not look like a Google OAuth client ID.', 'config'));
  }

  const redirectUri = `${window.location.origin}/oauth.html`;
  const state = randomState();
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GMAIL_SCOPE,
    state,
    include_granted_scopes: 'true',
    prompt: loginHint ? 'none' : 'consent',
  });
  if (loginHint) params.set('login_hint', loginHint);

  const popup = window.open(`${AUTH_URL}?${params}`, 'mango-gmail', 'width=520,height=640,menubar=no,toolbar=no');
  if (!popup) return Promise.reject(new MailError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.', 'config'));

  return new Promise<Token>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      clearTimeout(timeout);
      try { popup.close(); } catch { /* already gone */ }
      fn();
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.source !== 'mango-oauth') return;
      if (d.state !== state) {
        finish(() => reject(new MailError('Sign-in response did not match the request. Try again.', 'auth')));
        return;
      }
      if (d.error) {
        finish(() => reject(new MailError(
          d.error === 'access_denied' ? 'You declined access to Gmail.' : `Google refused the sign-in: ${d.error}`,
          d.error === 'access_denied' ? 'cancelled' : 'auth',
        )));
        return;
      }
      if (!d.access_token) {
        finish(() => reject(new MailError('Google did not return a token.', 'auth')));
        return;
      }
      finish(() => resolve({
        accessToken: d.access_token,
        expiresAt: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60_000,
        scope: d.scope ?? GMAIL_SCOPE,
      }));
    };

    window.addEventListener('message', onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new MailError('Sign-in window was closed.', 'cancelled')));
    }, 500);

    const timeout = window.setTimeout(
      () => finish(() => reject(new MailError('Sign-in timed out.', 'auth'))),
      3 * 60_000,
    );
  });
}

export const tokenValid = (t: Token | null | undefined): boolean =>
  !!t && !!t.accessToken && t.expiresAt > Date.now();

/* ------------------------------ the client ------------------------------ */

async function call<T>(path: string, token: Token, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new MailError('Cancelled.', 'cancelled');
    throw new MailError('Could not reach Gmail. Check your connection.', 'network');
  }

  if (res.status === 401) throw new MailError('Gmail access has expired. Reconnect to carry on syncing.', 'auth');
  if (res.status === 403 || res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 60;
    throw new MailError('Gmail asked us to slow down. Syncing will resume shortly.', 'rate', retry);
  }
  if (res.status >= 500) throw new MailError('Gmail is having trouble. Try again in a moment.', 'server');
  if (!res.ok) {
    // Never echo a response body — it can carry message content.
    throw new MailError(`Gmail refused the request (${res.status}).`, 'server');
  }
  return res.json() as Promise<T>;
}

export async function profile(token: Token, signal?: AbortSignal): Promise<{ emailAddress: string; historyId: string }> {
  return call('/profile', token, signal);
}

/* ------------------------------ MIME decode ----------------------------- */

const b64url = (s: string): string => {
  try {
    const norm = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(norm.padEnd(norm.length + ((4 - (norm.length % 4)) % 4), '='));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
};

interface Part { mimeType?: string; body?: { data?: string; size?: number }; parts?: Part[]; filename?: string }

/** Prefer text/plain; fall back to the first text/html we can find. */
function bodyOf(payload: Part): string {
  const plain: string[] = [];
  const html: string[] = [];

  const walk = (p: Part, depth = 0) => {
    if (depth > 12) return;
    if (p.filename) return; // attachments are never scanned
    if (p.mimeType === 'text/plain' && p.body?.data) plain.push(b64url(p.body.data));
    else if (p.mimeType === 'text/html' && p.body?.data) html.push(b64url(p.body.data));
    (p.parts ?? []).forEach((c) => walk(c, depth + 1));
  };
  walk(payload);

  if (plain.length) return plain.join('\n');
  if (html.length) return htmlToText(html.join('\n'));
  return '';
}

const headerMap = (headers: Array<{ name: string; value: string }> = []): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const h of headers) out[h.name.toLowerCase()] = h.value;
  return out;
};

const addressList = (v = ''): string[] =>
  v.split(',').map((s) => emailOf(s)).filter((s) => s.includes('@'));

export function toRaw(msg: any, selfEmail: string): RawMessage | null {
  const payload = msg.payload ?? {};
  const h = headerMap(payload.headers);
  const fromEmail = emailOf(h.from ?? '');
  if (!fromEmail) return null;

  // Newsletters and no-reply robots are dropped here, before any parsing —
  // they are the largest source of false tasks and the cheapest to exclude.
  if (isBulk(h, fromEmail)) return null;

  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    internalDate: Number(msg.internalDate) || Date.parse(h.date ?? '') || Date.now(),
    from: h.from ?? fromEmail,
    fromEmail,
    to: addressList(h.to),
    cc: addressList(h.cc),
    subject: (h.subject ?? '(no subject)').slice(0, 300),
    body: bodyOf(payload),
    snippet: (msg.snippet ?? '').slice(0, 300),
    selfEmail: selfEmail.toLowerCase(),
    inReplyTo: h['in-reply-to'],
  };
}

/* -------------------------------- syncing ------------------------------- */

export interface SyncPlan {
  /** message ids to fetch */
  ids: string[];
  historyId?: string;
}

/** Full backfill within the lookback window. Used on first connect. */
export async function listRecent(
  token: Token,
  opts: { labels: string[]; lookbackDays: number; max?: number },
  signal?: AbortSignal,
): Promise<SyncPlan> {
  const q = `newer_than:${Math.max(1, opts.lookbackDays)}d -category:promotions -category:social -in:chats`;
  const params = new URLSearchParams({ q, maxResults: String(Math.min(opts.max ?? 120, 500)) });
  for (const l of opts.labels.length ? opts.labels : ['INBOX']) params.append('labelIds', l);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const page = await call<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(
      `/messages?${params}`, token, signal,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < (opts.max ?? 120));

  const p = await profile(token, signal);
  return { ids: ids.slice(0, opts.max ?? 120), historyId: p.historyId };
}

/**
 * Incremental sync. Gmail's history cursor means a re-sync costs one request
 * when nothing has changed, instead of re-reading the mailbox.
 */
export async function listSince(
  token: Token,
  startHistoryId: string,
  signal?: AbortSignal,
): Promise<SyncPlan> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded' });
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latest = startHistoryId;

  do {
    if (pageToken) params.set('pageToken', pageToken);
    const page = await call<{
      history?: Array<{ messagesAdded?: Array<{ message: { id: string; labelIds?: string[] } }> }>;
      nextPageToken?: string;
      historyId?: string;
    }>(`/history?${params}`, token, signal);

    for (const h of page.history ?? []) {
      for (const a of h.messagesAdded ?? []) {
        if ((a.message.labelIds ?? []).includes('DRAFT')) continue;
        ids.add(a.message.id);
      }
    }
    if (page.historyId) latest = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken && ids.size < 200);

  return { ids: [...ids], historyId: latest };
}

/** Fetch message bodies, a few at a time so we neither stall nor get rate-limited. */
export async function fetchMessages(
  token: Token,
  ids: string[],
  selfEmail: string,
  opts: { concurrency?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<RawMessage[]> {
  const out: RawMessage[] = [];
  const n = opts.concurrency ?? 6;
  let done = 0;

  for (let i = 0; i < ids.length; i += n) {
    const slice = ids.slice(i, i + n);
    const got = await Promise.all(
      slice.map(async (id) => {
        try {
          const msg = await call<any>(`/messages/${id}?format=full`, token, opts.signal);
          return toRaw(msg, selfEmail);
        } catch (e) {
          // A single unreadable message must not fail a whole sync.
          if (e instanceof MailError && (e.kind === 'auth' || e.kind === 'rate' || e.kind === 'cancelled')) throw e;
          return null;
        }
      }),
    );
    out.push(...got.filter((m): m is RawMessage => !!m));
    done += slice.length;
    opts.onProgress?.(done, ids.length);
  }
  return out;
}

/** The Gmail web URL for a thread, so a task can open its source. */
export const threadUrl = (threadId: string, account?: string) =>
  `https://mail.google.com/mail/u/${account ? encodeURIComponent(account) : '0'}/#all/${threadId}`;
