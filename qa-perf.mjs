import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
let served=[];
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');const body=readFileSync(p);served.push({url:q.url,bytes:body.length});s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(body);});
await new Promise(r=>server.listen(4351,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const kb=(n)=>`${(n/1024).toFixed(0)} kB`;
const snap=(label)=>{const js=served.filter(s=>s.url.endsWith('.js'));console.log(`  ${label.padEnd(34)} ${String(served.length).padStart(3)} requests  ${String(js.length).padStart(3)} js  ${kb(served.reduce((a,s)=>a+s.bytes,0)).padStart(9)}`);};

console.log('One browser profile, three consecutive visits:\n');
const ctx=await b.newContext();
const page=await ctx.newPage(); page.setDefaultTimeout(10000);

served=[];
await page.goto('http://localhost:4351/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('main');
await page.waitForTimeout(600);
snap('visit 1 — to first render');
await page.waitForTimeout(9000);
snap('visit 1 — incl. SW precache');

// a returning visit, service worker already installed and populated
served=[];
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForSelector('main');
await page.waitForTimeout(6000);
snap('visit 2 — returning user');

// and a third, plus opening three views that were never visited
served=[];
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForSelector('main');
await page.waitForTimeout(2000);
for (const v of ['Meals','Grocery','Progress']) {
  try { await page.getByRole('button',{name:v,exact:true}).first().click(); await page.waitForTimeout(700); } catch {}
}
await page.waitForTimeout(1500);
snap('visit 3 — plus 3 new views opened');

await ctx.close(); await b.close(); server.close();
