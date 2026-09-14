/** Test a frozen online-store manifest, reusing MD5-matched local packages.
 * Usage: tsx tools/real/store-test.ts manifest.json game-root output-dir
 * Manifest: { games: [{id,label,down,md5,len,scr,localPath?}] }.
 * Each result is checkpointed. Use a NEW output directory after changing code
 * or test settings; completed cases in an existing directory are resumed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const [manifestArg, rootArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !rootArg || !outputArg) throw new Error('Usage: store-test.ts manifest.json game-root output-dir');
const manifestPath = resolve(manifestArg), root = resolve(rootArg), output = resolve(outputArg);
type App = { id: number; caseId?: number; label: string; down: string; md5: string; len: number; scr: string; localPath?: string | null };
const manifestBytes = readFileSync(manifestPath);
const apps: App[] = JSON.parse(manifestBytes.toString()).games;
const digest = (b: Uint8Array | string, kind = 'sha256') => createHash(kind).update(b).digest('hex');
const concurrency = Math.max(1, Math.min(16, Number(process.env.MRP_STORE_CONCURRENCY) || 6));
mkdirSync(join(output, 'cases'), { recursive: true });
// Share verified downloads between before/after runs beside the manifest.
const cache = join(resolve(manifestPath, '..'), 'packages');
mkdirSync(cache, { recursive: true });
const settings = {
  MRP_COARSE_INSN_BUDGET: '128000000', MRP_COARSE_BOOT_TICKS: '30',
  MRP_COARSE_KEYS: 'SOFTLEFT,FIRE,FIRE,UP,RIGHT,DOWN,LEFT,5',
  MRP_COARSE_TAIL_TICKS: '30', MRP_COARSE_RESOURCES: '1',
  MRP_RESOURCE_DIR: process.env.MRP_RESOURCE_DIR ?? join(root, 'mythroad_res'),
};
const meta = {
  manifestSha256: digest(manifestBytes),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  // Include untracked runner separately; git diff alone omits newly added files.
  diffSha256: digest(execFileSync('git', ['diff', 'HEAD'])),
  runnerSha256: digest(readFileSync(new URL(import.meta.url))),
  settings,
};
const metaFile = join(output, 'meta.json');
if (existsSync(metaFile) && JSON.stringify(JSON.parse(readFileSync(metaFile, 'utf8'))) !== JSON.stringify(meta)) {
  throw new Error('Code, manifest or settings changed: use a new output directory');
}
writeFileSync(metaFile, JSON.stringify(meta));
const atomicJson = (p: string, v: unknown) => { writeFileSync(p + '.tmp', JSON.stringify(v, null, 2) + '\n'); renameSync(p + '.tmp', p); };

async function packagePath(app: App): Promise<string> {
  if (!/^[a-f0-9]{32}$/i.test(app.md5)) throw new Error('missing/invalid package MD5');
  const cached = join(cache, app.md5 + '.mrp');
  for (const p of [app.localPath, cached]) {
    if (p && existsSync(p) && digest(readFileSync(p), 'md5') === app.md5.toLowerCase()) return p;
  }
  const url = new URL(app.down, 'https://mrpstore.gddhy.net');
  if (url.origin !== 'https://mrpstore.gddhy.net') throw new Error('unexpected download origin');
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== app.len || digest(bytes, 'md5') !== app.md5.toLowerCase()) throw new Error('download length/MD5 mismatch');
      writeFileSync(cached + '.tmp', bytes); renameSync(cached + '.tmp', cached);
      return cached;
    } catch (e) { error = e; }
  }
  throw error;
}
function run(path: string, app: App): Promise<Record<string, unknown>> {
  return new Promise(done => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tools/real/coarse-all.ts', '--worker', path, output, root], {
      env: { ...process.env, ...settings, MRP_COARSE_SCREEN: app.scr }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 45_000);
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
    child.on('error', e => { stderr += String(e); });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) return done({ classification: 'worker-timeout', error: '45s wall-clock timeout' });
      try { done(JSON.parse(stdout.trim().split('\n').at(-1)!)); }
      catch { done({ classification: 'worker-error', error: stderr || 'worker produced no JSON' }); }
    });
  });
}
const results: Record<string, unknown>[] = [];
let next = 0;
const startedAt = new Date().toISOString();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < apps.length) {
    const index = next++, app = apps[index], caseFile = join(output, 'cases', `${index + 1}.json`);
    let result: Record<string, unknown>;
    if (existsSync(caseFile)) result = JSON.parse(readFileSync(caseFile, 'utf8'));
    else {
      let detail: Record<string, unknown>;
      try { detail = await run(await packagePath(app), app); }
      catch (e) { detail = { classification: 'download-error', error: String(e) }; }
      result = { ...detail, caseId: app.caseId ?? index + 1, id: app.id, label: app.label, down: app.down, md5: app.md5, scr: app.scr };
      atomicJson(caseFile, result);
    }
    results.push(result);
    if (results.length % 100 === 0) console.log(`[${results.length}/${apps.length}] ${app.label}: ${result.classification}`);
  }
}));
results.sort((a, b) => Number(a.caseId) - Number(b.caseId));
const counts: Record<string, number> = {};
for (const r of results) counts[String(r.classification)] = (counts[String(r.classification)] ?? 0) + 1;
atomicJson(join(output, 'results.json'), { ...meta, startedAt, finishedAt: new Date().toISOString(), total: apps.length, completed: results.length, counts, results });
console.log(JSON.stringify(counts, null, 2));
