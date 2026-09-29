import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4347,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
for (const [tag,w,h,mob] of [['eatnow-desktop',1280,1250,false],['eatnow-phone',390,844,true]]) {
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:mob,hasTouch:mob});
  const page=await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,140)));
  await page.goto('http://localhost:4347/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1600);
  const d=page.getByRole('button',{name:/demo/i}).first(); if(await d.count()){try{await d.click();await page.waitForTimeout(1400);}catch{}}
  if (mob) { const m = page.getByRole('button',{name:'Open menu'}); if (await m.count() && await m.isVisible()) { await m.click(); await page.waitForTimeout(300); } }
  await page.getByRole('button',{name:'Eat now',exact:true}).first().click();
  await page.waitForTimeout(1000);
  const t = await page.locator('main').innerText();
  console.log(`${tag}: best=${/Best fit right now/.test(t)} faster=${/Faster/.test(t)} cheaper=${/Cheaper/.test(t)}`);
  await page.screenshot({path:`qa/${tag}.png`});
  // change the question and check the answer moves
  if (!mob) {
    const before = (t.match(/Best fit right now[\s\S]{0,120}/)||[''])[0];
    await page.getByRole('button',{name:'5 min',exact:true}).click(); await page.waitForTimeout(700);
    await page.getByRole('button',{name:'No cooking'}).click(); await page.waitForTimeout(900);
    const t2 = await page.locator('main').innerText();
    const after = (t2.match(/Best fit right now[\s\S]{0,120}/)||[''])[0];
    console.log('  answer changed with the question:', before.trim() !== after.trim());
    console.log('  now:', after.replace(/\n/g,' | ').slice(0,110));
    await page.screenshot({path:'qa/eatnow-nokitchen.png'});
  }
  await ctx.close();
}
await b.close(); server.close();
