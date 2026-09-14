import { describe, expect, it } from "vitest";
import { playerHeapSize, clockSlices, gamePrefKey, gameStem, prefKey, rotatedDirection, rotatedTilt, screenPoint } from "../../web/player-options.ts";
describe("player rotation and speed", () => {
  it("maps all four rotated display corners back to guest coordinates", () => {
    expect(screenPoint(0, 0, 240, 320, 0)).toEqual([0, 0]);
    expect(screenPoint(0, 0, 240, 320, 1)).toEqual([0, 319]);
    expect(screenPoint(0, 0, 240, 320, 2)).toEqual([239, 319]);
    expect(screenPoint(0, 0, 240, 320, 3)).toEqual([239, 0]);
    expect(screenPoint(.25, .75, 240, 320, 1)).toEqual([180, 240]);
    expect(screenPoint(-1, 2, 240, 320, 3)).toEqual([0, 0]);
  });
  it("rotates tilt axes with the same clockwise screen turns as the keypad", () => {
    expect(rotatedTilt(10, 0, 0)).toEqual([10, 0]);
    expect(rotatedTilt(10, 0, 1)).toEqual([0, -10]);
    expect(rotatedTilt(10, 0, 2)).toEqual([-10, 0]);
    expect(rotatedTilt(10, 0, 3)).toEqual([0, 10]);
  });
  it("keeps physical directions aligned with the rotated image without rotating number keys", () => {
    expect(rotatedDirection("UP", 1)).toBe("LEFT");
    expect(rotatedDirection("RIGHT", 3)).toBe("DOWN");
    expect(rotatedDirection("UP", 2)).toBe("DOWN");
    expect(rotatedDirection("5", 1)).toBe("5");
  });
  it("scales guest time in bounded steps and avoids catching up an entire hidden-tab interval", () => {
    expect(clockSlices(16, 4)).toEqual([20, 20, 20, 4]);
    expect(clockSlices(16, .5)).toEqual([8]);
    expect(clockSlices(5000, 4).reduce((a, b) => a + b, 0)).toBe(400);
    expect(clockSlices(-1, 2)).toEqual([]);
  });
  it("keeps global and per-game preference keys stable for Chinese MRP names", () => {
    expect(prefKey("zoom")).toBe("flymrp.zoom");
    expect(gameStem("games/扫雷.mrp")).toBe("扫雷");
    expect(gamePrefKey("games/Mine.MRP", "speed")).toBe("flymrp.game.mine.speed");
  });
});

it("bounds stored memory choices and retains the default for invalid values", () => {
  expect(playerHeapSize("512")).toBe(512 * 1024);
  for (const value of [null, "", "NaN", "-1", "512.5", "999999"]) expect(playerHeapSize(value)).toBe(8 * 1024 * 1024);
});
