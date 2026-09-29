/* ============================================================
   Turning a real email into the few sentences that matter.

   Most of an email is not the email. Quoted history, signatures,
   legal disclaimers and unsubscribe furniture make up the bulk of
   a typical thread, and every one of them is a rich source of
   false positives — a disclaimer says "please notify the sender
   immediately", which looks exactly like an urgent request if you
   are not careful. Everything below exists to throw that away
   before any judgement is made.
   ============================================================ */

/** Markers that begin the quoted history of a reply. Everything after goes. */
const QUOTE_START = [
  /^\s*on .{0,120}\bwrote:\s*$/im,
  /^\s*on .{0,80}\bat .{0,40}\b.{0,80}\bwrote:\s*$/im,
  /^-{2,}\s*original message\s*-{2,}/im,
  /^-{2,}\s*forwarded message\s*-{2,}/im,
  /^\s*from:\s.+\n\s*sent:\s/im,
  /^\s*_{5,}\s*$/m,
  /^\s*\*?from:\*?\s.+$/im,
];

/** Signature and boilerplate openers. Everything after goes. */
const SIG_START = [
  /^\s*--\s*$/m,
  /^\s*—\s*$/m,
  /^\s*sent from my (iphone|ipad|android|samsung|mobile|phone)\b/im,
  /^\s*get outlook for (ios|android)\b/im,
  /^\s*this (e-?mail|message) (and any attachments? )?(is|are) (confidential|intended)/im,
  /^\s*disclaimer\s*:/im,
  /^\s*(please )?consider the environment before printing/im,
  /^\s*(you are receiving this|to unsubscribe|unsubscribe from|manage your preferences|update your preferences)/im,
  /^\s*confidentiality notice\s*:/im,
  // Automated systems end with a line that parses as a genuine request
  // ("If you have any query, please reach out to the Programme Office") but is
  // boilerplate on every message they ever send.
  /^\s*you (are )?receiv(e|ed) this (e-?mail|message|notification) (since|because)/im,
  /^\s*this is an (auto|automated|system)[- ]generated/im,
];

/** Headers that mark mail sent to a list rather than to a person. */
export function isBulk(headers: Record<string, string>, fromEmail: string): boolean {
  const h = (k: string) => (headers[k.toLowerCase()] ?? '').toLowerCase();
  if (h('list-unsubscribe') || h('list-id')) return true;
  if (/^(auto|bulk|list)$/.test(h('precedence'))) return true;
  if (h('auto-submitted') && h('auto-submitted') !== 'no') return true;
  if (/\b(no-?reply|do-?not-?reply|donotreply|notifications?|mailer|bounce|newsletter|updates?|alerts?|digest|marketing|info|support)@/i.test(fromEmail)) return true;
  return false;
}

/** Strip HTML to something a sentence splitter can work with. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * The part of the message the sender actually typed this time.
 * Returns at most `cap` characters — a 40-message thread should not
 * cost forty times as much to process as a short one.
 */
export function freshBody(raw: string, cap = 4000): string {
  let text = raw
    .replace(/\r\n/g, '\n')
    // Gmail's plain-text rendering keeps *bold* markers, which otherwise end
    // up inside task titles as stray punctuation.
    .replace(/^[ \t]*\*[ \t]+/gm, '\u2022 ')
    .replace(/\*/g, '')
    .replace(/_([^_\n]{1,120})_/g, '$1');

  // Drop everything from the first quote marker onwards.
  let cut = text.length;
  for (const re of QUOTE_START) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  text = text.slice(0, cut);

  // Drop everything from the first signature marker onwards.
  cut = text.length;
  for (const re of SIG_START) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  text = text.slice(0, cut);

  // Drop residual quoted lines and link-only lines.
  text = text
    .split('\n')
    .filter((l) => !/^\s*>/.test(l))
    .filter((l) => !/^\s*https?:\/\/\S+\s*$/.test(l))
    .join('\n');

  return unwrap(text).replace(/\n{3,}/g, '\n\n').trim().slice(0, cap);
}

/**
 * Join lines that a mail client hard-wrapped.
 *
 * Real email is wrapped at about 72 characters, so "…do not miss the breakout
 * learning sessions" arrives as two lines. Splitting on newlines then cuts the
 * sentence in half and the task title ends mid-phrase. A line is treated as a
 * continuation when the previous line neither ended a sentence nor looks like
 * a heading, bullet or key: value pair.
 */
export function unwrap(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const prev = out[out.length - 1];

    const continues =
      prev !== undefined
      && prev.trim() !== ''
      && line.trim() !== ''
      && !/[.!?:;]$/.test(prev.trim())
      && !/^\s*([-*•\u2022]|\d+[.)])\s/.test(line)
      && !/^\s*\w[\w ]{0,20}:\s/.test(line)
      && (
        // Either it reads as a continuation…
        /^[a-z(\u201c"']/.test(line.trim())
        // …or the previous line ran right up to the wrap width, which is what
        // a hard-wrapped sentence looks like regardless of the next word.
        || prev.trim().length >= 55
      )
      && prev.trim().length > 40;

    if (continues) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out.join('\n');
}

/**
 * Split into sentences without breaking on the abbreviations that actually
 * appear in business email — a naive split on "." turns "5 p.m." into two
 * sentences and loses the deadline.
 */
export function sentences(text: string): string[] {
  const guarded = text
    .replace(/\b([ap])\.m\./gi, '$1<DOT>m<DOT>')
    .replace(/\b(mr|mrs|ms|dr|prof|sr|jr|vs|etc|eg|ie|no|approx|dept|inc|ltd|pvt)\./gi, '$1<DOT>')
    .replace(/\b([A-Z])\./g, '$1<DOT>')
    .replace(/(\d)\.(\d)/g, '$1<DOT>$2');

  return guarded
    .split(/(?<=[.!?])\s+|(?<=[a-z0-9)\u201d"])[.!?](?=[A-Z])|\n+/)
    .map((s) => s.replace(/<DOT>/g, '.').trim())
    .map((s) => s.replace(/^[•\-*•]\s*/, ''))
    .filter((s) => s.length >= 3 && s.length <= 400);
}

/** The display name from a From header, falling back to the local part. */
export function displayName(from: string, email: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (m && m[1].trim()) return m[1].trim();
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || email;
}

export const emailOf = (header: string): string => {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).trim().toLowerCase();
};
