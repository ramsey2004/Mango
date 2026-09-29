import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
const ROOT=new URL('./dist/',import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=createServer((q,s)=>{let p=join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!existsSync(p)||statSync(p).isDirectory())p=join(ROOT,'index.html');s.writeHead(200,{'Content-Type':MIME[extname(p)]??'application/octet-stream'});s.end(readFileSync(p));});
await new Promise(r=>server.listen(4345,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-background-networking']});
const ctx=await b.newContext({viewport:{width:1100,height:1150}});
const page=await ctx.newPage(); page.setDefaultTimeout(6000);
await page.goto('http://localhost:4345/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1600);
const d=page.getByRole('button',{name:/demo/i}).first(); if(await d.count()){try{await d.click();await page.waitForTimeout(1400);}catch{}}
await page.getByRole('button',{name:'Why this?'}).first().click(); await page.waitForTimeout(800);
await page.screenshot({path:'qa/why.png'});
await page.getByRole('button',{name:/Show the arithmetic/}).click(); await page.waitForTimeout(600);
await page.screenshot({path:'qa/why-open.png'});
await b.close(); server.close(); console.log('why shot');
