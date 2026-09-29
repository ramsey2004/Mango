import { readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/* ============================================================
   Writes dist/assets.json — every hashed file the build emitted.

   The service worker uses it to precache the whole chunk graph at
   install time, ONCE per deployment. Before this, the app warmed
   every lazy chunk from the page on every visit, which cost about
   300 kB and 29 extra requests per session and made the code
   splitting decorative.
   ============================================================ */

const dist = process.argv[2] ?? 'dist';
if (!existsSync(dist)) {
  console.error(`asset-manifest: ${dist} does not exist — run the build first.`);
  process.exit(1);
}

const walk = (dir, base = '') => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (/\.(js|css)$/.test(name)) out.push(`./${rel}`);
  }
  return out;
};

const assets = walk(dist).sort();
writeFileSync(join(dist, 'assets.json'), JSON.stringify({ assets }, null, 2));
console.log(`asset-manifest: ${assets.length} files listed in ${dist}/assets.json`);
