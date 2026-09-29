import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4400,r));
mkdirSync('/root/deck/shots',{recursive:true});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

// ---------- phone-format shots (for the product reveal mockup) ----------
const mob=await b.newContext({viewport:{width:412,height:900},deviceScaleFactor:3});
const mp=await mob.newPage();
await mp.goto('http://localhost:4400/',{waitUntil:'domcontentloaded'}); await mp.waitForTimeout(1800);
const openMenu=async(name)=>{ await mp.getByRole('button',{name:'Open menu'}).click(); await mp.waitForTimeout(450);
  await mp.getByRole('button',{name,exact:true}).first().click(); await mp.waitForTimeout(1000); };
await openMenu('Nutrition');
await mp.screenshot({path:'/root/deck/shots/phone-home.png'});
await mp.evaluate(()=>window.scrollTo(0,760)); await mp.waitForTimeout(600);
await mp.screenshot({path:'/root/deck/shots/phone-plan.png'});
await openMenu('Nutrition coach');
await mp.getByRole('button',{name:'What should I eat now?'}).first().click(); await mp.waitForTimeout(1400);
await mp.evaluate(()=>window.scrollTo(0,420)); await mp.waitForTimeout(500);
await mp.screenshot({path:'/root/deck/shots/phone-coach.png'});
await openMenu('Grocery');
await mp.getByRole('button',{name:"Build from today's plan"}).first().click(); await mp.waitForTimeout(1000);
await mp.screenshot({path:'/root/deck/shots/phone-grocery.png'});
await mob.close();

// ---------- desktop shots (for wide product panels) ----------
const ctx=await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto('http://localhost:4400/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
const go=async n=>{ await page.getByRole('button',{name:n,exact:true}).first().click(); await page.waitForTimeout(1100); };
const clip=async(sel,path)=>{ const el=await page.locator(sel).first(); await el.screenshot({path}); };

await go('Nutrition');
await page.screenshot({path:'/root/deck/shots/wide-home.png'});
// today's plan panel alone
const panels = page.locator('main section.panel');
await panels.nth(3).screenshot({path:'/root/deck/shots/panel-plan.png'}).catch(()=>{});
// "why this" reasoning modal
await page.getByRole('button',{name:'Why this?'}).first().click(); await page.waitForTimeout(900);
await page.locator('[role="dialog"]').screenshot({path:'/root/deck/shots/panel-why.png'});
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
// swap sheet
await page.getByRole('button',{name:'Swap'}).first().click(); await page.waitForTimeout(900);
await page.locator('[role="dialog"]').screenshot({path:'/root/deck/shots/panel-swap.png'});
await page.keyboard.press('Escape'); await page.waitForTimeout(500);

await go('Nutrition coach');
await page.getByRole('button',{name:'What should I eat now?'}).first().click(); await page.waitForTimeout(1500);
await page.screenshot({path:'/root/deck/shots/wide-coach.png'});
const answer = page.locator('main section.panel').nth(1);
await answer.screenshot({path:'/root/deck/shots/panel-coach.png'}).catch(()=>{});

await go('Meals');
await page.getByRole('tab',{name:'My kitchen'}).click(); await page.waitForTimeout(1000);
await page.screenshot({path:'/root/deck/shots/wide-kitchen.png'});
await page.getByRole('tab',{name:'Eat out'}).click(); await page.waitForTimeout(900);
await page.screenshot({path:'/root/deck/shots/wide-eatout.png'});

await go('Grocery');
await page.getByRole('button',{name:"Build from today's plan"}).first().click(); await page.waitForTimeout(1100);
await page.screenshot({path:'/root/deck/shots/wide-grocery.png'});

await go('Body & intake');
await page.waitForTimeout(1200);
await page.screenshot({path:'/root/deck/shots/wide-progress.png'});

await go('Log food');
await page.waitForTimeout(900);
await page.screenshot({path:'/root/deck/shots/wide-log.png'});

await b.close(); server.close();
console.log('shots done');
