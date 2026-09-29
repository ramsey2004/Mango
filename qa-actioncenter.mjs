import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

/* ============================================================
   Action Center, in a real browser.

   The mailbox is seeded directly into the document rather than
   mocked at the network layer, because what is under test here
   is the SURFACE — buckets, explanations, edits, empty states,
   the ambiguity prompt — and the extraction that produces those
   items is already covered, deterministically, by mail-probe.

   The one thing this cannot cover is the Google sign-in itself.
   That is stated as unverified rather than faked.
   ============================================================ */

const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
const server = createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4347,r));
mkdirSync('qa', { recursive: true });

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-background-networking','--disable-sync','--no-first-run'] });
const ctx = await b.newContext({ viewport:{width:1440,height:1000} });
const page = await ctx.newPage();
ctx.setDefaultTimeout(5000); page.setDefaultTimeout(5000);
const errs = [];
page.on('pageerror', e=>errs.push(String(e)));
page.on('console', m=>{ if(m.type()==='error' && !/TUNNEL|favicon|manifest/i.test(m.text())) errs.push(m.text()); });

let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('PASS ', name); }
  catch (e) { failures++; console.log('FAIL ', name, '→', String(e).split('\n')[0].slice(0,150)); }
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } catch {}
};

/* ---------------------------- the fixture ---------------------------- */

const iso = (d) => new Date(d).toISOString();
const DAY = 86400000;
const now = Date.now();
const day = (n) => new Date(now + n*DAY).toISOString().slice(0,10);

const item = (o) => ({
  id: o.id,
  kind: o.kind ?? 'request',
  title: o.title,
  source: {
    messageId: `m_${o.id}`, threadId: o.thread ?? `t_${o.id}`,
    from: o.from ?? 'Priya Nair', fromEmail: o.email ?? 'priya@acme.co.in',
    subject: o.subject ?? 'Proposal', receivedAt: iso(now - DAY),
    evidence: o.evidence ?? 'Please send the revised proposal by Thursday.',
    messageCount: o.msgs ?? 1,
  },
  deadline: o.deadline,
  deadlineText: o.deadlineText,
  deadlineConfidence: o.dc ?? (o.deadline ? 'explicit' : 'none'),
  deadlineOptions: o.options,
  urgency: o.urgency ?? 40,
  importance: o.importance ?? 45,
  priority: o.priority ?? 'P2',
  consequence: 'missed_deadline',
  reasons: o.reasons ?? [
    { label: 'Urgency 40/100', delta: 0, detail: 'How soon this needs doing' },
    { label: 'Due this week', delta: 18, detail: 'by Thursday' },
    { label: 'Importance 45/100', delta: 0, detail: 'What it costs to ignore' },
    { label: 'It is an actual obligation', delta: 30, detail: 'Someone asked you for something' },
    { label: '→ P2', delta: 0, detail: 'Worth doing, not today' },
  ],
  category: o.category ?? 'work',
  confidence: o.confidence ?? 0.82,
  status: o.status ?? 'todo',
  waitingOn: o.kind === 'waiting'
    ? { person: o.from ?? 'Rahul Sharma', email: o.email ?? 'rahul@acme.co.in', since: iso(now - 9*DAY) }
    : undefined,
  relatedMessageIds: [],
  userEdited: false,
  createdAt: iso(now - DAY),
  updatedAt: iso(now - DAY),
});

