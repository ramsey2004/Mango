import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4337,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:980},deviceScaleFactor:2});
const page=await ctx.newPage();
const errs=[],R=[];
page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/ERR_|font/i.test(m.text()))errs.push(m.text());});
const go=async n=>{await page.getByRole('button',{name:n,exact:true}).first().click();await page.waitForTimeout(700);};
const txt=async()=>page.locator('main').innerText();
await page.goto('http://localhost:4337/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);

// --- verify the engine's arithmetic on the settings panel
await go('Settings'); await page.getByRole('button',{name:'Nutrition profile'}).click(); await page.waitForTimeout(700);
const st=await txt();
const grab=(l)=>st.match(new RegExp(l+'\\s*\\n\\s*([\\d.]+)','i'))?.[1];
R.push(`[calc] BMR=${grab('BMR')} (expect 1699) · TDEE=${grab('TDEE')} (2633) · Target=${grab('TARGET')} (2133) · Protein=${grab('PROTEIN')} (130) · Carbs=${grab('CARBS')} (259) · Fat=${grab('FAT')} (64) · Fibre=${grab('FIBRE')} (30) · BMI=${grab('BMI')} (23.5)`);
await page.screenshot({path:'nut-settings.png'});

await go('Nutrition');
let t=await txt();
R.push(`[target on home] ${t.match(/target (\d+) kcal/i)?.[1]}`);
const planned0=t.match(/(\d+) kcal planned/i)?.[1];
const cost0=t.match(/about ₹(\d+)/i)?.[1];

// swap dinner
const swaps=page.getByRole('button',{name:'Swap'});
await swaps.nth(3).click(); await page.waitForTimeout(700);
const opts=page.locator('[role="dialog"] button');
const optText=await opts.nth(2).innerText();
await opts.nth(2).click(); await page.waitForTimeout(800);
t=await txt();
R.push(`[swap] planned kcal ${planned0} -> ${t.match(/(\d+) kcal planned/i)?.[1]} · cost ₹${cost0} -> ₹${t.match(/about ₹(\d+)/i)?.[1]} · picked "${optText.split('\n')[0]}"`);

// eat lunch -> ring changes
const eaten0=t.match(/eaten (\d+) kcal/i)?.[1];
await page.getByRole('button',{name:'I ate this'}).first().click(); await page.waitForTimeout(800);
t=await txt();
R.push(`[log meal] eaten ${eaten0} -> ${t.match(/eaten (\d+) kcal/i)?.[1]} kcal`);

// water
const w0=t.match(/([\d.]+) of [\d.]+ litres/i)?.[1];
await page.getByRole('button',{name:'+500 ml'}).click(); await page.waitForTimeout(600);
R.push(`[water] ${w0} -> ${(await txt()).match(/([\d.]+) of [\d.]+ litres/i)?.[1]} L`);

// grocery
await go('Grocery');
await page.getByRole('button',{name:"Build from today's plan"}).first().click(); await page.waitForTimeout(800);
const gt=await txt();
R.push(`[grocery] ${gt.match(/(\d+) items/i)?.[1]} items · about ₹${gt.match(/about ₹(\d+)/i)?.[1]} · groups=${(gt.match(/\n(VEGETABLES|DAIRY|PROTEIN|GRAINS|PANTRY|FRUIT|OTHER)\n/gi)||[]).length}`);

// coach with real remaining numbers
await go('Nutrition coach');
await page.getByRole('button',{name:'What should I eat now?'}).first().click(); await page.waitForTimeout(1200);
const ct=await txt();
const line=ct.split('\n').find(l=>/kcal/.test(l)&&/left|past/.test(l));
R.push(`[coach] "${line?.slice(0,120)}"`);
R.push(`[coach why] ${/Why this one/i.test(ct)} · offers=${(ct.match(/I'll eat this/g)||[]).length}`);

// learning: rate a meal disliked then confirm it drops
await go('Nutrition');
await page.getByRole('button',{name:'More options'}).first().click().catch(()=>{});
R.push(`[errors so far] ${errs.length}`);

// festival arithmetic
await go('Meals');
await page.getByRole('tab',{name:'Festival'}).click(); await page.waitForTimeout(600);
for(let i=0;i<3;i++){await page.getByRole('button',{name:'More'}).first().click();await page.waitForTimeout(150);}
await page.waitForTimeout(500);
const ft=await txt();
R.push(`[festival] sweets=${ft.match(/sweets\s*\n\s*(\d+)/i)?.[1]} kcal · after=${ft.match(/after\s*\n\s*(-?\d+)/i)?.[1]} · advice="${ft.split('\n').find(l=>/fits|Tight|over/.test(l))?.slice(0,90)}"`);

// progress
await go('Body & intake');
await page.waitForTimeout(900);
const pt=await txt();
R.push(`[progress] avg intake=${pt.match(/average intake\s*\n\s*(\d+)/i)?.[1]} · avg protein=${pt.match(/average protein\s*\n\s*(\d+)/i)?.[1]} g · days on target=${pt.match(/days on target\s*\n\s*([\d/]+)/i)?.[1]}`);
await page.screenshot({path:'nut-progress2.png'});

console.log('--- RESULTS ---'); console.log(R.join('\n'));
console.log('--- ERRORS ('+errs.length+') ---'); console.log(errs.slice(0,8).join('\n'));
await b.close(); server.close();
