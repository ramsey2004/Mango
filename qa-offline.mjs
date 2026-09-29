import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4344,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('requestfailed', r => { if (offlinePhase) console.log('  reqfail:', r.url().replace(/^http:\/\/localhost:4344/,''), r.failure()?.errorText); });
page.on('pageerror', e => console.log('  pageerror:', String(e).slice(0,120)));
let offlinePhase = false;
await page.goto('http://localhost:4344/',{waitUntil:'load'});
await page.waitForTimeout(2000);
const d=page.getByRole('button',{name:/demo/i}).first();
if(await d.count()){try{await d.click();await page.waitForTimeout(1200);}catch{}}
// wait for the SW to control the page and for the warm pass
await page.evaluate(async()=>{ if(navigator.serviceWorker) await navigator.serviceWorker.ready; });
await page.waitForTimeout(7000);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  let n = 0;
  for (const k of names) n += (await (await caches.open(k)).keys()).length;
  return { names, n };
});
console.log('cached entries:', cached.n, cached.names.join(','));
const ctrl = await page.evaluate(() => !!navigator.serviceWorker?.controller);
console.log('controlled by SW:', ctrl);
const keys = await page.evaluate(async () => { const c = await caches.open('mango-shell-v1'); return (await c.keys()).map(r=>r.url).filter(u=>!u.includes('/assets/')); });
console.log('shell keys:', keys.join(' '));
offlinePhase = true;
await ctx.setOffline(true);
for (const label of ['Meals','Grocery','Coach','Progress']) {
  try {
    await page.getByRole('button',{name:label,exact:true}).first().click();
    await page.waitForTimeout(900);
    const t = await page.locator('main').innerText();
    const ok = !/Loading$/m.test(t) && t.length > 200;
    console.log(`OFFLINE ${label}:`, ok ? 'rendered' : 'PROBLEM → ' + t.slice(0,120).replace(/\n/g,' | '));
  } catch (e) { console.log(`OFFLINE ${label}: FAIL`, String(e).split('\n')[0].slice(0,80)); }
}
let reloadErr = '';
await page.reload({waitUntil:'domcontentloaded'}).catch((e)=>{ reloadErr = String(e).split('\n')[0]; });
await page.waitForTimeout(4000);
const after = await page.locator('body').innerText().catch((e)=> 'ERR ' + e);
console.log('  raw body len:', after.length, JSON.stringify(after.slice(0,150)));
let offlineFailed = false;
console.log('OFFLINE reload:', /kcal/i.test(after) ? 'app booted with data' : 'FAILED — ' + (reloadErr || after.slice(0,120).replace(/\n/g,' | ')));
await b.close(); server.close();
if (!/kcal/i.test(after)) process.exitCode = 1;
