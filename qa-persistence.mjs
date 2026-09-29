import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4350,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const URL_='http://localhost:4350/';
const results=[];
const check=(name,pass,detail='')=>{results.push([name,pass,detail]);console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`);};

// 1. corrupted IndexedDB document must not be replaced by demo data
{
  const ctx=await b.newContext(); const page=await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.goto(URL_,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    await new Promise((res) => {
      const req = indexedDB.open('mango', 1);
      req.onsuccess = () => { const tx = req.result.transaction('state','readwrite'); tx.objectStore('state').put({ nonsense: true }, 'db'); tx.oncomplete = () => res(); };
    });
    localStorage.removeItem('mango:db');
  });
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(2500);
  const t = await page.locator('body').innerText();
  check('corrupted document is reported, not silently replaced', /Could not open your data/i.test(t), t.slice(0,60).replace(/\n/g,' '));
  // Match the banner's own sentence, not any button that happens to say "demo".
  check('corrupted document does not trigger demo seeding', !/Everything here is sample data/i.test(t));
  await ctx.close();
}

// 2. a newer schema version must be refused rather than downgraded
{
  const ctx=await b.newContext(); const page=await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.goto(URL_,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    await new Promise((res) => {
      const req = indexedDB.open('mango', 1);
      req.onsuccess = () => { const tx = req.result.transaction('state','readwrite'); tx.objectStore('state').put({ version: 99, tasks: [], areas: [], settings: {} }, 'db'); tx.oncomplete = () => res(); };
    });
  });
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(2500);
  const t = await page.locator('body').innerText();
  check('newer schema is refused rather than downgraded', /newer version of Mango/i.test(t));
  await ctx.close();
}

// 3. with storage unavailable the app must still run and must NOT claim to have saved
{
  const ctx=await b.newContext(); const page=await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.addInitScript(() => {
    // Simulate private-mode style failure: IDB open errors, localStorage throws.
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function () { const req = realOpen('mango-blocked-' + Math.random(), 1); setTimeout(() => { try { req.onerror && req.onerror(new Event('error')); } catch {} }, 0); return req; };
    const ls = window.localStorage;
    Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem: () => { throw new DOMException('QuotaExceededError'); }, removeItem: () => {}, key: () => null, length: 0 }, configurable: true });
    void ls;
  });
  await page.goto(URL_,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2500);
  const loaded = await page.locator('main').count();
  check('app still renders with storage unavailable', loaded > 0);
  const d = page.getByRole('button',{name:/demo/i}).first();
  if (await d.count()) { try { await d.click(); await page.waitForTimeout(1600); } catch {} }
  const status = await page.locator('body').innerText();
  const claimsSaved = /Saved on this device/i.test(status);
  const saysFailed = /Could not save/i.test(status);
  check('does not claim "Saved on this device" when nothing can be written', !claimsSaved, claimsSaved ? 'still claims saved' : '');
  // The sidebar is hidden below 1024px, so widen before asserting the positive.
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(900);
  const wide = await page.locator('body').innerText();
  check('says "Could not save" instead', /Could not save/i.test(wide) || saysFailed, wide.match(/Could not save|Saved on this device|Saving/i)?.[0] ?? 'no indicator found');
  await ctx.close();
}

// 4. a normal write must still round-trip
{
  const ctx=await b.newContext(); const page=await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.goto(URL_,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
  const d = page.getByRole('button',{name:/demo/i}).first();
  if (await d.count()) { try { await d.click(); await page.waitForTimeout(1600); } catch {} }
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(2200);
  const t = await page.locator('main').innerText();
  check('ordinary data survives a reload', /kcal/i.test(t));
  await ctx.close();
}

// 5. two tabs on the same workspace must be detected and declared
{
  const ctx=await b.newContext();
  const a=await ctx.newPage(); a.setDefaultTimeout(8000);
  await a.goto(URL_,{waitUntil:'domcontentloaded'}); await a.waitForTimeout(1800);
  const second=await ctx.newPage(); second.setDefaultTimeout(8000);
  await second.goto(URL_,{waitUntil:'domcontentloaded'}); await second.waitForTimeout(2000);
  await a.waitForTimeout(1200);
  const ta=await a.locator('body').innerText();
  const tb=await second.locator('body').innerText();
  check('second tab is detected in both tabs', /open in another tab/i.test(ta) && /open in another tab/i.test(tb));
  await ctx.close();
}

await b.close(); server.close();
const failed = results.filter(([,p])=>!p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
