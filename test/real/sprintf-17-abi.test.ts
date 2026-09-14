import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXT_STOP_ADDR, stackTop, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { UnknownAbiError } from "../../src/err/errors.ts";
import { MemoryFault } from "../../src/hot/memory.ts";
import {
  MrTableBridge,
  aapcsSprintfVararg,
  guestSprintf,
  readGuestCString,
} from "../../src/mythroad/index.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";

/**
 * This is the observed guest sprintf_ subset: literal bytes + `%d` (int32).
 * Not libc sprintf. Not a host va_list.
 */

function wire(): { ext: ExtRuntime; bridge: MrTableBridge } {
  const ext = new ExtRuntime();
  const bridge = new MrTableBridge(ext, new MythroadVfs(), "test");
  bridge.install();
  return { ext, bridge };
}

function writeCString(ext: ExtRuntime, addr: number, s: string): void {
  for (let i = 0; i < s.length; i++) ext.mem.write8((addr + i) >>> 0, s.charCodeAt(i));
  ext.mem.write8((addr + s.length) >>> 0, 0);
}

function guestBytes(ext: ExtRuntime, addr: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(ext.mem.read8((addr + i) >>> 0));
  return out;
}

function call17(
  ext: ExtRuntime,
  r0: number,
  r1: number,
  r2: number,
  r3 = 0,
  stack0 = 0,
  stack4 = 0,
) {
  const sp = (stackTop() - 16) >>> 0;
  ext.mem.write32(sp, stack0 >>> 0);
  ext.mem.write32((sp + 4) >>> 0, stack4 >>> 0);
  return ext.runGuest(tableSlotAddr(17), { r0, r1, r2, r3, sp, lr: EXT_STOP_ADDR });
}

