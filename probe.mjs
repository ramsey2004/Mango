import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4336,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const page=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await page.goto('http://localhost:4336/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1400);
await page.getByRole('button',{name:'Open menu'}).click(); await page.waitForTimeout(400);
await page.getByRole('button',{name:'Nutrition',exact:true}).first().click(); await page.waitForTimeout(900);
console.log(await page.evaluate(()=>{
  const W=document.documentElement.clientWidth;
  const wide=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().width>W-20);
  return wide.slice(0,14).map(e=>{
    const r=e.getBoundingClientRect();
    return `${e.tagName}.${String(e.className).slice(0,70)} | w=${Math.round(r.width)} scrollW=${e.scrollWidth} txt=${(e.textContent||'').slice(0,40).replace(/\n/g,' ')}`;
  }).join('\n');
}));
await b.close(); server.close();
