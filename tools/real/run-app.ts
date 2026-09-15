#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { GET_OPCODE, GETARG_A, GETARG_B, GETARG_Bx, GETARG_C, GETARG_sBx, OP_NAMES } from "../../src/lua/opcodes.ts";
import { LuaChunkReader } from "../../src/lua/chunk.ts";
import { MRPArchive } from "../../src/mrp/archive.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../../src/mythroad/index.ts";
import { formatInsn } from "../../src/real/code6.ts";

const path = process.argv[2] ?? "test/fixtures/real/app.mrp";
const tickArg = process.argv.find((arg) => arg.startsWith("--ticks="));
const tickCount = tickArg ? Number(tickArg.slice("--ticks=".length)) : 0;
const traceGuestSlices = process.argv.includes("--guest-slices");
const monotonic = process.argv.includes("--monotonic") || traceGuestSlices;
if (!Number.isSafeInteger(tickCount) || tickCount < 0) throw new Error("--ticks must be a non-negative integer");
const bytes = new Uint8Array(readFileSync(path));
const arc = MRPArchive.parse(bytes);
const starts = arc.entries.filter((e) => e.name === "start.mr");
console.log("start.mr copies:", starts.length, starts.map((e) => ({ off: e.offset, len: e.storedLength })));

function disasm(label: string, data: Uint8Array): void {
  const p = LuaChunkReader.load(data);
  console.log(`\n== ${label} source=${p.source} code=${p.code.length} k=${p.k.length} ==`);
  for (let i = 0; i < p.k.length; i++) {
    const c = p.k[i]!;
    console.log(`  K[${i}]`, c);
  }
  for (let i = 0; i < p.code.length; i++) {
    const insn = p.code[i]!;
    const op = GET_OPCODE(insn);
    console.log(
      `  ${String(i).padStart(3)} ${OP_NAMES[op]!.padEnd(10)} A=${GETARG_A(insn)} B=${GETARG_B(insn)} C=${GETARG_C(insn)} Bx=${GETARG_Bx(insn)} sBx=${GETARG_sBx(insn)}`,
    );
  }
}

const first = arc.readFile("start.mr");
disasm("find() first start.mr", first);

// second copy: read raw slice via entries[3] if present
if (starts[1]) {
  const raw = bytes.subarray(starts[1].offset, starts[1].offset + starts[1].storedLength);
  const { isGzip, gunzip } = await import("../../src/mrp/gzip.ts");
  const payload = isGzip(raw) ? gunzip(raw) : raw;
  disasm("second start.mr", payload);
}

const g = new NullGraphicsBackend();
const tr = new RuntimeTrace();
const rt = new MythroadRuntime({
  graphics: g,
  trace: tr,
  abiMode: "strict",
  monotonicTime: monotonic ? () => performance.now() : undefined,
  traceGuestSlices,
});
try {
  rt.loadMrp(bytes);
  rt.start("start.mr");
  for (let i = 0; i < tickCount; i++) {
    rt.advance(80);
    for (let step = 0; step < 16 && rt.step(); step++);
  }
  console.log("start returned, exited=", rt.exited, "state=", rt.state);
} catch (e) {
  console.log("\nTHROW", e instanceof Error ? `${e.name}: ${e.message}` : e);
}
console.log("\n== TRACE ==");
for (const rec of tr.records) {
  console.log(`${rec.sequence} [${rec.phase}] ${rec.operation}`, JSON.stringify(rec.arguments), "=>", JSON.stringify(rec.returnValue));
}
console.log("unknown", JSON.stringify(rt.unknownEvents, null, 2));
console.log("gfx", g.commands.length, "ext", !!rt.ext);
if (traceGuestSlices && rt.ext) {
  console.log("guestSlices");
  for (const sample of rt.ext.guestSlices) {
    const registers = sample.regs.map((value, index) => `r${index}=${value.toString(16)}`).join(" ");
    console.log(
      `${sample.insnCount} pc=${sample.pc.toString(16)} lr=${sample.lr.toString(16)} ` +
      `thumb=${sample.thumb} cpsr=${sample.cpsr.toString(16)} clock=${sample.clockProgress} ${registers}`,
    );
  }
  const pcs = [...new Set(rt.ext.guestSlices.slice(-32)
    .filter(sample => !sample.thumb && sample.pc >= rt.ext!.codeBase && sample.pc < rt.ext!.codeBase + rt.ext!.codeLen)
    .map(sample => sample.pc))];
  if (pcs.length) console.log("sliceDisasm", pcs.map(pc => formatInsn(pc, rt.ext!.mem.read32(pc))).join("\n"));
  const final = rt.ext.guestSlices.at(-1);
  if (final && !final.thumb && final.pc >= rt.ext.codeBase && final.pc < rt.ext.codeBase + rt.ext.codeLen) {
    const start = Math.max(rt.ext.codeBase, (final.pc - 0x80) & ~3);
    const end = Math.min(rt.ext.codeBase + rt.ext.codeLen, final.pc + 0x84);
    const lines = [];
    for (let pc = start; pc < end; pc += 4) lines.push(formatInsn(pc, rt.ext.mem.read32(pc)));
    console.log("finalSliceDisasm", lines.join("\n"));
  }
}
console.log("mrReads", JSON.stringify(rt.mrReads, null, 2));
console.log("fileOps", JSON.stringify(rt.mrTable?.files.ops ?? [], null, 2));