const FIXTURE = [
  item({ id:'a1', title:'Clear the pending vendor invoice', deadline: day(-3), deadlineText:'by 3rd', priority:'P0', urgency:82, importance:70, category:'finance', subject:'Invoice 4471 overdue',
         reasons:[{label:'Urgency 82/100',delta:0},{label:'Overdue',delta:61,detail:'3 days past the deadline'},{label:'Importance 70/100',delta:0},{label:'Money is involved',delta:26},{label:'→ P0',delta:0,detail:'Overdue or due today'}] }),
  item({ id:'a2', title:'Submit the fee receipt', deadline: day(0), deadlineText:'today', priority:'P0', urgency:70, importance:55, category:'academic', subject:'Fee receipt — today' }),
  item({ id:'a3', title:'Review the campaign deck', deadline: day(2), deadlineText:'by Friday', priority:'P1', urgency:36, importance:52, subject:'Campaign deck', msgs:3 }),
  item({ id:'a4', title:'Send the signed agreement', deadline: day(5), priority:'P2', urgency:18, importance:48, subject:'Agreement' }),
  item({ id:'a5', title:'Circulate the vendor shortlist', priority:'P3', urgency:0, importance:22, subject:'Reading list' }),
  item({ id:'a6', title:'Confirm the venue booking', deadline: day(9), deadlineText:'on Tuesday', dc:'ambiguous',
         options:[{date:day(9),label:'This Tuesday'},{date:day(16),label:'Next Tuesday'}], priority:'P2', subject:'Venue' }),
  item({ id:'a7', kind:'waiting', title:'Rahul to confirm the marketing budget', from:'Rahul Sharma', email:'rahul@acme.co.in',
         priority:'WAITING', status:'waiting', urgency:10, importance:55, subject:'Marketing budget',
         evidence:"I'll check the marketing budget and get back to you." }),
  item({ id:'a8', kind:'attention', title:'Tuesday review has been rescheduled', priority:'P2', status:'todo', category:'meetings',
         subject:'Review rescheduled', evidence:'The review meeting has been rescheduled to next week.' }),
  item({ id:'a9', title:'Bring the revised budget', deadline: day(1), deadlineText:'tomorrow', priority:'P1', category:'meetings',
         thread:'t_meet', subject:'Marketing meeting tomorrow', urgency:40, importance:50 }),
  item({ id:'a10', title:'Update the brochure copy', priority:'P2', status:'inbox', confidence:0.52, subject:'Brochure' }),
];

/* IndexedDB is the primary store and localStorage is only its mirror, so a
   fixture written to the mirror alone is invisible — boot reads IDB first and
   finds the old document. Both are written here, IDB last. */
