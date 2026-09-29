import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, cpSync, rmSync } from 'fs';
import { join, extname } from 'path';

/* Simulates a redeploy: serve build A, load the app, swap the server to
   build B (different hashed filenames), then see what a returning user gets
   and what happens to a chunk that no longer exists. */

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
let ROOT = new URL('./dist-a/', import.meta.url).pathname;
const missing = [];
const server=createServer((q,s)=>{
  const url = decodeURIComponent(q.url.split('?')[0]);
  let p=join(ROOT,url);
  if(!existsSync(p)||statSync(p).isDirectory()){
    if (/\.(js|css)$/.test(url)) { missing.push(url); s.writeHead(404); s.end('gone'); return; }
    p=join(ROOT,'index.html');
  }
  s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));
});
await new Promise(r=>server.listen(4352,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const ctx=await b.newContext(); const page=await ctx.newPage(); page.setDefaultTimeout(10000);
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)));

await page.goto('http://localhost:4352/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('main'); await page.waitForTimeout(6000);
const d=page.getByRole('button',{name:/demo/i}).first(); if(await d.count()){try{await d.click();await page.waitForTimeout(1500);}catch{}}
const buildA = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))[0]);
console.log('build A entry:', buildA);

// redeploy
ROOT = new URL('./dist-b/', import.meta.url).pathname;
console.log('--- swapped the server to build B ---');

await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(3000);
const afterReload = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))[0]);
console.log('after 1st reload:', afterReload, afterReload === buildA ? '(still build A)' : '(build B)');

await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(4000);
const afterSecond = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))[0]);
console.log('after 2nd reload:', afterSecond, afterSecond === buildA ? '(STILL build A — stale)' : '(build B)');

// does the app still work, and can it reach views after the swap?
let ok = true;
for (const v of ['Meals','Grocery','Coach']) {
  try { await page.getByRole('button',{name:v,exact:true}).first().click(); await page.waitForTimeout(800); } catch { ok = false; }
}
const body = await page.locator('main').innerText().catch(()=> '');
console.log('app still usable after redeploy:', ok && body.length > 200);
console.log('404s for chunks that no longer exist:', missing.length, missing.slice(0,3).join(', '));
console.log('page errors:', errs.length ? errs.slice(0,3).join(' | ') : '(none)');

// After the redeploy, is the NEW build fully cached — i.e. would an unvisited
// view still work offline — and have the old build's chunks been evicted?
await page.waitForTimeout(6000);
const cacheState = await page.evaluate(async () => {
  const c = await caches.open('mango-shell-v3');
  const keys = (await c.keys()).map(r => r.url);
  const manifest = await (await fetch('./assets.json')).json();
  const wanted = manifest.assets.map(a => new URL(a, location.href).href);
  const cachedAssets = keys.filter(u => /\/assets\/.*\.(js|css)$/.test(u));
  return {
    cached: cachedAssets.length,
    wanted: wanted.length,
    missing: wanted.filter(u => !keys.includes(u)).length,
    stale: cachedAssets.filter(u => !wanted.includes(u)).length,
  };
});
console.log('after deploy — cached assets:', cacheState.cached, 'of', cacheState.wanted, '| missing:', cacheState.missing, '| stale left over:', cacheState.stale);

await ctx.setOffline(true);
await page.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
await page.waitForTimeout(3000);
const offlineBody = await page.locator('body').innerText().catch(()=> '');
console.log('offline after redeploy:', /Mango/.test(offlineBody) ? 'app booted' : 'FAILED');
await b.close(); server.close();
