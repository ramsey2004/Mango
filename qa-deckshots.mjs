import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

/* ============================================================
   Recaptures the three product screenshots the deck embeds.

   They were captured before the audit, so they still showed copy
   the app no longer uses ("Condition tracks — diabetes") and an
   older accent. A deck that shows a product you no longer ship is
   worse than one with no screenshots at all.

   Output goes straight into the deck build folder, so rebuilding
   the deck picks them up.
   ============================================================ */

const ROOT = new URL('./dist/', import.meta.url).pathname;
const OUT = '/root/deck/build';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
const server = createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4352,r));
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-background-networking'] });

/** A fresh context with the demo workspace loaded and the banner dismissed. */
async function fresh(w, h, mobile) {
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, isMobile:mobile, hasTouch:mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  await page.goto('http://localhost:4352/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1800);
  const demo = page.getByRole('button', { name:/demo/i }).first();
  if (await demo.count()) { await demo.click(); await page.waitForTimeout(1600); }
  // The demo banner is honest in the product and noise in a deck.
  const keep = page.getByRole('button', { name:/^Keep it$/ }).first();
  if (await keep.count()) { await keep.click(); await page.waitForTimeout(700); }
  return { ctx, page };
}

const shots = [];

/* ---- ui-phone-plan.png — the day, on a phone ---- */
{
  const { ctx, page } = await fresh(390, 889, true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'ui-phone-plan.png') });
  shots.push('ui-phone-plan.png');
  await ctx.close();
}

/* ---- ui-phone-coach.png — the coach answering ---- */
{
  const { ctx, page } = await fresh(390, 870, true);
  try {
    await page.getByRole('button', { name:'Coach', exact:true }).first().click();
    await page.waitForTimeout(1200);
    const box = page.getByPlaceholder(/ask|what should/i).first();
    if (await box.count()) {
      await box.fill('what should i eat now');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2200);
    }
  } catch (e) { console.log('  coach: ' + String(e).split('\n')[0].slice(0, 90)); }
  await page.screenshot({ path: join(OUT, 'ui-phone-coach.png') });
  shots.push('ui-phone-coach.png');
  await ctx.close();
}

/* ---- ui-why.png — the explanation panel, desktop ---- */
{
  const { ctx, page } = await fresh(1280, 1000, false);
  try {
    const why = page.getByRole('button', { name:/why|how .*chose/i }).first();
    await why.click();
    await page.waitForTimeout(1100);
  } catch (e) { console.log('  why: ' + String(e).split('\n')[0].slice(0, 90)); }
  const dialog = page.locator('[role="dialog"]').first();
  if (await dialog.count()) await dialog.screenshot({ path: join(OUT, 'ui-why.png') });
  else await page.screenshot({ path: join(OUT, 'ui-why.png') });
  shots.push('ui-why.png');
  await ctx.close();
}

/* ---- the plans screen, so the pricing claims can be checked by eye ---- */
{
  const { ctx, page } = await fresh(1280, 1100, false);
  try {
    await page.getByRole('button', { name:'Settings', exact:true }).first().click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name:/Plans & pricing/i }).click();
    await page.waitForTimeout(900);
  } catch (e) { console.log('  plans: ' + String(e).split('\n')[0].slice(0, 90)); }
  await page.screenshot({ path: 'qa/plans.png', fullPage: true });
  shots.push('qa/plans.png');
  await ctx.close();
}

/* ---- a locked feature on the free tier ---- */
{
  const { ctx, page } = await fresh(1280, 900, false);
  await page.evaluate(async () => {
    const db = JSON.parse(localStorage.getItem('mango:db'));
    db.nutrition.plan = 'free';
    localStorage.setItem('mango:db', JSON.stringify(db));
    await new Promise((res, rej) => {
      const o = indexedDB.open('mango');
      o.onsuccess = () => { const c = o.result; const tx = c.transaction('state','readwrite'); tx.objectStore('state').put(db,'db'); tx.oncomplete = () => { c.close(); res(); }; tx.onerror = () => rej(tx.error); };
      o.onerror = () => rej(o.error);
    });
  });
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1800);
  try {
    await page.getByRole('button', { name:'Grocery', exact:true }).first().click();
    await page.waitForTimeout(900);
  } catch (e) { console.log('  locked: ' + String(e).split('\n')[0].slice(0, 90)); }
  await page.screenshot({ path: 'qa/locked-free.png' });
  shots.push('qa/locked-free.png');
  await ctx.close();
}

await b.close();
server.close();
console.log(`captured: ${shots.join(', ')}`);