const seed = async (items = FIXTURE, account = { email:'ram@example.com', connectedAt: iso(now) }) => {
  await page.evaluate(async ({ items, account }) => {
    const raw = localStorage.getItem('mango:db');
    const db = raw ? JSON.parse(raw) : null;
    if (!db) throw new Error('no document to seed into');
    db.mail = {
      account, auth: null, items, corrections: [],
      sync: { status: 'idle', seen: [], lastSyncAt: new Date().toISOString() },
      settings: { clientId:'', autoCreate:true, confidenceFloor:0.45, labels:['INBOX'], lookbackDays:14, timezone:'Asia/Kolkata', morningBrief:true },
    };
    localStorage.setItem('mango:db', JSON.stringify(db));
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('mango');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const conn = open.result;
        const tx = conn.transaction('state', 'readwrite');
        tx.objectStore('state').put(db, 'db');
        tx.oncomplete = () => { conn.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { items, account });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
};

const goActions = async () => {
  await page.getByRole('button', { name: 'Action centre', exact: true }).first().click();
  await page.waitForTimeout(900);
};

/* ------------------------------ the run ------------------------------ */

await page.goto('http://localhost:4347/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1600);
const demo = page.getByRole('button', { name:/demo/i }).first();
if (await demo.count()) { await demo.click(); await page.waitForTimeout(1200); }
// The demo banner and its sample records both interfere with assertions on
// page text, so the workspace is cleared down to an empty document first.
const clear = page.getByRole('button', { name:/^Clear it$/ }).first();
if (await clear.count()) { await clear.click(); await page.waitForTimeout(1200); }

await step('unconnected state explains itself before asking for anything', async () => {
  await seed([], null);
  await goActions();
  const t = await page.locator('main').innerText();
  if (!/Read-only/i.test(t)) throw new Error('does not say the access is read-only');
  if (!/never stored|bodies/i.test(t)) throw new Error('does not say bodies are not stored');
  if (!/client ID/i.test(t)) throw new Error('no client ID field');
  const btn = page.getByRole('button', { name:/Connect Gmail/i });
  if (!(await btn.isDisabled())) throw new Error('Connect is enabled with no client ID');
});

await step('the paste tester runs the real engine with no setup', async () => {
  await seed([], null);
  await goActions();
  await page.getByRole('button', { name:/Use an example/i }).click();
  await page.waitForTimeout(900);
  const t = await page.locator('main').innerText();
  if (!/Reach out to me/i.test(t)) throw new Error('no task extracted from the sample');
  if (!/20 September/i.test(t)) throw new Error('deadline not resolved and shown');
  if (!/20th september 2026/i.test(t)) throw new Error('does not show the words the date came from');
  if (!/Urgency/i.test(t) || !/Importance/i.test(t)) throw new Error('scores not shown');
  if (!/Keep this one/i.test(t)) throw new Error('no way to keep the result');
});

await step('the paste tester says so when nothing is actionable', async () => {
  const box = page.getByPlaceholder(/Paste the message here/i);
  await box.fill('Thanks for sending this. Let me know if you need anything else.');
  await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  if (!/Nothing actionable/i.test(t)) throw new Error('did not say it found nothing');
  if (!/intended answer for most/i.test(t)) throw new Error('does not explain that this is correct');
});

await step('buckets put the right things in the right places', async () => {
  await seed();
  await goActions();
  const t = await page.locator('main').innerText();
  if (!/Must do/i.test(t)) throw new Error('no Must do section');
  if (!/vendor invoice/i.test(t)) throw new Error('overdue item missing from Must do');
  if (!/Should do/i.test(t)) throw new Error('no Should do section');
  if (/vendor shortlist/i.test(t)) throw new Error('a P3 with no deadline is showing under Today');
});

await step('waiting items never appear as tasks', async () => {
  const t = await page.locator('main').innerText();
  if (/marketing budget/i.test(t)) throw new Error('a waiting item leaked into the task view');
});

await step('overdue is marked in words, not only colour', async () => {
  const t = await page.locator('main').innerText();
  if (!/overdue/i.test(t)) throw new Error('nothing says "overdue"');
});

await step('a chased thread shows it has been chased', async () => {
  const t = await page.locator('main').innerText();
  if (!/3 msgs/i.test(t)) throw new Error('follow-up count not shown');
});

await step('meeting preparation gathers the thread', async () => {
  const t = await page.locator('main').innerText();
  if (!/Meeting preparation/i.test(t)) throw new Error('no meeting prep panel');
  if (!/revised budget/i.test(t)) throw new Error('meeting prep did not pick up the related item');
});

await step('why-panel shows the full working', async () => {
  await page.getByRole('heading', { name:'Clear the pending vendor invoice' }).first().click();
  await page.waitForTimeout(700);
  const t = await page.locator('[role="dialog"]').innerText();
  if (!/Why it ranks here/i.test(t)) throw new Error('no explanation section');
  if (!/Urgency/i.test(t) || !/Importance/i.test(t)) throw new Error('urgency and importance not both shown');
  if (!/Money is involved/i.test(t)) throw new Error('named reasons missing');
  if (!/Overdue/i.test(t)) throw new Error('deadline reason missing');
});

const openCard = async (name) => {
  await page.getByRole('heading', { name }).first().click();
  await page.waitForTimeout(700);
};

await step('the source email is one click away and quoted', async () => {
  await openCard('Clear the pending vendor invoice');
  const t = await page.locator('[role="dialog"]').innerText();
  if (!/Where this came from/i.test(t)) throw new Error('no source section');
  if (!/Invoice 4471/i.test(t)) throw new Error('subject not shown');
  const link = page.getByRole('link', { name:/Open in Gmail/i }).first();
  const href = await link.getAttribute('href');
  if (!/mail\.google\.com/.test(href ?? '')) throw new Error('Gmail link is wrong: ' + href);
});

await step('it says plainly that the body was not kept', async () => {
  await openCard('Clear the pending vendor invoice');
  const t = await page.locator('[role="dialog"]').innerText();
  if (!/stays in Gmail/i.test(t)) throw new Error('no statement about what is stored');
});

await step('an ambiguous date is asked about, not guessed', async () => {
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.getByRole('tab', { name:'Everything' }).click(); await page.waitForTimeout(600);
  const t = await page.locator('main').innerText();
  if (!/Date unclear/i.test(t)) throw new Error('ambiguity not flagged on the card');
  await page.getByRole('heading', { name:'Confirm the venue booking' }).first().click();
  await page.waitForTimeout(700);
  const d = await page.locator('[role="dialog"]').innerText();
  if (!/could mean two things/i.test(d)) throw new Error('no ambiguity prompt in the panel');
  if (!/This Tuesday/i.test(d) || !/Next Tuesday/i.test(d)) throw new Error('both readings not offered');
  if (!/has not guessed/i.test(d)) throw new Error('does not say it declined to guess');
});

await step('choosing a reading settles the deadline', async () => {
  await page.getByRole('tab', { name:'Everything' }).click(); await page.waitForTimeout(600);
  await openCard('Confirm the venue booking');
  await page.getByRole('button', { name:/Next Tuesday/i }).first().click();
  await page.waitForTimeout(700);
  const d = await page.locator('[role="dialog"]').innerText();
  if (/could mean two things/i.test(d)) throw new Error('prompt still showing after a choice');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mango:db')).mail.items.find(i=>i.id==='a6'));
  if (stored.deadlineConfidence !== 'explicit') throw new Error('confidence not settled: ' + stored.deadlineConfidence);
  if (!stored.userEdited) throw new Error('not marked as user-edited');
});

await step('an edited item is frozen against later rewrites', async () => {
  await page.getByRole('tab', { name:'Everything' }).click(); await page.waitForTimeout(600);
  await openCard('Confirm the venue booking');
  const t = await page.locator('[role="dialog"]').innerText();
  if (!/will not change it/i.test(t)) throw new Error('user is not told their edit is protected');
});

await step('completing an item removes it and records the signal', async () => {
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.getByRole('button', { name:/Mark .*Submit the fee receipt.* complete/i }).first().click();
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mango:db')).mail);
  const it = stored.items.find(i=>i.id==='a2');
  if (it.status !== 'done') throw new Error('status is ' + it.status);
  if (!stored.corrections.length) throw new Error('no correction recorded to learn from');
});

await step('promoting to a task creates a real Mango task', async () => {
  await page.getByRole('heading', { name:'Review the campaign deck' }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name:/Add to my tasks/i }).first().click();
  await page.waitForTimeout(800);
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('mango:db')));
  const task = db.tasks.find(t => t.title === 'Review the campaign deck');
  if (!task) throw new Error('no task created');
  if (task.priorityId !== 'p_high') throw new Error('priority not mapped: ' + task.priorityId);
  if (!task.due) throw new Error('deadline not carried over');
  if (!/Priya/.test(task.notes ?? '')) throw new Error('source not recorded on the task');
  const item = db.mail.items.find(i => i.id === 'a3');
  if (item.taskId !== task.id) throw new Error('item not linked back to the task');
});

