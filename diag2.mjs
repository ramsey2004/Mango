import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const server = createServer((req,res)=>{ let p=join(ROOT,decodeURIComponent(req.url.split('?')[0])); if(!existsSync(p)||statSync(p).isDirectory()) p=join(ROOT,'index.html'); res.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'}); res.end(readFileSync(p)); });
await new Promise(r=>server.listen(4334,r));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
await page.goto('http://localhost:4334/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);
for (const v of ['Nutrition','Log food','Meals','Grocery','Nutrition coach','Body & intake']) {
  await page.getByRole('button',{name:v,exact:true}).last().click().catch(async()=>{
    await page.getByRole('button',{name:'Open menu'}).click(); await page.waitForTimeout(400);
    await page.getByRole('button',{name:v,exact:true}).first().click();
  });
  await page.waitForTimeout(800);
  const out = await page.evaluate((vv)=>{
    const W = document.documentElement.clientWidth; const bad=[];
    document.querySelectorAll('main *').forEach(el=>{ const r=el.getBoundingClientRect();
      if (r.right > W+1 && r.width>30) bad.push(`${el.tagName}.${String(el.className).slice(0,60)} w=${Math.round(r.width)} right=${Math.round(r.right)}`); });
    return {v:vv, scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0,4)};
  }, v);
  console.log(JSON.stringify(out));
}
// also read live numbers from the store via DOM text
await b.close(); server.close();
