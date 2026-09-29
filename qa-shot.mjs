import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4343,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
for (const [tag,w,h,mob] of [['home-desktop',1440,1000,false],['home-phone',390,844,true]]) {
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:mob,hasTouch:mob});
  const page=await ctx.newPage(); page.setDefaultTimeout(5000);
  await page.goto('http://localhost:4343/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1500);
  const d=page.getByRole('button',{name:/demo/i}).first();
  if(await d.count()){await d.click();await page.waitForTimeout(1500);}
  await page.screenshot({path:`qa/${tag}.png`});
  try {
    await page.getByRole('button',{name:'Command centre',exact:true}).first().click();
    await page.waitForTimeout(1400);
    await page.screenshot({path:`qa/dash-${tag}.png`});
  } catch {}
  await ctx.close();
}
await b.close(); server.close(); console.log('shot');
