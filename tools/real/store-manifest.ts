/** Freeze the current store and reuse byte-identical local games by MD5.
 * Usage: tsx tools/real/store-manifest.ts game-root manifest.json [saved-list.json[.gz]]
 * Local game packages are only read; unmatched packages are fetched by store-test.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
const [rootArg, outputArg, savedList] = process.argv.slice(2);
if (!rootArg || !outputArg) throw new Error('Usage: store-manifest.ts game-root manifest.json [saved-list.json[.gz]]');
const root = resolve(rootArg), output = resolve(outputArg);
const listUrl = 'https://mrpstore.gddhy.net/api/list.json.gz';
let compressed: Uint8Array;
if (savedList) compressed = readFileSync(savedList);
else {
  const response = await fetch(listUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Store list: HTTP ${response.status}`);
  compressed = new Uint8Array(await response.arrayBuffer());
}
const bytes = compressed[0] === 0x1f && compressed[1] === 0x8b ? gunzipSync(compressed) : compressed;
const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
const apps = Array.isArray(data) ? data : data.games;
if (!Array.isArray(apps) || !apps.length) throw new Error('Store list must be a non-empty array');
const wanted = new Set(apps.map(app => String(app.md5).toLowerCase()));
const found = new Map<string, string>();
function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && /\.mrp$/i.test(entry.name)) {
      const md5 = createHash('md5').update(readFileSync(path)).digest('hex');
      if (wanted.has(md5) && !found.has(md5)) found.set(md5, path);
    }
  }
}
walk(root);
const games = apps.map((app, index) => ({ ...app, caseId: index + 1, localPath: found.get(String(app.md5).toLowerCase()) ?? null }));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ source: listUrl, frozenAt: new Date().toISOString(), listSha256: createHash('sha256').update(compressed).digest('hex'), games }, null, 2) + '\n');
console.log(JSON.stringify({ total: games.length, matched: games.filter(game => game.localPath).length, missing: games.filter(game => !game.localPath).length }));
