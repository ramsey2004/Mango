import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json' };
const server = createServer((req,res)=>{ let p=join(ROOT,decodeURIComponent(req.url.split('?')[0])); if(!existsSync(p)||statSync(p).isDirectory()) p=join(ROOT,'index.html'); res.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'}); res.end(readFileSync(p)); });
await new Promise(r=>server.listen(4335,r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const page = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
await page.goto('http://localhost:4335/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1400);
for (const v of ['Nutrition','Log food','Meals','Grocery','Nutrition coach','Body & intake']) {
  await page.getByRole('button',{name:'Open menu'}).click();
  await page.waitForTimeout(450);
  await page.getByRole('button',{name:v,exact:true}).first().click();
  await page.waitForTimeout(800);
  const out = await page.evaluate((vv)=>{
    const W = document.documentElement.clientWidth; const bad=[];
    document.querySelectorAll('main *').forEach(el=>{ const r=el.getBoundingClientRect();
      if (r.right > W+1 && r.width>30) bad.push(`${el.tagName}.${String(el.className).slice(0,55)} w=${Math.round(r.width)}`); });
    return {v:vv, sw: document.documentElement.scrollWidth, W, bad: bad.slice(0,3)};
  }, v);
  console.log(JSON.stringify(out));
}
await b.close(); server.close();