describe("5-C.10G table[17] sprintf_ literal+%d ABI", () => {
  it("reads stack varargs beyond the first four AAPCS words", () => {
    const ext = new ExtRuntime();
    const bridge = new MrTableBridge(ext, new MythroadVfs(), "test");
    bridge.install();
    const dst = ext.alloc(32), fmt = ext.alloc(32), sp = ext.cpu.r[13] >>> 0;
    ext.mem.load(fmt, new TextEncoder().encode("%d %d %d %d %d %d %d\0"));
    ext.mem.write32(sp + 16, 55);
    const args = new Uint32Array([dst, fmt, 1, 2, 3, 4, 5, 6]);
    bridge.sprintf(ext.mem, args, sp);
    expect(new TextDecoder().decode(ext.mem.slice(dst, 20)).replace(/\0.*$/, "")).toBe("1 2 3 4 5 6 55");
  });
  it("formats literals and %d into GuestMemory with NUL, returns length excluding NUL", () => {
    const { ext } = wire();
    const buf = ext.alloc(32);
    const fmt = ext.alloc(32);
    const cases: [string, number, string][] = [
      ["abc", 0, "abc"],
      ["%d", 0, "0"],
      ["%d", 0xffffffff, "-1"],
      ["x%d", 42, "x42"],
      ["res_lang%d.rc", 0, "res_lang0.rc"],
      ["%ld %%", 100, "100 %"],
      ["%lu", 0xffffffff, "4294967295"],
      ["%08lx", 0xabc, "00000abc"],
      ["%ld", 0x80000000, "-2147483648"],
    ];
    for (const [format, arg, want] of cases) {
      writeCString(ext, fmt, format);
      ext.mem.fill(buf, 0xaa, 32);
      const out = call17(ext, buf, fmt, arg, 0xdeadbeef);
      expect(out.kind).toBe(ExtStopKind.Return);
      expect(out.r0).toBe(want.length);
      expect(readGuestCString(ext.mem, buf, 64)).toBe(want);
      expect(ext.mem.read8((buf + want.length) >>> 0)).toBe(0);
    }
  });

  it("%d is int32, not uint32", () => {
    const { ext } = wire();
    const buf = ext.alloc(24);
    const fmt = ext.alloc(8);
    writeCString(ext, fmt, "%d");
    const cases: [number, string][] = [
      [0, "0"],
      [1, "1"],
      [0xffffffff, "-1"],
      [0x7fffffff, "2147483647"],
      [0x80000000, "-2147483648"],
    ];
    for (const [arg, want] of cases) {
      ext.mem.fill(buf, 0, 24);
      const out = call17(ext, buf, fmt, arg, 0xdeadbeef);
      expect(out.r0).toBe(want.length);
      expect(readGuestCString(ext.mem, buf, 64)).toBe(want);
    }
  });

  it("one %d reads R2 and does not consume poison R3", () => {
    const { ext } = wire();
    const buf = ext.alloc(16);
    const fmt = ext.alloc(8);
    writeCString(ext, fmt, "%d");
    const out = call17(ext, buf, fmt, 7, 0xdeadbeef, 0xcafebabe, 0xbadf00d);
    expect(out.r0).toBe(1);
    expect(readGuestCString(ext.mem, buf)).toBe("7");
    const args = new Uint32Array([buf, fmt, 7, 0xdeadbeef, 0xcafebabe, 0xbadf00d, 0, 0]);
    expect(aapcsSprintfVararg(args, 0)).toBe(7);
    expect(aapcsSprintfVararg(args, 1)).toBe(0xdeadbeef);
  });

  it("unsupported specifiers throw UnknownAbiError", () => {
    const { ext } = wire();
    const buf = ext.alloc(16);
    const fmt = ext.alloc(16);
    const bad = ["%q", "%n", "%ls", "%*d", "%", "%9999d"];
    for (const format of bad) {
      writeCString(ext, fmt, format);
      expect(() => call17(ext, buf, fmt, 0, 0)).toThrow(UnknownAbiError);
      try {
        call17(ext, buf, fmt, 0, 0);
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownAbiError);
        const u = e as UnknownAbiError;
        expect(u.family).toBe("sprintf_");
        expect(u.message.startsWith("unsupported sprintf format")).toBe(true);
      }
    }
  });

  it("formats pointers with the legacy 0x hexadecimal form", () => {
    const { ext } = wire();
    const buf = ext.alloc(32);
    const fmt = ext.alloc(8);
    writeCString(ext, fmt, "%p");
    const out = call17(ext, buf, fmt, 0x1234, 0);
    expect(out.r0).toBe(6);
    expect(readGuestCString(ext.mem, buf)).toBe("0x1234");
  });

  it("unmapped buffer / format is MemoryFault on GuestMemory", () => {
    const { ext, bridge } = wire();
    const fmt = ext.alloc(8);
    writeCString(ext, fmt, "ab");
    const unmapped = 0x30000000;
    const args = new Uint32Array(8);
    args[0] = unmapped;
    args[1] = fmt;
    args[2] = 0;
    expect(() => bridge.sprintf(ext.mem, args)).toThrow(MemoryFault);
    const buf = ext.alloc(8);
    args[0] = buf;
    args[1] = unmapped;
    expect(() => bridge.sprintf(ext.mem, args)).toThrow(MemoryFault);
    const viaGuest = call17(ext, unmapped, fmt, 0);
    expect(viaGuest.kind).toBe(ExtStopKind.Unmapped);
  });

  it("cross-region write faults through GuestMemory", () => {
    const { ext } = wire();
    const fmt = ext.alloc(8);
    writeCString(ext, fmt, "abcd");
    expect(() => guestSprintf(ext.mem, 0x0200fffe, fmt, () => 0)).toThrow(MemoryFault);
  });

  it("direct guestSprintf matches mpaland length-excluding-NUL", () => {
    const { ext } = wire();
    const buf = ext.alloc(16);
    const fmt = ext.alloc(16);
    writeCString(ext, fmt, "res_lang%d.rc");
    const n = guestSprintf(ext.mem, buf, fmt, () => 0);
    expect(n).toBe("res_lang0.rc".length);
    expect(guestBytes(ext, buf, 13)).toEqual([
      ...[..."res_lang0.rc"].map((c) => c.charCodeAt(0)),
      0,
    ]);
  });

  it("unterminated format is UnknownAbiError", () => {
    const { ext } = wire();
    const buf = ext.alloc(8);
    const fmt = ext.alloc(4096);
    ext.mem.fill(fmt, 0x41, 4096);
    expect(() => guestSprintf(ext.mem, buf, fmt, () => 0)).toThrow(UnknownAbiError);
  });

  it("registers table[17]; source does not call host formatters", () => {
    const { ext } = wire();
    expect(!!ext.table.handlers[17]).toBe(true);
    const src = readFileSync(resolve(import.meta.dirname, "../../src/mythroad/sprintf.ts"), "utf8");
    expect(src).not.toMatch(/util\.format/);
    expect(src).not.toMatch(/sprintf-js/);
    expect(src).not.toMatch(/from ["']printf["']/);
  });
});

it('formats long URLs, integer precision and aligned AAPCS doubles', () => {
  const {ext}=wire(), fmt=ext.alloc(1024), buf=ext.alloc(2048);
  writeCString(ext,fmt,'x'.repeat(300)+'%m%.4d %.2f');
  const double=new DataView(new ArrayBuffer(8));double.setFloat64(0,12.375,true);
  const values=[7,0xdeadbeef,double.getUint32(0,true),double.getUint32(4,true)];
  const n=guestSprintf(ext.mem,buf,fmt,i=>values[i]);
  expect(readGuestCString(ext.mem,buf,2048)).toBe('x'.repeat(300)+'m0007 12.38');
  expect(n).toBe(311);
});
