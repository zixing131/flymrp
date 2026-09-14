/**
 * Stage 5-C.10R — real MRP post-inflate continuation / Stage 5-C completion gate.
 * Observe production startup only. Host gunzip is verification-only.
 * Stage 5-C COMPLETE when arm_ext_call(0) returns and Lua resumes.
 */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ExtStopKind } from "../abi/fault.ts";
import { AEX_P_ER_RW_OFF, EXT_TABLE_ADDR, EXT_TABLE_COUNT, tableSlotIndex } from "../abi/layout.ts";
import { DEFAULT_INSN_BUDGET } from "../abi/runtime.ts";
import { unknownTableSlot } from "../err/errors.ts";
import { TAG_FUNCTION } from "../lua/types.ts";
import { MRPArchive } from "../mrp/archive.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../mythroad/index.ts";
import { stackPreview } from "../mythroad/probe.ts";
import { findThumbFnStart } from "./inflate-budget.ts";
import { ARM_INSN_BUDGET_THROWN } from "./startup.ts";

export type BlockerCategory =
  | "CORE_C_ABI"
  | "EXT_ABI"
  | "LUA_COMPAT"
  | "GRAPHICS"
  | "TEXT"
  | "TIMER"
  | "EVENT"
  | "INPUT"
  | "FILE"
  | "PLATFORM"
  | "AUDIO"
  | "NETWORK"
  | "CPU"
  | "MEMORY"
  | "OTHER";

export type GateStatus = "PASS" | "BLOCKED" | "NOT REACHED";

export const POST_INFLATE = {
  inflateFn: 0x01ea1d28,
  inflatePop: 0x01ea1e96,
  lastInsidePc: 0x01ea1e94,
  lastInsideLr: 0x01ea1f83,
  lastInsideInsn: 1_586_203,
  gzipIn: 0x002504fc,
  gzipInLen: 17174,
  gzipAlloc: 17178,
  outBuf: 0x00254818,
  outAlloc: 30196,
  outLen: 30192,
  dataOff: 4,
  outputSha256: "6b08cf46dbd5b6dbe32ce68a3d552107c2af27fa91724b41992901953a033235",
  table30: 30,
  table30R0: 0x662f,
  table30R1: 0,
  table30R2: 0x01e7ff7c,
  table30R3: 0x01e7ff78,
  table30Blx: 0x01eaadaa,
  table30Lr: 0x01eaadad,
  table30Fn: 0x01eaad6c,
  hitCount: 4864,
  table0: 283,
  table1: 264,
  table3: 3843,
  table3Inflate: 3432,
  table1Teardown: 37,
  slotRle:
    "25,0,125,25,0,14,130,14,38,33,17,40,14,44,0,45,44,0,3x2,10,3x2,10,3x2,10,3x2,1x2,0,45,44,41,9x2,0,14,0,1,14,0x34,14,0x2,3x3432,1x37,30,14,37,26x2,42,14,42,49,5,40,45,44,3,45,44,45,44,45,44,45,44,41,35,61,40,14,45,44,41,14,15,14,6,18,37,0,14x3,5,7x3,5,7,14,5,7x5,14,17,7,14,7x3,42,0,14,5,7x3,14,38,3,15,38,42,15,38,1,42,0x2,14x2,42,0x3,14,0,14,42,1,14,42,14x2,42,14,42,14,0x3,14,18,14x3,18,14x2,18,14x2,18,14x2,18,3x2,14x2,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14,3,14,18,14x2,18,14x2,18,14x2,18,26x5,40,14,45,44,41,14,26,122,123,29,0,14,0,29,78,37,14x2,7x3,40,42,49,14x2,7x3,40,41,7,0,40,14,44,0,45,44,0,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,1x2,0,45,44,41,9x2,0,14,0x105,14,0,3x19,1x107,14x2,7x3,40,45,43x4,41,1x2,14x2,7x3,40,45,0,44x4,41,0,14,3,14x2,7x3,40,42,14x2,7x3,40,41,7,0,40,14,44,0,45,44,0,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,10,3x2,1x2,0,45,44,41,9x2,0,14,0x105,14,0,3x22,1x107,14x2,7x3,40,45,43x4,41,1x2,14x2,7x3,40,45,0,44x4,41,0,14,3,14,42x2,122,123,0,33x2,32,31,29,80",
  liveAllocs: 18,
  mrAllocs: 284,
  bump: 0x00a4c148,
  blockerCategory: "EVENT" as BlockerCategory,
} as const;

