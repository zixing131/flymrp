/**
 * Fast, exhaustive MRP startup smoke test.
 *
 * This intentionally runs every package with a short deterministic boot/input
 * window. It is the first pass before the slower collection-test scenarios.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { loadGb16Uc2, MythroadRuntime } from "../../src/mythroad/index.ts";
import { inferScreenSize } from "../../src/mythroad/device-size.ts";
import { loadGameResourceFiles, loadLocalSystemFiles } from "../local-system-files.ts";
import { SYSTEM_COMPONENTS } from "../../src/mythroad/system-components.ts";
import { MRPArchive } from "../../src/mrp/index.ts";
import { FrameCapture } from "./frame-capture.ts";

type Result = {
  path: string;
  sha256?: string;
  classification: string;
  phase?: string;
  error?: string | null;
  unknownSlot?: number | null;
  unknownEvents?: unknown[];
  nonBlack?: boolean;
  distinctFrames?: number;
  inputChanges?: number;
  elapsedMs?: number;
};

const args = process.argv.slice(2);
const worker = args[0] === "--worker";
const poolWorker = args[0] === "--pool-worker";
const root = resolve(worker ? args[1]! : poolWorker ? args[1]! : args[0] ?? process.env.MRP_GAME_DIR ?? "/Users/zixing/Downloads/mrp游戏大集结");
const output = resolve(worker ? args[2]! : poolWorker ? args[2]! : args[1] ?? "artifacts/coarse-all");
const gameRoot = resolve(worker ? args[3]! : poolWorker ? args[3]! : root);
const concurrency = Math.max(1, Number(process.env.MRP_COARSE_CONCURRENCY ?? 8) || 8);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && /\.mrp$/i.test(entry.name) ? [path] : [];
  });
}

async function loadSystemFiles(gameRoot: string): Promise<Record<string, Uint8Array>> {
  loadGb16Uc2(readFileSync("assets/system/gb16.uc2"));
  const localSystemDirectory = process.env.MRP_SYSTEM_DIR ?? join(gameRoot, "mythroad");
  const systemFiles = {
    ...Object.fromEntries(SYSTEM_COMPONENTS.map(name => [name, readFileSync(`assets/${name}`)])),
    ...(process.env.MRP_COARSE_LOCAL_SYSTEM === "1" ? await loadLocalSystemFiles(localSystemDirectory) : {}),
  };
  loadGb16Uc2(systemFiles["system/gb16.uc2"]);
  return systemFiles;
}

async function runGame(path: string, gameRoot: string, systemFiles: Record<string, Uint8Array>): Promise<Result> {
  const startedAt = Date.now();
  let bytes: Uint8Array | null = null;
  let rt: MythroadRuntime | null = null;
  let presented: FrameCapture | null = null;
  let phase = "load";
  let error: string | null = null;
  let inputChanges = 0;
  const frames = new Set<string>();
  try {
    bytes = new Uint8Array(readFileSync(path));
    const screen = process.env.MRP_COARSE_SCREEN?.match(/^(\d{2,3})x(\d{2,3})$/);
    const profile = screen ? { width: Number(screen[1]), height: Number(screen[2]) } : inferScreenSize(path);
    const archive = MRPArchive.parse(bytes);
    // The exhaustive pass is intentionally load-only. Resource directories can
    // contain millions of bytes; detailed regression reloads them for suspects.
    const resourceFiles = process.env.MRP_COARSE_RESOURCES === "1"
      ? await loadGameResourceFiles(process.env.MRP_RESOURCE_DIR ?? join(gameRoot, "mythroad_res"), archive.header.filename)
      : {};
    // Keep malformed or intentionally looping modules from blocking the
    // exhaustive pass; detailed regression uses the normal production budget.
    const display = new FrameCapture(() => rt!.screen, profile.width, profile.height);
    rt = new MythroadRuntime({ profile, graphics: display, abiMode: "strict", armInstructionBudget: Number(process.env.MRP_COARSE_INSN_BUDGET ?? 1_000_000), systemFiles, resourceFiles });
    const fingerprint = () => hash(new Uint8Array(display.pixels.buffer, display.pixels.byteOffset, display.pixels.byteLength));
    presented = display;
    const tick = (count: number) => {
      for (let i = 0; i < count; i++) {
        rt!.advance(80);
        for (let n = 0; n < 16 && rt!.step(); n++);
        frames.add(fingerprint());
      }
    };
    rt.loadMrp(bytes);
    phase = "start";
    rt.start();
    phase = "boot";
    tick(Number(process.env.MRP_COARSE_BOOT_TICKS ?? 3) || 3);
    phase = "input";
    const keys = (process.env.MRP_COARSE_KEYS ?? "FIRE").split(",").filter(Boolean);
    for (const key of keys) {
      const before = fingerprint();
      rt.input.press(key);
      tick(2);
      rt.input.release(key);
      tick(2);
      if (before !== fingerprint()) inputChanges++;
    }
    phase = "sustained";
    tick(Number(process.env.MRP_COARSE_TAIL_TICKS ?? 0));
    phase = "complete";
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return {
    path: relative(gameRoot, path),
    sha256: bytes ? hash(bytes) : undefined,
    classification: rt?.exited ? "exited" : error ? "runtime-error" : !(presented?.pixels.some(p => p !== 0)) ? "black-screen" : inputChanges ? "input-smoke-passed" : "static-frame",
    phase,
    error,
    unknownSlot: rt?.unknownRequiredSlot ?? null,
    unknownEvents: rt?.unknownEvents ?? [],
    nonBlack: presented?.pixels.some(p => p !== 0) ?? false,
    distinctFrames: frames.size,
    inputChanges,
    elapsedMs: Date.now() - startedAt,
  };
}

if (worker) {
  const systemFiles = await loadSystemFiles(gameRoot);
  process.stdout.write(JSON.stringify(await runGame(root, gameRoot, systemFiles)) + "\n");
} else if (poolWorker) {
  const systemFiles = await loadSystemFiles(gameRoot);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (line.trim()) process.stdout.write(JSON.stringify(await runGame(line.trim(), gameRoot, systemFiles)) + "\n");
  }
} else {
  if (!existsSync(root)) throw new Error(`MRP root not found: ${root}`);
  mkdirSync(output, { recursive: true });
  const files = walk(root).sort((a, b) => relative(root, a).localeCompare(relative(root, b), "zh"));
  const results: Result[] = [];
  let next = 0;
  const runOne = (path: string) => new Promise<void>(done => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--worker", path, output, root], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30_000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("close", () => {
      clearTimeout(timeout);
      let result: Result;
      try { result = JSON.parse(stdout.trim().split("\n").at(-1)!); }
      catch { result = { path: relative(root, path), classification: timedOut ? "worker-timeout" : "worker-error", error: stderr || "worker produced no JSON" }; }
      result.path = relative(root, path);
      results.push(result);
      if (results.length % 100 === 0)
        console.log(`[${results.length}/${files.length}] ${basename(path)}: ${result.classification}`);
      done();
    });
  });
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length || 1) }, async () => {
    while (next < files.length) await runOne(files[next++]!);
  }));
  results.sort((a, b) => a.path.localeCompare(b.path, "zh"));
  const counts = Object.fromEntries([...new Set(results.map(result => result.classification))].map(kind => [kind, results.filter(result => result.classification === kind).length]));
  writeFileSync(join(output, "results.json"), JSON.stringify({ root, totalFiles: files.length, completed: results.length, concurrency, counts, results }, null, 2) + "\n");
  writeFileSync(join(output, "suspects.json"), JSON.stringify(results.filter(result => result.classification !== "input-smoke-passed"), null, 2) + "\n");
  console.log(JSON.stringify({ totalFiles: files.length, completed: results.length, concurrency, counts, output }, null, 2));
}
