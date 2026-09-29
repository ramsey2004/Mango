import { useState } from 'react';
import type { DB } from '../../lib/types';
import { actions } from '../../store/store';
import { Panel, SectionHeader, Field, Toggle, Select, useToast, ConfirmDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { useMail } from './useMail';
import { PasteTester } from './PasteTester';

/* ============================================================
   Connecting a mailbox.

   This screen is mostly honesty. Connecting Gmail to anything is
   a real decision, and the things a user would want to know
   before making it — what is read, what is kept, what leaves the
   device, what it costs to undo — are on the screen rather than
   in a privacy policy nobody opens.
   ============================================================ */

export function MailConnect({ db, mail }: { db: DB; mail: ReturnType<typeof useMail> }) {
  const toast = useToast();
  const s = db.mail.settings;
  const [clientId, setClientId] = useState(s.clientId);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="label mb-2">Action centre</div>
        <h1 className="display text-[clamp(24px,4vw,36px)] leading-none">Turn your inbox into a to-do list</h1>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
          Mango reads your recent mail, works out which messages actually ask something of you,
          and sorts them by what happens if you ignore them. It does this on this device.
          No server of ours sees your email, because there is no server of ours.
        </p>
      </header>

      <PasteTester db={db} />

      <Panel className="p-4">
        <SectionHeader label="What this does and does not do" title="Before you connect" />
        <ul className="mt-3 flex flex-col gap-2.5 text-[13px]">
          <Line icon="Eye" good>
            <b>Read-only.</b> Mango asks Google for read access and nothing else. It cannot send,
            reply, archive or delete, and that is enforced by the permission itself, not by a promise.
          </Line>
          <Line icon="Database" good>
            <b>Bodies are never stored.</b> A message is read once, in memory. What is saved is the
            task, and one quoted sentence as evidence. The email itself stays in Gmail.
          </Line>
          <Line icon="Lock" good>
            <b>Nothing leaves this device.</b> The sign-in happens with Google directly and the
            extraction runs in your browser.
          </Line>
          <Line icon="Clock">
            <b>A sign-in lasts about an hour.</b> Without a server there is no way to renew it
            quietly, so Mango asks for a click when it lapses. Your actions stay put in the meantime.
          </Line>
          <Line icon="Settings">
            <b>You supply the Google client ID.</b> It is not a secret — it identifies the app to
            Google — and it means this is your connection to your mailbox, not ours.
          </Line>
        </ul>
      </Panel>

      <Panel className="p-4">
        <SectionHeader label="Step 1" title="Google OAuth client ID" />
        <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          In the Google Cloud console, create an OAuth client of type <b>Web application</b>, enable the
          Gmail API, and add <code className="rounded px-1" style={{ background: 'var(--sunken)' }}>{window.location.origin}/oauth.html</code> as
          an authorised redirect URI. Add yourself as a test user. Paste the client ID below.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Client ID" className="min-w-[18rem] flex-1">
            <input
              className="field"
              placeholder="1234567890-abcdef.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onBlur={() => actions.setMailSettings({ clientId: clientId.trim() })}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader label="Step 2" title="Connect" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!clientId.trim() || mail.sync.busy}
            onClick={async () => {
              actions.setMailSettings({ clientId: clientId.trim() });
              const t = await mail.connect();
              if (t) { toast({ text: 'Gmail connected', tone: 'good' }); mail.run({ full: true }); }
            }}
          >
            <Icon name={mail.sync.busy ? 'Loader2' : 'Mail'} size={15} className={mail.sync.busy ? 'animate-spin' : undefined} />
            {mail.sync.busy ? 'Waiting for Google…' : 'Connect Gmail'}
          </button>
          {!clientId.trim() && (
            <span className="text-[12.5px] text-[var(--ink-3)]">Add a client ID first.</span>
          )}
        </div>
        {mail.sync.error && (
          <p className="mt-3 text-[12.5px]" style={{ color: '#f2555a' }}>{mail.sync.error.message}</p>
        )}
      </Panel>

      <MailSettingsPanel db={db} />
    </div>
  );
}

function Line({ icon, good, children }: { icon: string; good?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} size={15} className="mt-0.5 shrink-0" style={{ color: good ? '#3ec08c' : 'var(--ink-3)' }} />
      <span className="leading-relaxed text-[var(--ink-2)]">{children}</span>
    </li>
  );
}

/** Also mounted inside Settings, so it is written once and used twice. */
export function MailSettingsPanel({ db }: { db: DB }) {
  const toast = useToast();
  const s = db.mail.settings;
  const [confirmErase, setConfirmErase] = useState(false);

  return (
    <>
      <Panel className="p-4">
        <SectionHeader label="How it behaves" title="Extraction settings" />
        <div className="mt-3 flex flex-col gap-3">
          <Toggle
            label="Add confident tasks automatically"
            hint="Anything less certain waits under Suggestions for you to keep or dismiss."
            checked={s.autoCreate}
            onChange={(v) => actions.setMailSettings({ autoCreate: v })}
          />
          <Field
            label="How far back to read on the first sync"
            hint="Later syncs only fetch what has changed."
          >
            <Select
              value={String(s.lookbackDays)}
              onChange={(v) => actions.setMailSettings({ lookbackDays: Number(v) })}
              ariaLabel="How far back to read on the first sync"
              options={[3, 7, 14, 30, 60].map((n) => ({ value: String(n), label: `${n} days` }))}
            />
          </Field>
          <Field
            label="How certain before something becomes a task"
            hint={`Currently ${Math.round(s.confidenceFloor * 100)}%. Lower catches more and gets more wrong.`}
          >
            <Select
              value={String(Math.round(s.confidenceFloor * 100))}
              onChange={(v) => actions.setMailSettings({ confidenceFloor: Number(v) / 100 })}
              ariaLabel="How certain before something becomes a task"
              options={[
                { value: '30', label: '30% — catch almost everything' },
                { value: '45', label: '45% — balanced (recommended)' },
                { value: '60', label: '60% — only clear asks' },
                { value: '75', label: '75% — only unmistakable ones' },
              ]}
            />
          </Field>
        </div>
      </Panel>

      {db.mail.account && (
        <Panel className="p-4">
          <SectionHeader
            label="Connected mailbox"
            title={db.mail.account.email}
            right={
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { actions.disconnectMail(); toast({ text: 'Disconnected. Your actions are still here.', tone: 'info' }); }}
              >
                <Icon name="Unplug" size={14} /> Disconnect
              </button>
            }
          />
          <p className="mt-2 text-[12.5px] text-[var(--ink-3)]">
            {db.mail.items.length} action{db.mail.items.length === 1 ? '' : 's'} extracted
            {db.mail.corrections.length ? ` · ${db.mail.corrections.length} corrections learned from` : ''}.
            Disconnecting drops the Google access but keeps everything Mango has worked out.
          </p>
          <div className="mt-3">
            <button type="button" className="btn btn-danger" onClick={() => setConfirmErase(true)}>
              <Icon name="Trash2" size={14} /> Erase all email data
            </button>
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmErase}
        onCancel={() => setConfirmErase(false)}
        title="Erase all email data?"
        body="Every extracted action, every correction Mango has learned from, and the Gmail connection are removed from this device. Tasks you already added to your task list stay. This cannot be undone."
        confirmLabel="Erase"
        onConfirm={() => { actions.eraseMailData(); setConfirmErase(false); toast({ text: 'Email data erased', tone: 'info' }); }}
      />
    </>
  );
}