export type NativeRec = {
  name: string;
  args: unknown[];
  nresults: number | null;
  ok: boolean;
  error?: string;
};

export type AllocSnap = { size: number; addr: number; live: boolean };

export type PostInflateFingerprint = {
  thrown: string;
  unknownSlot: number | null;
  insnCount: number;
  luaInsn: number;
  p: number;
  helper: number;
  erRw: number;
  bump: number;
  live: number;
  allocCount: number;
  outputSha256: string;
  slotRle: string;
  table30R0: number | null;
};

export type PostInflateReport = {
  watchdog: number;
  insnCount: number;
  tableStubCount: number;
  wallMs: number;
  mips: number;
  thrown: string;
  unknownSlot: number | null;
  cpu: { pc: number; lr: number; r0: number; r1: number; r2: number; r3: number; r9: number; sp: number; cpsr: number };
  inflate: {
    completed: boolean;
    fnStart: number;
    lastInsidePc: number | null;
    lastInsideLr: number | null;
    lastInsideInsn: number | null;
    popSite: number;
    subsequentCaller: number | null;
  };
  gzip: {
    name: string;
    rawOffset: number;
    rawLength: number;
    inputPtr: number | null;
    magic: number[];
    isize: number | null;
  };
  output: {
    ptr: number | null;
    alloc: number | null;
    header: number | null;
    dataOff: number;
    length: number | null;
    guestSha256: string | null;
    referenceSha256: string;
    equal: boolean;
  };
  allocs: { count: number; live: number; bump: number; records: AllocSnap[] };
  hits: { total: number; table0: number; table1: number; table3: number; table9: number; table30: number };
  slotRle: string;
  armExt0: { returned: boolean; kind: string | null; r0: number | null; insnCount: number | null };
  strCom: { code: unknown; extra: unknown; ok: boolean; error?: string }[];
  lua: { resumed: boolean; insn: number; pc: number | null; calling: boolean; natives: NativeRec[] };
  graphicsCommands: number;
  table30: { r0: number; r1: number; r2: number; r3: number; lr: number; pc: number; callerFn: number } | null;
  gate: {
    packFile: GateStatus;
    directory: GateStatus;
    resourceLookup: GateStatus;
    gzipDetect: GateStatus;
    guestInflate: GateStatus;
    armExt0Return: GateStatus;
    strCom0Return: GateStatus;
    luaResume: GateStatus;
    stage5cComplete: boolean;
    recommendStage5d: boolean;
    blocker: string;
    category: BlockerCategory;
  };
  consistency: { runs: number; deterministic: boolean; mismatches: string[]; fingerprints: PostInflateFingerprint[] };
};

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16)}`;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function encodeSlotRle(slots: readonly number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < slots.length) {
    let j = i + 1;
    while (j < slots.length && slots[j] === slots[i]) j++;
    const n = j - i;
    parts.push(n === 1 ? String(slots[i]) : `${slots[i]}x${n}`);
    i = j;
  }
  return parts.join(",");
}

export function decodeSlotRle(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;
  for (const part of text.split(",")) {
    const m = /^(\d+)(?:x(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`bad rle part: ${part}`);
    const slot = Number(m[1]);
    const n = m[2] ? Number(m[2]) : 1;
    for (let i = 0; i < n; i++) out.push(slot);
  }
  return out;
}

function wrapNatives(rt: MythroadRuntime, log: NativeRec[]): void {
  const L = rt.lua.L;
  const wrap = (slot: { tag: number; num: number }, name: string) => {
    if (slot.tag !== TAG_FUNCTION) return;
    const cl = L.closures[slot.num];
    if (!cl || !cl.isC) return;
    const orig = cl.fn;
    cl.fn = (state) => {
      const preview = stackPreview(state, 8);
      try {
        const n = orig(state);
        log.push({ name, args: preview.arguments, nresults: n, ok: true });
        return n;
      } catch (e) {
        log.push({ name, args: preview.arguments, nresults: null, ok: false, error: errText(e) });
        throw e;
      }
    };
  };
  for (const name of ["_strCom", "_com", "GetSysInfo", "TestCom1", "TestCom"]) {
    wrap(L.getGlobal(name), name);
  }
}

function rawLang0(mrp: Uint8Array): { raw: Uint8Array; offset: number; isize: number | null } {
  const arc = MRPArchive.parse(mrp);
  const ent = arc.entries.find((e) => e.name === "res_lang0.rc");
  if (!ent) return { raw: new Uint8Array(), offset: 0, isize: null };
  const raw = new Uint8Array(arc.data.subarray(ent.offset, ent.offset + ent.storedLength));
  let isize: number | null = null;
  if (raw.length >= 8) {
    const n = raw.length;
    isize = (raw[n - 4]! | (raw[n - 3]! << 8) | (raw[n - 2]! << 16) | (raw[n - 1]! << 24)) >>> 0;
  }
  return { raw, offset: ent.offset, isize };
}

function referenceGunzip(raw: Uint8Array): Uint8Array | null {
  if (raw.length < 2 || raw[0] !== 0x1f || raw[1] !== 0x8b) return null;
  try {
    return new Uint8Array(gunzipSync(raw));
  } catch {
    return null;
  }
}

function inInflateFn(pc: number): boolean {
  const p = pc >>> 0;
  return p >= POST_INFLATE.inflateFn && p <= POST_INFLATE.inflatePop + 2;
}

function inTableStub(pc: number): boolean {
  const p = pc >>> 0;
  return p >= EXT_TABLE_ADDR && p < EXT_TABLE_ADDR + EXT_TABLE_COUNT * 4;
}

type OneRun = {
  watchdog: number;
  insnCount: number;
  tableStubCount: number;
  wallMs: number;
  thrown: string;
  unknownSlot: number | null;
  cpu: PostInflateReport["cpu"];
  lastInside: { pc: number; lr: number; insn: number } | null;
  gzipIn: number | null;
  outBuf: number | null;
  outAlloc: number | null;
  header: number | null;
  guestSha256: string | null;
  equal: boolean;
  referenceSha256: string;
  allocs: PostInflateReport["allocs"];
  hits: PostInflateReport["hits"];
  slots: number[];
  slotRle: string;
  armExt0: PostInflateReport["armExt0"];
  strCom: PostInflateReport["strCom"];
  lua: PostInflateReport["lua"];
  graphicsCommands: number;
  table30: PostInflateReport["table30"];
  p: number;
  helper: number;
  erRw: number;
};

function runOnce(mrp: Uint8Array, raw: Uint8Array, reference: Uint8Array | null, budget: number): OneRun {
  const natives: NativeRec[] = [];
  const graphics = new NullGraphicsBackend();
  const rt = new MythroadRuntime({
    graphics,
    trace: new RuntimeTrace(),
    abiMode: "strict",
    armInstructionBudget: budget,
  });
  wrapNatives(rt, natives);

  const slots: number[] = [];
  let table9Seen = 0;
  let lastInside: { pc: number; lr: number; insn: number } | null = null;
  let gzipIn: number | null = null;
  let outBuf: number | null = null;
  let outAlloc: number | null = null;
  let table30: OneRun["table30"] = null;
  let lastTableCpu: OneRun["cpu"] | null = null;
  const extCalls: { code: number; ok: boolean; kind: string | null; r0: number | null; insnCount: number | null }[] = [];

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;
    e.insnBudget = budget;

    const prevFetch = e.cpu.onBeforeFetch;
    e.cpu.onBeforeFetch = (c) => {
      const pc = c.r[15] >>> 0;
      if (table9Seen >= 2 && inInflateFn(pc) && !inTableStub(pc)) {
        lastInside = { pc, lr: c.r[14] >>> 0, insn: e.cpu.insnCount | 0 };
      }
      return prevFetch ? prevFetch(c) : false;
    };

    const origCall = e.arm_ext_call.bind(e);
    e.arm_ext_call = (code, input, inputAddr, inputLen) => {
      try {
        const out = origCall(code, input, inputAddr, inputLen);
        extCalls.push({
          code,
          ok: out.kind === ExtStopKind.Return,
          kind: out.kind,
          r0: out.r0 | 0,
          insnCount: out.insnCount | 0,
        });
        return out;
      } catch (err) {
        extCalls.push({
          code,
          ok: false,
          kind: null,
          r0: null,
          insnCount: e.cpu.insnCount | 0,
        });
        throw err;
      }
    };

    const origD = e.table.dispatch.bind(e.table);
    e.table.dispatch = (c, mem, pc) => {
      const n = tableSlotIndex(pc);
      lastTableCpu = {
        pc: pc >>> 0,
        lr: c.r[14] >>> 0,
        r0: c.r[0] >>> 0,
        r1: c.r[1] >>> 0,
        r2: c.r[2] >>> 0,
        r3: c.r[3] >>> 0,
        r9: c.r[9] >>> 0,
        sp: c.r[13] >>> 0,
        cpsr: e.cpu.cpsr >>> 0,
      };
      slots.push(n);
      const r0 = c.r[0] >>> 0;
      const r1 = c.r[1] >>> 0;
      const r2 = c.r[2] >>> 0;
      const r3 = c.r[3] >>> 0;
      const lr = c.r[14] >>> 0;
      if (n === 9) table9Seen++;
      if (n === 44 && raw.length && r2 === raw.length) gzipIn = r1;
      if (n === 30) {
        table30 = {
          r0,
          r1,
          r2,
          r3,
          lr,
          pc: pc >>> 0,
          callerFn: findThumbFnStart(mem, lr),
        };
      }
      const req = n === 0 ? r0 : 0;
      origD(c, mem, pc);
      if (n === 0 && table9Seen >= 2 && (req === POST_INFLATE.outAlloc || (reference && req === reference.length + 4))) {
        outBuf = c.r[0] >>> 0;
        outAlloc = req;
      }
    };
  };

  const t0 = performance.now();
  let thrown = "";
  let unknownSlot: number | null = null;
  try {
    rt.loadMrp(mrp);
    rt.start("start.mr");
  } catch (e) {
    thrown = errText(e);
    unknownSlot = unknownTableSlot(e) ?? rt.unknownRequiredSlot;
  }
  const wallMs = performance.now() - t0;
  const e = rt.ext;
  const leftover = e
    ? {
        pc: e.cpu.r[15] >>> 0,
        lr: e.cpu.r[14] >>> 0,
        r0: e.cpu.r[0] >>> 0,
        r1: e.cpu.r[1] >>> 0,
        r2: e.cpu.r[2] >>> 0,
        r3: e.cpu.r[3] >>> 0,
        r9: e.cpu.r[9] >>> 0,
        sp: e.cpu.r[13] >>> 0,
        cpsr: e.cpu.cpsr >>> 0,
      }
    : { pc: 0, lr: 0, r0: 0, r1: 0, r2: 0, r3: 0, r9: 0, sp: 0, cpsr: 0 };
  const cpu = thrown === "" ? lastTableCpu ?? leftover : leftover;

  if (outBuf === null) {
    const guessed = rt.mrAllocs.find((a) => a.size === POST_INFLATE.outAlloc);
    if (guessed) {
      outBuf = guessed.guestAddr >>> 0;
      outAlloc = guessed.size;
    }
  }

  let header: number | null = null;
  let guestSha256: string | null = null;
  let equal = false;
  const referenceSha256 = reference ? sha256(reference) : "";
  if (e && outBuf !== null && reference) {
    header = e.mem.read32(outBuf) >>> 0;
    const off = header === reference.length ? 4 : 0;
    const guest = e.mem.slice((outBuf + off) >>> 0, reference.length);
    guestSha256 = sha256(guest);
    equal = guestSha256 === referenceSha256 && guest.length === reference.length;
  }

  const code0 = extCalls.find((c) => c.code === 0);
  const strCom = natives
    .filter((n) => n.name === "_strCom")
    .map((n) => ({
      code: Array.isArray(n.args) ? n.args[0] : undefined,
      extra: Array.isArray(n.args) ? n.args[2] : undefined,
      ok: n.ok,
      error: n.error,
    }));
  const ci = rt.lua.L.ci[rt.lua.L.ci.length - 1];
  const counts = new Map<number, number>();
  for (const s of slots) counts.set(s, (counts.get(s) ?? 0) + 1);

  return {
    watchdog: budget,
    insnCount: e?.cpu.insnCount ?? 0,
    tableStubCount: slots.length,
    wallMs,
    thrown,
    unknownSlot,
    cpu,
    lastInside,
    gzipIn,
    outBuf,
    outAlloc,
    header,
    guestSha256,
    equal,
    referenceSha256,
    allocs: {
      count: rt.mrAllocs.length,
      live: rt.mrTable?.liveAllocs().length ?? 0,
      bump: e?.heapTop ?? 0,
      records: rt.mrAllocs.map((a) => ({ size: a.size, addr: a.guestAddr >>> 0, live: a.live })),
    },
    hits: {
      total: slots.length,
      table0: counts.get(0) ?? 0,
      table1: counts.get(1) ?? 0,
      table3: counts.get(3) ?? 0,
      table9: counts.get(9) ?? 0,
      table30: counts.get(30) ?? 0,
    },
    slots,
    slotRle: encodeSlotRle(slots),
    armExt0: {
      returned: code0?.ok === true,
      kind: code0?.kind ?? null,
      r0: code0?.r0 ?? null,
      insnCount: code0?.insnCount ?? null,
    },
    strCom,
    lua: {
      resumed: thrown === "",
      insn: rt.lua.L.insnCount | 0,
      pc: ci ? ci.pc | 0 : null,
      calling: ci?.calling === true,
      natives,
    },
    graphicsCommands: graphics.commands.length,
    table30,
    p: e ? e.owners.wrapper.p >>> 0 : 0,
    helper: e ? e.owners.wrapper.helper >>> 0 : 0,
    erRw: e ? e.mem.read32((e.owners.wrapper.p + AEX_P_ER_RW_OFF) >>> 0) >>> 0 : 0,
  };
}

function fingerprintOf(run: OneRun): PostInflateFingerprint {
  return {
    thrown: run.thrown,
    unknownSlot: run.unknownSlot,
    insnCount: run.insnCount,
    luaInsn: run.lua.insn,
    p: run.p,
    helper: run.helper,
    erRw: run.erRw,
    bump: run.allocs.bump,
    live: run.allocs.live,
    allocCount: run.allocs.count,
    outputSha256: run.guestSha256 ?? "",
    slotRle: run.slotRle,
    table30R0: run.table30?.r0 ?? null,
  };
}

function fpKey(f: PostInflateFingerprint): string {
  return JSON.stringify(f);
}

export function runPostInflateStartup(
  mrp: Uint8Array,
  opts: { budget?: number; consistencyRuns?: number } = {},
): PostInflateReport {
  const budget = opts.budget ?? DEFAULT_INSN_BUDGET;
  const nRuns = Math.max(1, opts.consistencyRuns ?? 1);
  const { raw, offset, isize } = rawLang0(mrp);
  const reference = referenceGunzip(raw);
  const runs: OneRun[] = [];
  for (let i = 0; i < nRuns; i++) runs.push(runOnce(mrp, raw, reference, budget));
  const run = runs[0]!;
  const fps = runs.map(fingerprintOf);
  const mismatches: string[] = [];
  const first = fpKey(fps[0]!);
  for (let i = 1; i < fps.length; i++) {
    if (fpKey(fps[i]!) !== first) mismatches.push(`run ${i + 1}`);
  }

  const inflateCompleted =
    run.equal &&
    run.lastInside !== null &&
    run.lastInside.pc >= POST_INFLATE.inflatePop - 4 &&
    run.lastInside.pc <= POST_INFLATE.inflatePop + 2 &&
    run.table30 !== null &&
    !inInflateFn(run.table30.lr);

  const strCom0 = [...run.strCom].reverse().find((s) => s.code === 801 && s.extra === 0);
  const gate = {
    packFile: "PASS" as GateStatus,
    directory: "PASS" as GateStatus,
    resourceLookup: "PASS" as GateStatus,
    gzipDetect: run.hits.table9 >= 2 ? ("PASS" as GateStatus) : ("BLOCKED" as GateStatus),
    guestInflate: inflateCompleted ? ("PASS" as GateStatus) : run.thrown === ARM_INSN_BUDGET_THROWN ? ("BLOCKED" as GateStatus) : ("NOT REACHED" as GateStatus),
    armExt0Return: run.armExt0.returned ? ("PASS" as GateStatus) : ("BLOCKED" as GateStatus),
    strCom0Return: strCom0?.ok === true ? ("PASS" as GateStatus) : ("BLOCKED" as GateStatus),
    luaResume: run.lua.resumed ? ("PASS" as GateStatus) : ("NOT REACHED" as GateStatus),
    stage5cComplete: false,
    recommendStage5d: false,
    blocker: run.unknownSlot === 80
      ? "table[80] mr_getScreenInfo"
      : run.unknownSlot === 32
      ? "table[32] mr_timerStop"
      : run.thrown.includes("gssjxz")
      ? 'mr_open("gssjxz\\\\69") EFS'
      : run.thrown.includes("mr_plat code 1205")
      ? "mr_plat(1205) MR_CHECK_TOUCH"
      : run.unknownSlot === 122
      ? "table[122] DrawRect"
      : run.thrown.includes("mr_platEx code 1204") || run.thrown.includes("SWITCHPATH")
      ? "mr_platEx(1204) MR_SWITCHPATH"
      : run.unknownSlot === 35
      ? "table[35] mr_getUserInfo"
      : run.unknownSlot === 49
        ? "table[49] mr_mkDir"
        : run.unknownSlot === 42
          ? "table[42] mr_info"
          : run.unknownSlot === 30
            ? "table[30] mr_getCharBitmap"
            : run.thrown || "(none)",
    category: POST_INFLATE.blockerCategory,
  };
  if (
    gate.packFile === "PASS" &&
    gate.directory === "PASS" &&
    gate.resourceLookup === "PASS" &&
    gate.gzipDetect === "PASS" &&
    gate.guestInflate === "PASS" &&
    gate.armExt0Return === "PASS" &&
    gate.strCom0Return === "PASS" &&
    gate.luaResume === "PASS"
  ) {
    gate.stage5cComplete = true;
    gate.recommendStage5d = true;
  }

  return {
    watchdog: run.watchdog,
    insnCount: run.insnCount,
    tableStubCount: run.tableStubCount,
    wallMs: run.wallMs,
    mips: run.wallMs > 0 ? run.insnCount / run.wallMs / 1000 : 0,
    thrown: run.thrown,
    unknownSlot: run.unknownSlot,
    cpu: run.cpu,
    inflate: {
      completed: inflateCompleted,
      fnStart: POST_INFLATE.inflateFn,
      lastInsidePc: run.lastInside?.pc ?? null,
      lastInsideLr: run.lastInside?.lr ?? null,
      lastInsideInsn: run.lastInside?.insn ?? null,
      popSite: POST_INFLATE.inflatePop,
      subsequentCaller: run.table30?.lr ?? null,
    },
    gzip: {
      name: "res_lang0.rc",
      rawOffset: offset,
      rawLength: raw.length,
      inputPtr: run.gzipIn,
      magic: raw.length >= 2 ? [raw[0]!, raw[1]!] : [],
      isize,
    },
    output: {
      ptr: run.outBuf,
      alloc: run.outAlloc,
      header: run.header,
      dataOff: run.header === (reference?.length ?? -1) ? 4 : 0,
      length: reference?.length ?? null,
      guestSha256: run.guestSha256,
      referenceSha256: run.referenceSha256,
      equal: run.equal,
    },
    allocs: run.allocs,
    hits: run.hits,
    slotRle: run.slotRle,
    armExt0: run.armExt0,
    strCom: run.strCom,
    lua: run.lua,
    graphicsCommands: run.graphicsCommands,
    table30: run.table30,
    gate,
    consistency: {
      runs: nRuns,
      deterministic: mismatches.length === 0,
      mismatches,
      fingerprints: fps,
    },
  };
}

export function renderPostInflateMarkdown(r: PostInflateReport): string {
  const lines = [
    "# Real MRP Post-Inflate Continuation (Stage 5-C.10R)",
    "",
    "Production path. No forensic bypass. Host gunzip is verification-only.",
    "Stage 5-D: **NOT STARTED**.",
    "",
    `watchdog: ${r.watchdog}`,
    `insn: ${r.insnCount}  stubs: ${r.tableStubCount}  wall: ${r.wallMs.toFixed(1)}ms  ~${r.mips.toFixed(2)} MIPS`,
    `thrown: ${r.thrown}`,
    `arm_ext_call(0) returned=${r.armExt0.returned} kind=${r.armExt0.kind}`,
    `Lua resumed=${r.lua.resumed} insn=${r.lua.insn}`,
    "",
    "## Inflate",
    `completed: ${r.inflate.completed ? "yes" : "no"}`,
    `fn ${hx(r.inflate.fnStart)} POP ${hx(r.inflate.popSite)} lastInside=${r.inflate.lastInsidePc !== null ? hx(r.inflate.lastInsidePc) : "null"} insn=${r.inflate.lastInsideInsn}`,
    `subsequent caller LR=${r.inflate.subsequentCaller !== null ? hx(r.inflate.subsequentCaller) : "null"}`,
    "",
    "## Output",
    `raw ${r.gzip.name} @ ${hx(r.gzip.rawOffset)} len=${r.gzip.rawLength} in=${r.gzip.inputPtr !== null ? hx(r.gzip.inputPtr) : "null"}`,
    `out ptr=${r.output.ptr !== null ? hx(r.output.ptr) : "null"} alloc=${r.output.alloc} header=${r.output.header} len=${r.output.length}`,
    `guest sha256: ${r.output.guestSha256}`,
    `oracle sha256: ${r.output.referenceSha256}`,
    `equal: ${r.output.equal}`,
    "",
    "## Sequence RLE",
    r.slotRle,
    "",
    "## Gate",
    `packFile=${r.gate.packFile} directory=${r.gate.directory} resource=${r.gate.resourceLookup} gzip=${r.gate.gzipDetect} inflate=${r.gate.guestInflate}`,
    `arm_ext_call(0)=${r.gate.armExt0Return} _strCom0=${r.gate.strCom0Return} Lua=${r.gate.luaResume}`,
    `blocker: ${r.gate.blocker}  category: ${r.gate.category}`,
    `Stage 5-C complete: ${r.gate.stage5cComplete}`,
    `recommend Stage 5-D: ${r.gate.recommendStage5d}`,
    "",
    `deterministic (${r.consistency.runs} runs): ${r.consistency.deterministic}`,
  ];
  return lines.join("\n");
}
