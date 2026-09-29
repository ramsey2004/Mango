import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4346,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const ctx=await b.newContext({viewport:{width:1200,height:1000}});
const page=await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,140)));
await page.goto('http://localhost:4346/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1600);
const d=page.getByRole('button',{name:/demo/i}).first(); if(await d.count()){try{await d.click();await page.waitForTimeout(1400);}catch{}}
const before = await page.locator('main').innerText();
console.log('DINNER before:', (before.match(/DINNER[\s\S]{0,80}/)||[''])[0].replace(/\n/g,' | ').slice(0,90));
// Log something big and unplanned — this is what should move the evening.
await page.getByRole('button',{name:'Log food',exact:true}).first().click(); await page.waitForTimeout(900);
await page.getByRole('button',{name:'Type a sentence'}).click(); await page.waitForTimeout(400);
await page.getByPlaceholder(/I had two rotis/i).fill('2 samosa and one plate poha');
await page.getByRole('button',{name:'Read that'}).click(); await page.waitForTimeout(900);
await page.getByRole('button',{name:/^Add \d+ kcal to/}).click();
await page.waitForTimeout(1400);
await page.getByRole('button',{name:'Today',exact:true}).first().click(); await page.waitForTimeout(1200);
const state = await page.evaluate(async () => {
  const raw = localStorage.getItem('mango:db');
  if (!raw) return 'no mirror';
  const db = JSON.parse(raw);
  const today = new Date().toISOString().slice(0,10);
  const logs = db.nutrition.logs.filter((l)=>l.date===today);
  return {
    logs: logs.length,
    kcal: Math.round(logs.reduce((a,l)=>a+l.kcal,0)),
    plan: (db.nutrition.plans.find(p=>p.date===today)?.meals ?? []).map(m=>m.slot+':'+m.recipeId+(m.eaten?'(eaten)':'')),
    skipped: db.nutrition.plans.find(p=>p.date===today)?.skippedSlots ?? [],
    lastReplan: db.nutrition.lastReplan ?? null,
  };
});
console.log('state:', JSON.stringify(state));
const after = await page.locator('main').innerText();
console.log('replan panel:', /rest of your day changed/i.test(after) ? 'SHOWN' : 'not shown');
console.log((after.match(/The rest of your day changed[\s\S]{0,320}/)||[''])[0]);
await page.screenshot({path:'qa/replan.png'});
await b.close(); server.close();
