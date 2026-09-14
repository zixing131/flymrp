import { describe, expect, it } from "vitest";
import { EXT_STOP_ADDR, stackTop, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { MR_SUCCESS } from "../../src/mythroad/constants.ts";
import { makeRgb565, MrTableBridge } from "../../src/mythroad/index.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";
import { FrameCapture } from "../../tools/real/frame-capture.ts";

function wire() {
  const ext = new ExtRuntime();
  const flushed: number[][] = [];
  const bridge = new MrTableBridge(ext, new MythroadVfs(), "test", {
    onFlush: (x, y, w, h) => flushed.push([x, y, w, h]),
  });
  bridge.install();
  return { ext, bridge, flushed };
}

function call29(ext: ExtRuntime, bmp: number, x: number, y: number, w: number, h: number) {
  const sp = (stackTop() - 16) >>> 0;
  ext.mem.write32(sp, h >>> 0);
  return ext.runGuest(tableSlotAddr(29), {
    r0: bmp,
    r1: x,
    r2: y,
    r3: w,
    sp,
    lr: EXT_STOP_ADDR,
  });
}

describe("table[29] mr_drawBitmap ABI", () => {
  it("NULL bmp presents the host screen cache", () => {
    const { ext, flushed } = wire();
    const out = call29(ext, 0, 0, 0, 240, 320);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(MR_SUCCESS);
    expect(flushed).toEqual([[0, 0, 240, 320]]);
  });

  it("non-NULL guest RGB565 is copied then presented", () => {
    const { ext, bridge, flushed } = wire();
    const bmp = ext.alloc(4);
    const red = makeRgb565(255, 0, 0);
    ext.mem.write16(bmp, red);
    ext.mem.write16((bmp + 2) >>> 0, red);
    const out = call29(ext, bmp, 1, 2, 2, 1);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(bridge.screen.pixels[2 * 240 + 1]).toBe(red);
    expect(bridge.screen.pixels[2 * 240 + 2]).toBe(red);
    expect(flushed).toEqual([[1, 2, 2, 1]]);
  });

  it("playfield dirty present keeps previously flushed HUD chrome", () => {
    const ext = new ExtRuntime();
    const flushed: number[][] = [];
    let bridge: MrTableBridge;
    const display = new FrameCapture(() => bridge.screen, 240, 320);
    bridge = new MrTableBridge(ext, new MythroadVfs(), "hud", {
      onFlush: (x, y, w, h) => {
        flushed.push([x, y, w, h]);
        display.flush(x, y, w, h);
      },
    });
    bridge.install();
    bridge.screen.pixels.fill(0x07e0);
    expect(call29(ext, 0, 0, 256, 240, 64).r0).toBe(MR_SUCCESS);
    bridge.screen.pixels.fill(0xf800);
    expect(call29(ext, 0, 0, 0, 240, 256).r0).toBe(MR_SUCCESS);
    expect(display.pixels[255 * 240]).toBe(0xf800);
    expect(display.pixels[256 * 240]).toBe(0x07e0);
    expect(display.pixels[319 * 240]).toBe(0x07e0);
    expect(flushed).toEqual([[0, 256, 240, 64], [0, 0, 240, 256]]);
  });

  it("clips a bitmap crossing all four LCD edges without dropping its last row or column", () => {
    const { ext, bridge } = wire();
    const w = 242, h = 322, bmp = ext.alloc(w * h * 2);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) ext.mem.write16(bmp + (row * w + col) * 2, (row * w + col) & 0xffff);
    }
    const out = call29(ext, bmp, -1, -1, w, h);
    expect(out.kind).toBe(ExtStopKind.Return);
    for (let row = 0; row < 320; row++) {
      for (let col = 0; col < 240; col++) {
        expect(bridge.screen.pixels[row * 240 + col]).toBe(((row + 1) * w + col + 1) & 0xffff);
      }
    }
  });
});