await step('waiting tab shows how long, and when chasing is fair', async () => {
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.getByRole('tab', { name:/^Waiting/ }).click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/Rahul/i.test(t)) throw new Error('waiting person not shown');
  if (!/9 days/i.test(t)) throw new Error('days waiting not shown');
  if (!/Add follow-up task/i.test(t)) throw new Error('no follow-up suggestion after 9 days');
});

await step('read-only items are kept out of the task list', async () => {
  await page.getByRole('tab', { name:/^Read/ }).click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/rescheduled/i.test(t)) throw new Error('attention item missing');
  if (!/not worth a task/i.test(t)) throw new Error('the distinction is not explained');
});

await step('low-confidence finds are proposed, not imposed', async () => {
  await page.getByRole('tab', { name:'Everything' }).click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/Suggestions/i.test(t)) throw new Error('no suggestions section');
  if (!/52% sure/i.test(t)) throw new Error('confidence not shown on a suggestion');
  if (!/brochure/i.test(t)) throw new Error('the suggestion itself is missing');
});

await step('search says what it understood', async () => {
  const box = page.getByPlaceholder(/things I need to send/i);
  await box.fill('waiting on Rahul');
  await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/Reading that as/i.test(t)) throw new Error('does not show its interpretation');
  if (!/waiting on someone/i.test(t)) throw new Error('did not understand the kind');
  if (!/Rahul/i.test(t)) throw new Error('no result');
});

await step('a search with no matches says so instead of going blank', async () => {
  const box = page.getByPlaceholder(/things I need to send/i);
  await box.fill('overdue travel bookings from someone');
  await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/Nothing matches/i.test(t)) throw new Error('empty result is blank');
  await box.fill('');
  await page.waitForTimeout(500);
});

