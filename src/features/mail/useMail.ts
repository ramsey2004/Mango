import { useCallback, useRef, useState } from 'react';
import { actions, getDB } from '../../store/store';
import { alerts } from '../../engine/mail/actionCenter';
import type { DB } from '../../lib/types';
import {
  connect as gmailConnect, profile, listRecent, listSince, fetchMessages,
  tokenValid, MailError, type Token,
} from '../../lib/gmail';

/* ============================================================
   The sync orchestrator.

   Kept out of the components because it is the part with real
   failure modes, and those need to be handled in one place
   rather than in whichever button the user happened to press.

   Nothing here writes a message body to the document: bodies
   live in the array passed to runIngest and are gone when it
   returns.
   ============================================================ */

export interface SyncState {
  busy: boolean;
  phase: string;
  done: number;
  total: number;
  error?: { message: string; kind: MailError['kind'] };
  last?: { created: number; merged: number; scanned: number };
}

export function useMail(db: DB) {
  const [sync, setSync] = useState<SyncState>({ busy: false, phase: '', done: 0, total: 0 });
  const abort = useRef<AbortController | null>(null);
  const mail = db.mail;

  const fail = useCallback((e: unknown) => {
    const err = e instanceof MailError
      ? { message: e.message, kind: e.kind }
      : { message: 'Something went wrong while syncing.', kind: 'server' as const };
    if (err.kind === 'auth') actions.disconnectMail();
    actions.setMailSync({ status: err.kind === 'cancelled' ? 'idle' : 'error', lastError: err.kind === 'cancelled' ? undefined : err.message });
    setSync((s) => ({ ...s, busy: false, phase: '', error: err.kind === 'cancelled' ? undefined : err }));
  }, []);

  /** Step one: Google consent, then remember which mailbox it was. */
  const connect = useCallback(async () => {
    setSync({ busy: true, phase: 'Waiting for Google…', done: 0, total: 0 });
    try {
      const token = await gmailConnect(mail.settings.clientId, mail.account?.email);
      const p = await profile(token);
      actions.connectMail(p.emailAddress, token);
      setSync({ busy: false, phase: '', done: 0, total: 0 });
      return token;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [mail.settings.clientId, mail.account?.email, fail]);

  const disconnect = useCallback(() => {
    abort.current?.abort();
    actions.disconnectMail();
    setSync({ busy: false, phase: '', done: 0, total: 0 });
  }, []);

  const cancel = useCallback(() => {
    abort.current?.abort();
    setSync((s) => ({ ...s, busy: false, phase: '' }));
  }, []);

  /**
   * A full or incremental pass, whichever is appropriate. Incremental costs
   * one request when nothing has changed, which is the normal case.
   */
  const run = useCallback(async (opts: { full?: boolean } = {}) => {
    const token: Token | null = tokenValid(mail.auth) ? mail.auth : await connect();
    if (!token) return;

    const controller = new AbortController();
    abort.current = controller;
    actions.setMailSync({ status: 'syncing', lastError: undefined });
    setSync({ busy: true, phase: 'Looking for new mail…', done: 0, total: 0 });

    try {
      const email = mail.account?.email ?? (await profile(token, controller.signal)).emailAddress;

      const plan = !opts.full && mail.sync.historyId
        ? await listSince(token, mail.sync.historyId, controller.signal)
        : await listRecent(token, {
          labels: mail.settings.labels,
          lookbackDays: mail.settings.lookbackDays,
        }, controller.signal);

      // Anything already processed is skipped without being downloaded.
      const fresh = plan.ids.filter((id) => !mail.sync.seen.includes(id));

      if (!fresh.length) {
        actions.setMailSync({ status: 'idle', lastSyncAt: new Date().toISOString(), historyId: plan.historyId });
        setSync({ busy: false, phase: '', done: 0, total: 0, last: { created: 0, merged: 0, scanned: 0 } });
        return;
      }

      setSync({ busy: true, phase: 'Reading messages…', done: 0, total: fresh.length });
      const messages = await fetchMessages(token, fresh, email, {
        signal: controller.signal,
        onProgress: (done, total) => setSync((s) => ({ ...s, done, total })),
      });

      setSync((s) => ({ ...s, phase: 'Working out what needs doing…' }));
      const r = actions.runIngest(messages, plan.historyId);

      setSync({
        busy: false, phase: '', done: 0, total: 0,
        last: { created: r.created, merged: r.merged, scanned: messages.length },
      });

      /* Notify on what changed, not on what was found. A sync that turns up
         twelve tasks is not twelve interruptions — it is one line in the
         header. Only the things with a clock on them earn a notification,
         and only once each: the id is stable, so a second sync on the same
         day does not repeat itself. */
      if (getDB().settings.notifications.enabled) {
        const existing = new Set(getDB().notifications.map((n) => `${n.title}|${n.body}`));
        for (const a of alerts(getDB())) {
          if (existing.has(`${a.title}|${a.body}`)) continue;
          actions.pushNotification({ title: a.title, body: a.body, tone: a.tone, go: { view: 'actions' } });
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      abort.current = null;
    }
  }, [mail.auth, mail.account?.email, mail.sync.historyId, mail.sync.seen, mail.settings.labels, mail.settings.lookbackDays, connect, fail]);

  return {
    sync,
    connected: !!mail.account,
    tokenLive: tokenValid(mail.auth),
    connect,
    disconnect,
    cancel,
    run,
    clearError: () => setSync((s) => ({ ...s, error: undefined })),
  };
}
