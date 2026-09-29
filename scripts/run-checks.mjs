import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

/* ============================================================
   One command that runs everything and reports honestly.

   `npm run build` uses `tsc -b --noCheck`, so a green build says
   nothing about type safety. The typecheck is run separately here
   for exactly that reason.
   ============================================================ */

const run = (label, cmd, args, opts = {}) => {
  process.stdout.write(`\n─── ${label}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  const ok = r.status === 0;
  return { label, ok };
};

const ts = (label, file) => {
  const out = `/tmp/mango-check-${file.replace(/\W/g, '_')}.cjs`;
  const build = spawnSync('npx', ['esbuild', file, '--bundle', '--platform=node', '--format=cjs', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' });
  if (build.status !== 0) return { label, ok: false };
  return run(label, 'node', [out]);
};

const results = [];
results.push(run('typecheck (independent of the build)', 'npx', ['tsc', '--noEmit']));
results.push(run('production build', 'npm', ['run', 'build']));
results.push(ts('recipe and ingredient data', 'scripts/validate-recipes.ts'));
results.push(ts('nutrition safety probe', 'scripts/safety-probe.ts'));
results.push(ts('hard-filter probe', 'scripts/filter-probe.ts'));
results.push(ts('email extraction probe', 'scripts/mail-probe.ts'));
results.push(ts('tier gating probe', 'scripts/tier-probe.ts'));
results.push(ts('health engine probe', 'scripts/health-probe.ts'));
results.push(ts('food catalogue validation', 'scripts/validate-foods.ts'));

const browser = [
  ['responsive sweep', 'qa-responsive.mjs'],
  ['user journeys', 'qa-journey.mjs'],
  ['persistence failure modes', 'qa-persistence.mjs'],
  ['offline behaviour', 'qa-offline.mjs'],
  ['action centre', 'qa-actioncenter.mjs'],
];
for (const [label, file] of browser) {
  if (!existsSync(file)) { results.push({ label, ok: false }); continue; }
  results.push(run(label, 'node', [file]));
}

console.log('\n════════════════════════════════════════════');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`════════════════════════════════════════════\n  ${results.length - failed}/${results.length} passed\n`);
process.exitCode = failed ? 1 : 0;
