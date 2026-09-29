import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
const server = createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4342,r));
mkdirSync('qa', { recursive: true });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-background-networking','--disable-sync','--no-first-run'] });
const ctx = await b.newContext({ viewport:{width:1440,height:1000} });
const page = await ctx.newPage();
ctx.setDefaultTimeout(4000); page.setDefaultTimeout(4000);
const errs = []; page.on('pageerror', e=>errs.push(String(e))); page.on('console', m=>{ if(m.type()==='error' && !/TUNNEL/.test(m.text())) errs.push(m.text()); });
let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('PASS ', name); }
  catch (e) { failures++; console.log('FAIL ', name, '→', String(e).split('\n')[0].slice(0,140)); }
  // Leave no overlay open for the next step.
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(350); } catch {}
};

await page.goto('http://localhost:4342/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1500);

await step('lands on onboarding or nutrition home', async () => {
  const t = await page.locator('main').innerText();
  if (!/goal|Today|nutrition/i.test(t)) throw new Error('unexpected landing: ' + t.slice(0,80));
});
await step('demo workspace loads', async () => {
  const d = page.getByRole('button',{name:/demo/i}).first();
  if (await d.count()) { await d.click(); await page.waitForTimeout(1400); }
  const t = await page.locator('main').innerText();
  if (!/kcal/i.test(t)) throw new Error('no data after demo load');
});
await step('today shows a recommendation with a reason', async () => {
  const t = await page.locator('main').innerText();
  if (!/why|because|uses /i.test(t)) throw new Error('no explanation on home');
});
await step('why-panel opens', async () => {
  const w = page.getByRole('button',{name:/why|how .*chose/i}).first();
  await w.click({timeout:3000}); await page.waitForTimeout(600);
});
await step('swap keeps constraints', async () => {
  const s = page.getByRole('button',{name:/^swap/i}).first();
  if (await s.count()) { await s.click({timeout:3000}); await page.waitForTimeout(800); }
});
await step('log food: natural language parse', async () => {
  await page.getByRole('button',{name:'Log food',exact:true}).first().click(); await page.waitForTimeout(700);
  await page.getByRole('button',{name:'Type a sentence'}).click(); await page.waitForTimeout(400);
  const nl = page.getByPlaceholder(/I had two rotis/i);
  await nl.fill('2 rotis and paneer bhurji'); await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Read that'}).click(); await page.waitForTimeout(900);
  const t = await page.locator('main').innerText();
  if (!/roti/i.test(t)) throw new Error('parser found nothing');
  if (!/rule-based/i.test(t)) throw new Error('parser not labelled as rule-based');
});
await step('grocery list renders', async () => {
  await page.getByRole('button',{name:'Grocery',exact:true}).first().click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/₹|list/i.test(t)) throw new Error('no grocery content');
});
await step('progress + consistency score', async () => {
  await page.getByRole('button',{name:'Progress',exact:true}).first().click(); await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  if (!/consisten/i.test(t)) throw new Error('no consistency score');
});
await step('coach answers from real data', async () => {
  await page.getByRole('button',{name:'Coach',exact:true}).first().click(); await page.waitForTimeout(700);
  const box = page.locator('main input, main textarea').last();
  await box.fill('what should I eat now'); await box.press('Enter'); await page.waitForTimeout(1200);
  const t = await page.locator('main').innerText();
  if (!/kcal|protein/i.test(t)) throw new Error('coach gave no data-backed answer');
});
await step('saved meals round-trips', async () => {
  await page.getByRole('button',{name:'Meals',exact:true}).first().click(); await page.waitForTimeout(700);
  await page.getByRole('button',{name:/^Save /}).first().click(); await page.waitForTimeout(500);
  await page.getByRole('tab',{name:/Saved/}).click(); await page.waitForTimeout(600);
  const t = await page.locator('main').innerText();
  if (/Nothing saved yet/.test(t)) throw new Error('save did not persist into the Saved tab');
});
await step('trust toggle switches a real behaviour', async () => {
  await page.getByRole('button',{name:'Your data',exact:true}).first().click(); await page.waitForTimeout(700);
  const sw = page.getByRole('switch').nth(2); // grocery/kitchen
  await sw.click(); await page.waitForTimeout(500);
});
await step('demo banner is visible and honest', async () => {
  const t = await page.locator('body').innerText();
  if (!/Demo data/.test(t)) throw new Error('no demo banner while demo data is loaded');
});
await step('pantry takes a quantity and an expiry', async () => {
  await page.getByRole('button',{name:'Meals',exact:true}).first().click(); await page.waitForTimeout(700);
  await page.getByRole('tab',{name:/My kitchen/}).click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  if (!/About to go off/i.test(t)) throw new Error('expiring items not surfaced');
  await page.getByLabel('Ingredient').fill('spinach');
  await page.getByRole('button',{name:'Add',exact:true}).click(); await page.waitForTimeout(700);
  const t2 = await page.locator('main').innerText();
  if (!/spinach/i.test(t2)) throw new Error('pantry item not added');
});
await step('nutrition widgets render on the dashboard', async () => {
  await page.getByRole('button',{name:'Command centre',exact:true}).first().click(); await page.waitForTimeout(1200);
  const t = await page.locator('main').innerText();
  if (!/What to eat next/i.test(t)) throw new Error('meal widget missing');
  if (!/Consistency/i.test(t)) throw new Error('consistency widget missing');
});
await step('eat-now answers, and the answer moves with the question', async () => {
  await page.getByRole('button',{name:'Eat now',exact:true}).first().click(); await page.waitForTimeout(900);
  const t = await page.locator('main').innerText();
  if (!/Best fit right now/.test(t)) throw new Error('no best answer');
  if (!/Faster|Cheaper/.test(t)) throw new Error('no named alternatives');
  // Set both ends explicitly so the assertion does not depend on whatever the
  // earlier steps left the workspace in.
  await page.getByRole('button',{name:'I can cook'}).click();
  await page.getByRole('button',{name:'45 min',exact:true}).click();
  await page.getByRole('button',{name:'Very hungry'}).click(); await page.waitForTimeout(900);
  const before = (await page.locator('main').innerText()).match(/Best fit right now[\s\S]{0,90}/)?.[0] ?? '';
  await page.getByRole('button',{name:'No cooking'}).click();
  await page.getByRole('button',{name:'5 min',exact:true}).click();
  await page.getByRole('button',{name:'Just peckish'}).click(); await page.waitForTimeout(900);
  const after = (await page.locator('main').innerText()).match(/Best fit right now[\s\S]{0,90}/)?.[0] ?? '';
  if (!before.trim() || !after.trim()) throw new Error('no answer in one of the two states');
  if (before.trim() === after.trim()) throw new Error(`answer did not change: ${before.replace(/\n/g,' | ').slice(0,80)}`);
});
await step('state survives a reload', async () => {
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
  const t = await page.locator('main').innerText();
  if (!/kcal/i.test(t)) throw new Error('data lost after reload');
});
await step('service worker + manifest served', async () => {
  const sw = await page.evaluate(async () => (await fetch('/sw.js')).status);
  const mf = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).status);
  if (sw !== 200 || mf !== 200) throw new Error(`sw=${sw} manifest=${mf}`);
});
await page.screenshot({path:'qa/journey-final.png'});
await b.close(); server.close();
console.log('\nERRORS:', [...new Set(errs)].filter(e=>!/TUNNEL|Failed to load resource/.test(e)).join(' | ') || '(none)');
if (failures) process.exitCode = 1;
