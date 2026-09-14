import { describe, expect, it } from "vitest";
import { copyLcdDirtyRect, ScreenBuffer } from "../../src/mythroad/graphics.ts";
import { FrameCapture } from "../../tools/real/frame-capture.ts";

describe("collection LCD capture", () => {
  it("retains the displayed scene while the guest clears its next frame", () => {
    const screen = new ScreenBuffer(2, 2);
    const display = new FrameCapture(() => screen, 2, 2);
    screen.pixels.set([1, 2, 3, 4]);
    expect([...display.pixels]).toEqual([0, 0, 0, 0]);
    display.flush();
    screen.pixels.fill(9);
    expect([...display.pixels]).toEqual([1, 2, 3, 4]);
    display.flush();
    expect([...display.pixels]).toEqual([9, 9, 9, 9]);
    expect(display.frames).toBe(2);
  });

  it("keeps LCD pixels outside a dirty present rectangle", () => {
    const screen = new ScreenBuffer(4, 4);
    const display = new FrameCapture(() => screen, 4, 4);
    screen.pixels.set([
      1, 1, 1, 1,
      2, 2, 2, 2,
      3, 3, 3, 3,
      4, 4, 4, 4,
    ]);
    display.flush(0, 0, 4, 4);
    screen.pixels.fill(9);
    display.flush(0, 0, 4, 2);
    expect([...display.pixels]).toEqual([
      9, 9, 9, 9,
      9, 9, 9, 9,
      3, 3, 3, 3,
      4, 4, 4, 4,
    ]);
  });
});

describe("copyLcdDirtyRect", () => {
  it("clips negative dirty origins without expanding the presented rectangle", () => {
    const lcd = new Uint16Array(9).fill(99);
    const src = new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    copyLcdDirtyRect(lcd, 3, 3, src, 3, 3, -1, -1, 3, 3);
    expect([...lcd]).toEqual([1, 2, 99, 4, 5, 99, 99, 99, 99]);
  });

  it("does not present rectangles entirely outside the left or top edge", () => {
    const lcd = new Uint16Array(9).fill(99);
    const src = new Uint16Array(9).fill(1);
    copyLcdDirtyRect(lcd, 3, 3, src, 3, 3, -3, 0, 2, 3);
    copyLcdDirtyRect(lcd, 3, 3, src, 3, 3, 0, -3, 3, 2);
    expect([...lcd]).toEqual(new Array(9).fill(99));
  });

  it("leaves the HUD band alone when only the playfield is presented", () => {
    const lcd = new Uint16Array(8);
    const src = new Uint16Array([1, 1, 2, 2, 9, 9, 8, 8]);
    lcd.set([7, 7, 7, 7, 5, 5, 5, 5]);
    copyLcdDirtyRect(lcd, 2, 4, src, 2, 4, 0, 0, 2, 2);
    expect([...lcd]).toEqual([1, 1, 2, 2, 5, 5, 5, 5]);
  });

  it("keeps LCD after a host snapshot, as if the canvas copy were transferred", () => {
    const lcd = new Uint16Array([1, 2, 3, 4]);
    const sent = lcd.slice();
    expect([...sent]).toEqual([1, 2, 3, 4]);
    const src = new Uint16Array([9, 9, 0, 0]);
    copyLcdDirtyRect(lcd, 2, 2, src, 2, 2, 0, 0, 2, 1);
    expect([...lcd]).toEqual([9, 9, 3, 4]);
  });
  it("writes a later HUD flush without touching the playfield", () => {
    const lcd = new Uint16Array([1, 1, 2, 2, 0, 0, 0, 0]);
    const src = new Uint16Array([9, 9, 9, 9, 3, 3, 4, 4]);
    copyLcdDirtyRect(lcd, 2, 4, src, 2, 4, 0, 2, 2, 2);
    expect([...lcd]).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