await step('an all-clear inbox reads as finished, not broken', async () => {
  await seed([FIXTURE[6]]);
  await goActions();
  const t = await page.locator('main').innerText();
  if (!/clear for now/i.test(t)) throw new Error('no all-clear message');
  if (!/waiting on 1/i.test(t)) throw new Error('does not point at the waiting item');
});

await step('a lapsed sign-in is explained without losing the work', async () => {
  await seed();
  await goActions();
  const t = await page.locator('main').innerText();
  if (!/lapsed/i.test(t)) throw new Error('no notice that the token expired');
  if (!/still here/i.test(t)) throw new Error('does not reassure that data survives');
  if (!/Reconnect/i.test(t)) throw new Error('no way to reconnect');
});

await step('the OAuth token is never written into an export', async () => {
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mango:db'));
    db.mail.auth = { accessToken: 'ya29.SECRET-TOKEN-VALUE', expiresAt: Date.now()+3600000, scope: 'x' };
    localStorage.setItem('mango:db', JSON.stringify(db));
  });
  await page.reload({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1400);
  const json = await page.evaluate(async () => {
    const mod = await import('/assets/' + [...document.querySelectorAll('script[type=module]')].map(s=>s.src.split('/assets/')[1])[0]);
    return null;
  }).catch(() => null);
  // Exercised through the UI instead: Settings → Data & privacy → Export.
  await page.getByRole('button', { name:'Settings', exact:true }).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name:/Data & privacy/i }).click(); await page.waitForTimeout(600);
  const dl = page.waitForEvent('download', { timeout: 6000 });
  await page.getByRole('button', { name:/export/i }).first().click();
  const d = await dl;
  const text = readFileSync(await d.path(), 'utf8');
  if (/SECRET-TOKEN-VALUE/.test(text)) throw new Error('the Gmail token was written into the backup file');
  if (!/"mail"/.test(text)) throw new Error('mail slice missing from the export entirely');
});

await step('phone width: no horizontal scroll, everything reachable', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4347/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { location.hash = ''; });
  const menu = page.getByRole('button', { name:/menu|open navigation/i }).first();
  if (await menu.count()) { await menu.click(); await page.waitForTimeout(500); }
  const link = page.getByRole('button', { name:'Action centre', exact:true }).first();
  if (await link.count()) { await link.click(); await page.waitForTimeout(1000); }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) throw new Error(`page scrolls sideways by ${over}px`);
  const clipped = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('main *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && (r.right > w + 2 || r.left < -2))) return false;
      // A deliberately scrollable track (the tab strip) is allowed to be wider
      // than the screen, because it scrolls inside itself.
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return false;
      }
      return true;
    }).map((el) => `${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ').slice(0,2).join('.')} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  if (clipped.length) throw new Error(`${clipped.length} overflow: ${clipped.slice(0,3).join(' | ')}`);
  await page.screenshot({ path: 'qa/action-centre-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
});

await step('long titles and long sender names do not break the card', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4347/', { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1600);
  await seed([item({
    id:'long',
    title:'Prepare and circulate the consolidated quarterly vendor reconciliation statement including the annexures',
    from:'Dr. Venkataraman Subrahmanyan Krishnamurthy',
    email:'venkataraman.subrahmanyan@verylongdomainname.example.co.in',
    subject:'Consolidated quarterly vendor reconciliation statement with all annexures and appendices attached',
    deadline: day(1), priority:'P1',
  })]);
  await goActions();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 2) throw new Error(`long content scrolls sideways by ${over}px`);
  await page.screenshot({ path:'qa/action-centre-long.png', fullPage:true });
});

await step('no page errors throughout', async () => {
  if (errs.length) throw new Error(errs.slice(0,3).join(' | '));
});

console.log('\n════════════════════════════════════════════');
console.log(failures ? `  ${failures} failed` : '  all passed');
console.log('════════════════════════════════════════════\n');
if (errs.length) console.log('ERRORS:', errs.slice(0,5).join('\n'));

await b.close(); server.close();
process.exit(failures ? 1 : 0);
