import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

const ROOT = new URL('./dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.json':'application/json' };
const server = createServer((q, s) => {
  let p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(ROOT, 'index.html');
  s.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
  s.end(readFileSync(p));
});
await new Promise(r => server.listen(4341, r));
mkdirSync('qa', { recursive: true });

const SIZES = [
  ['w320', 320, 720, true], ['w375', 375, 812, true], ['w390', 390, 844, true], ['w430', 430, 932, true],
  ['w768', 768, 1024, false], ['w1024', 1024, 768, false], ['w1280', 1280, 800, false],
  ['w1440', 1440, 900, false], ['w1920', 1920, 1080, false],
];
const VIEWS = ['Today', 'Meals', 'Log food', 'Grocery', 'Progress', 'Coach', 'Your data'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const problems = [];
const consoleErrors = [];

for (const [tag, w, h, isMobile] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', e => consoleErrors.push(`${tag}: PAGEERROR ${String(e).slice(0, 160)}`));
  await page.goto('http://localhost:4341/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // seed the demo workspace so every view has data
  const demo = page.getByRole('button', { name: /demo|try it|load/i }).first();
  if (await demo.count()) { try { await demo.click({ timeout: 1500 }); await page.waitForTimeout(1200); } catch {} }

  for (const label of VIEWS) {
    // navigate: sidebar on wide, drawer on narrow
    const menu = page.getByRole('button', { name: 'Open menu' });
    if (await menu.count() && await menu.isVisible()) { await menu.click(); await page.waitForTimeout(350); }
    const link = page.getByRole('button', { name: label, exact: true }).first();
    if (!(await link.count())) { problems.push(`${tag} · ${label}: nav item not found`); 
      if (isMobile) { await page.keyboard.press('Escape'); } continue; }
    try { await link.click({ timeout: 2500 }); } catch { problems.push(`${tag} · ${label}: nav click failed`); continue; }
    await page.waitForTimeout(650);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const over = [];
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === 'auto' || ov === 'scroll') return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (inScroller(el)) continue;
        if (r.right > de.clientWidth + 1.5) {
          over.push((el.tagName + '.' + String(el.className).slice(0, 60)).slice(0, 90) + ` right=${Math.round(r.right)}`);
        }
      }
      // touch targets inside main
      const small = [];
      for (const el of document.querySelectorAll('main button, main a, main [role="switch"], nav button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.disabled) continue;
        const cs = getComputedStyle(el);
        const after = getComputedStyle(el, '::after');
        const pad = after.content !== 'none' && after.position === 'absolute' ? parseFloat(after.height) || 0 : 0;
        const hit = Math.max(r.height, pad);
        if (hit < 30 || r.width < 24) small.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return {
        docW: de.scrollWidth, clientW: de.clientWidth,
        over: [...new Set(over)].slice(0, 6),
        small: [...new Set(small)].slice(0, 6),
      };
    });
    if (m.docW > m.clientW + 1) problems.push(`${tag} · ${label}: HORIZONTAL SCROLL ${m.docW} > ${m.clientW}`);
    if (m.over.length) problems.push(`${tag} · ${label}: overflowing → ${m.over.join(' | ')}`);
    if (isMobile && m.small.length) problems.push(`${tag} · ${label}: small targets → ${m.small.join(' | ')}`);
  }
  await page.screenshot({ path: `qa/${tag}.png`, fullPage: false });
  await ctx.close();
}

await b.close(); server.close();
console.log('=== CONSOLE ERRORS ===');
console.log([...new Set(consoleErrors)].join('\n') || '(none)');
console.log('\n=== LAYOUT PROBLEMS ===');
console.log(problems.join('\n') || '(none)');
console.log(`\n${problems.length} problems`);
if (problems.length) process.exitCode = 1;
