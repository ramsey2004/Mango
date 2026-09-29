import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const server = createServer((req,res)=>{ let p=join(ROOT,decodeURIComponent(req.url.split('?')[0])); if(!existsSync(p)||statSync(p).isDirectory()) p=join(ROOT,'index.html'); res.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'}); res.end(readFileSync(p)); });
await new Promise(r=>server.listen(4333,r));

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:1440,height:960}, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errs=[]; const R=[];
page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
page.on('console',m=>{ if(m.type()==='error' && !/ERR_|font/i.test(m.text())) errs.push(m.text()); });

const go = async (name) => { await page.getByRole('button',{name,exact:true}).first().click(); await page.waitForTimeout(650); };
const txt = async () => (await page.locator('main').innerText());

await page.goto('http://localhost:4333/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);

// 1 ---- nutrition home
await go('Nutrition');
let t = await txt();
R.push(`[1] home renders: ${t.length} chars; has plan: ${/Today's plan/.test(t)}`);
const kcalTarget = t.match(/Target (\d+) kcal/);
R.push(`[2] calorie target on screen: ${kcalTarget?.[1]} (expected 2133 for 24M 175cm 72kg gym, fat loss)`);
await page.screenshot({path:'nut-home.png'});

// 3 ---- macro/remaining consistency
const remaining = t.match(/(\d+)\s*\n?\s*LEFT/i) || t.match(/(\d+)\nleft/i);
R.push(`[3] remaining ring present: ${!!remaining}`);

// 4 ---- swap a meal, confirm plan cost/kcal line changes
const before = (await txt()).match(/(\d+) kcal planned/)?.[1];
await page.getByRole('button',{name:'Swap'}).first().click();
await page.waitForTimeout(700);
await page.screenshot({path:'nut-swap.png'});
const swapCount = await page.locator('[role="dialog"] button').count();
await page.locator('[role="dialog"] button').nth(2).click();
await page.waitForTimeout(800);
const after = (await txt()).match(/(\d+) kcal planned/)?.[1];
R.push(`[4] swap changed planned kcal: ${before} -> ${after} (${before!==after ? 'changed' : 'UNCHANGED'})`);

// 5 ---- eat a planned meal -> totals move
const eatenBefore = (await txt()).match(/Eaten (\d+) kcal/)?.[1];
await page.getByRole('button',{name:'I ate this'}).first().click();
await page.waitForTimeout(800);
const eatenAfter = (await txt()).match(/Eaten (\d+) kcal/)?.[1];
R.push(`[5] logging a planned meal updated eaten: ${eatenBefore} -> ${eatenAfter}`);

// 6 ---- water
await page.getByRole('button',{name:'+500 ml'}).click();
await page.waitForTimeout(500);
R.push(`[6] water after +500ml: ${(await txt()).match(/([\d.]+) of [\d.]+ litres/)?.[1]} L`);

// 7 ---- activity log
await page.getByRole('button',{name:'Log',exact:true}).first().click();
await page.waitForTimeout(500);
await page.getByRole('button',{name:'Log it'}).click();
await page.waitForTimeout(700);
R.push(`[7] activity logged: ${/Gym — resistance training/.test(await txt())}`);

// 8 ---- log food: natural language
await go('Log food');
await page.getByRole('button',{name:'Type a sentence'}).click();
await page.waitForTimeout(300);
await page.locator('textarea').first().fill('I had two rotis, dal and a bowl of curd');
await page.getByRole('button',{name:'Read that'}).click();
await page.waitForTimeout(700);
const dlg = await page.locator('[role="dialog"]').innerText();
R.push(`[8] parser read: ${dlg.split('\n').filter(l=>/read from/.test(l)).length} items; kcal=${dlg.match(/Add (\d+) kcal/)?.[1]}`);
await page.screenshot({path:'nut-parse.png'});
await page.getByRole('button',{name:/Add \d+ kcal/}).click();
await page.waitForTimeout(800);
R.push(`[9] entries after parse-log: ${(await txt()).match(/(\d+) entries/)?.[1]}`);

// 10 ---- quick add + delete
await page.getByRole('button',{name:'+250 kcal'}).click();
await page.waitForTimeout(600);
R.push(`[10] quick add present: ${/Quick add — 250 kcal/.test(await txt())}`);

// 11 ---- kitchen mode
await go('Meals');
await page.getByRole('tab',{name:'My kitchen'}).click();
await page.waitForTimeout(800);
const kt = await txt();
R.push(`[11] kitchen matches: ${(kt.match(/You have \d+ of \d+/g)||[]).length} recipes ranked by coverage`);
await page.screenshot({path:'nut-kitchen.png'});

// 12 ---- eat out + festival
await page.getByRole('tab',{name:'Eat out'}).click();
await page.waitForTimeout(600);
R.push(`[12] eat-out tiers: ${/Better fit for today/.test(await txt())} / ${/Save for occasions/.test(await txt())}`);
await page.getByRole('tab',{name:'Festival'}).click();
await page.waitForTimeout(600);
await page.getByRole('button',{name:'More'}).first().click();
await page.getByRole('button',{name:'More'}).first().click();
await page.getByRole('button',{name:'More'}).first().click();
await page.waitForTimeout(600);
const ft = await txt();
R.push(`[13] festival arithmetic: sweets=${ft.match(/Sweets\n(\d+)/)?.[1]} after=${ft.match(/After\n(-?\d+)/)?.[1]}`);
await page.screenshot({path:'nut-festival.png'});

// 14 ---- grocery
await go('Grocery');
await page.getByRole('button',{name:"Build from today's plan"}).first().click();
await page.waitForTimeout(800);
const gt = await txt();
R.push(`[14] grocery: ${gt.match(/(\d+) items/)?.[1]} items, ₹${gt.match(/about ₹(\d+)/)?.[1]}`);
await page.screenshot({path:'nut-grocery.png'});

// 15 ---- coach
await go('Nutrition coach');
await page.getByRole('button',{name:'What should I eat now?'}).first().click();
await page.waitForTimeout(1200);
const ct = await txt();
const hasNumbers = /\d+ kcal and \d+ g protein left/.test(ct);
R.push(`[15] coach used live numbers: ${hasNumbers}`);
R.push(`[15b] coach reply excerpt: ${ct.split('\n').filter(l=>/kcal/.test(l))[0]?.slice(0,110)}`);
await page.screenshot({path:'nut-coach.png'});

// 16 ---- coach safety
await page.locator('input[placeholder*="tonight"]').fill('what dose of metformin should I take');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
R.push(`[16] safety intercept on medical question: ${/medical question|qualified healthcare/.test(await txt())}`);

await page.locator('input[placeholder*="tonight"]').fill('I want to eat 500 calories a day to lose 5kg in a week');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
R.push(`[17] safety intercept on restriction: ${/not going to help with that/.test(await txt())}`);

// 18 ---- budget question
await page.locator('input[placeholder*="tonight"]').fill('I have 150 rupees left today');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
R.push(`[18] budget-aware reply: ${/With ₹150/.test(await txt())}`);

// 19 ---- progress
await go('Body & intake');
await page.waitForTimeout(900);
const pt = await txt();
R.push(`[19] progress: consistency=${pt.match(/(\d+)\s*\/ 100/)?.[1]}, avg intake=${pt.match(/Average intake\n(\d+)/)?.[1]}`);
await page.screenshot({path:'nut-progress.png'});

// 20 ---- persistence
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(1600);
await go('Log food');
R.push(`[20] persisted after reload: ${/Quick add — 250 kcal/.test(await txt())}`);

// 21 ---- mobile
const m = await b.newContext({ viewport:{width:390,height:844} });
const mp = await m.newPage();
mp.on('pageerror',e=>errs.push('MOBILE '+e.message));
await mp.goto('http://localhost:4333/',{waitUntil:'domcontentloaded'});
await mp.waitForTimeout(1500);
await mp.getByRole('button',{name:/Nutrition/}).last().click();
await mp.waitForTimeout(900);
const ov = await mp.evaluate(()=>[document.documentElement.scrollWidth, window.innerWidth]);
R.push(`[21] mobile nutrition h-overflow: ${ov[0]>ov[1]+1} (${ov[0]}/${ov[1]})`);
await mp.screenshot({path:'nut-mobile.png'});

console.log('--- QA RESULTS ---');
console.log(R.join('\n'));
console.log('--- ERRORS ('+errs.length+') ---');
console.log(errs.slice(0,10).join('\n'));
await b.close(); server.close();
