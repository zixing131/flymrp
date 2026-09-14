import { describe, expect, it } from "vitest";
import { LuaRuntimeError } from "../../src/err/errors.ts";
import { CREATE_ABC, CREATE_ABx, OP_CALL, OP_GETGLOBAL, OP_LOADK, proto } from "../../src/lua/index.ts";
import { buildMrp } from "../../src/mrp/index.ts";
import { MythroadRuntime, NullGraphicsBackend } from "../../src/mythroad/index.ts";
import { kn, ks } from "../helpers/lua.ts";
import { ScreenBuffer } from '../../src/mythroad/graphics.ts';
import { gb16Glyph } from '../../src/mythroad/font.ts';

function gfx(): { rt: MythroadRuntime; g: NullGraphicsBackend } {
  const g = new NullGraphicsBackend();
  const rt = new MythroadRuntime({ graphics: g });
  rt.state = 1;
  rt.bi = 1;
  return { rt, g };
}

function callName(rt: MythroadRuntime, name: string, args: (number | string)[]): void {
  const k = [ks(name), ...args.map(n => typeof n === 'string' ? ks(n) : kn(n))];
  const code = [CREATE_ABx(OP_GETGLOBAL, 0, 0)];
  for (let i = 0; i < args.length; i++) code.push(CREATE_ABx(OP_LOADK, i + 1, i + 1));
  code.push(CREATE_ABC(OP_CALL, 0, args.length + 1, 1));
  rt.lua.runCold(proto({ maxstack: args.length + 3, k, code }));
}

describe("5-C graphics command recording", () => {
  it('decodes Lua text as GBK or UCS-2BE instead of drawing each source byte', () => {
    for (const [text, unicode] of [['\xd6\xd0', 0], ['\x4e\x2d', 1]] as const) {
      const { rt } = gfx(), expected = new ScreenBuffer(240, 320), glyph = gb16Glyph(0x4e2d);
      expected.drawGlyph(2, 3, glyph.width, glyph.height, glyph.bits, 255, 255, 255);
      callName(rt, '_drawText', [text, 2, 3, 255, 255, 255, unicode]);
      expect(rt.screen.pixels).toEqual(expected.pixels);
    }
  });
  it('draws loaded RGB565 crops and preserves equal-sized BitmapNew storage', () => {
    const { rt } = gfx();
    rt.loadMrp(buildMrp([{ name: 'atlas', data: new Uint8Array([0, 0, 0, 248, 224, 7, 31, 0, 255, 255, 0, 0]) }]));
    callName(rt, 'BitmapLoad', [0, 'atlas', 1, 0, 2, 2, 3]);
    expect([...rt.bitmaps[0]!.pixels!]).toEqual([0xf800, 0x07e0, 0xffff, 0]);
    callName(rt, 'BitmapShow', [0, 10, 20]);
    expect([...rt.screen.pixels.slice(20 * 240 + 10, 20 * 240 + 12)]).toEqual([0xf800, 0x07e0]);
    const pixels = rt.bitmaps[0]!.pixels;
    callName(rt, 'BitmapNew', [0, 1, 4]);
    expect(rt.bitmaps[0]!.pixels).toBe(pixels);
    callName(rt, 'BitmapNew', [0, 1, 2]);
    expect([...rt.bitmaps[0]!.pixels!]).toEqual([0, 0]);
  });

  it('renders sprite frames and tile cells, including the empty-cell sentinel', () => {
    const { rt } = gfx();
    rt.bitmaps[0] = { w: 2, h: 4, loaded: true, name: '', pixels: new Uint16Array([0, 0, 0, 0, 0xf800, 0x07e0, 0x001f, 0xffff]) };
    callName(rt, 'SpriteSet', [0, 2]);
    callName(rt, 'SpriteDraw', [0, 1, 4, 4]);
    expect(rt.screen.pixels[4 * 240 + 4]).toBe(0xf800);
    expect(rt.screen.pixels[5 * 240 + 5]).toBe(0xffff);
    callName(rt, 'TileSet', [0, 10, 10, 2, 1, 2]);
    callName(rt, 'SetTile', [0, 0, 0, 1]);
    callName(rt, 'SetTile', [0, 1, 0, 1023]);
    callName(rt, 'TileDraw', [0]);
    expect(rt.screen.pixels[10 * 240 + 10]).toBe(0xf800);
    expect(rt.screen.pixels[11 * 240 + 11]).toBe(0xffff);
    expect(rt.screen.pixels[10 * 240 + 12]).toBe(0);
    callName(rt, 'TileShift', [0, 2]);
    expect(rt.tiles[0]!.cells![0]).toBe(1023);
    expect(() => callName(rt, 'SetTile', [0, 3, 0, 1])).toThrow('Tile cell out of bounds');
  });

  it('retains the native map allocation padding without shifting it into visible cells', () => {
    const { rt } = gfx();
    callName(rt, 'TileSet', [0, 0, 0, 11, 22, 1]);
    expect(rt.tiles[0]!.cells!.byteLength).toBe(488);
    callName(rt, 'SetTile', [0, 11, 21, 1234]);
    expect(rt.tiles[0]!.cells![242]).toBe(1234);
    const cells = rt.tiles[0]!.cells;
    callName(rt, 'TileSet', [0, 0, 0, 11, 22, 1]);
    expect(rt.tiles[0]!.cells).toBe(cells);
    callName(rt, 'TileShift', [0, 0]);
    expect(rt.tiles[0]!.cells![231]).toBe(0);
    expect(rt.tiles[0]!.cells![242]).toBe(1234);
    expect(() => callName(rt, 'SetTile', [0, 2, 22, 9])).toThrow('Tile cell out of bounds');
    expect(() => callName(rt, 'SetTile', [0, 12, 0, 9])).toThrow('Tile cell out of bounds');
  });

  it('copies a bitmap through the 8.8 affine transform into a drawable destination', () => {
    const { rt } = gfx();
    rt.bitmaps[1] = { w: 2, h: 2, loaded: true, name: '', pixels: new Uint16Array([1, 2, 3, 4]) };
    callName(rt, 'BitmapNew', [0, 4, 4]);
    callName(rt, 'BitmapDraw', [0, 1, 1, 1, 0, 0, 2, 2, 256, 0, 0, 256, 2]);
    expect([...rt.bitmaps[0]!.pixels!]).toEqual([0, 0, 0, 0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 0]);
  });
  it("BitmapNew + BitmapShow", () => {
    const { rt, g } = gfx();
    callName(rt, "BitmapNew", [1, 8, 8]);
    callName(rt, "BitmapShow", [1, 2, 3]);
    expect(g.commands.some((c) => c.op === "image" && c.sub === "new")).toBe(true);
    expect(g.commands.some((c) => c.op === "image" && c.sub === "show" && c.i === 1)).toBe(true);
  });

  it("BitmapLoad needs BI and file", () => {
    const { rt, g } = gfx();
    rt.loadMrp(buildMrp([{ name: "a.bmp", data: new Uint8Array(16) }]));
    rt.lua.runCold(
      proto({
        maxstack: 10,
        k: [ks("BitmapLoad"), kn(0), ks("a.bmp"), kn(0), kn(0), kn(2), kn(2), kn(2)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABx(OP_LOADK, 3, 3),
          CREATE_ABx(OP_LOADK, 4, 4),
          CREATE_ABx(OP_LOADK, 5, 5),
          CREATE_ABx(OP_LOADK, 6, 6),
          CREATE_ABx(OP_LOADK, 7, 7),
          CREATE_ABC(OP_CALL, 0, 8, 1),
        ],
      }),
    );
    expect(g.commands.some((c) => c.op === "image" && c.sub === "load")).toBe(true);
  });

  it("BitmapLoad without BI errors", () => {
    const { rt } = gfx();
    rt.bi = 0;
    expect(() =>
      rt.lua.runCold(
        proto({
          maxstack: 8,
          k: [ks("BitmapLoad"), kn(0), ks("x"), kn(0), kn(0), kn(1), kn(1), kn(1)],
          code: [
            CREATE_ABx(OP_GETGLOBAL, 0, 0),
            CREATE_ABx(OP_LOADK, 1, 1),
            CREATE_ABx(OP_LOADK, 2, 2),
            CREATE_ABx(OP_LOADK, 3, 3),
            CREATE_ABx(OP_LOADK, 4, 4),
            CREATE_ABx(OP_LOADK, 5, 5),
            CREATE_ABx(OP_LOADK, 6, 6),
            CREATE_ABx(OP_LOADK, 7, 7),
            CREATE_ABC(OP_CALL, 0, 8, 1),
          ],
        }),
      ),
    ).toThrow(LuaRuntimeError);
  });

  it("BitmapDraw records image", () => {
    const { rt, g } = gfx();
    callName(rt, "BitmapNew", [0, 4, 4]);
    callName(rt, "BitmapNew", [1, 4, 4]);
    callName(rt, "BitmapDraw", [0, 1, 2, 1, 0, 0, 2, 2, 1, 0, 0, 1, 0]);
    expect(g.commands.some((c) => c.op === "image" && c.sub === "draw")).toBe(true);
  });

  it("SpriteSet + SpriteDraw", () => {
    const { rt, g } = gfx();
    callName(rt, "SpriteSet", [0, 16]);
    callName(rt, "SpriteDraw", [0, 1, 3, 4]);
    expect(g.commands.some((c) => c.op === "sprite" && c.spriteindex === 1)).toBe(true);
  });

  it("TileSet + TileSetRect + TileDraw", () => {
    const { rt, g } = gfx();
    callName(rt, "TileSet", [0, 1, 2, 3, 4, 8]);
    callName(rt, "TileSetRect", [0, 0, 0, 10, 10]);
    callName(rt, "TileDraw", [0]);
    expect(g.commands.some((c) => c.op === "tile" && c.sub === "set")).toBe(true);
    expect(g.commands.some((c) => c.op === "tile" && c.sub === "rect")).toBe(true);
    expect(g.commands.some((c) => c.op === "tile" && c.sub === "draw")).toBe(true);
  });

  it("snapshot: clear/point/line/rect/text/flush still record", () => {
    const { rt, g } = gfx();
    callName(rt, "_clearScr", [1, 2, 3]);
    callName(rt, "_drawPoint", [4, 5, 6, 7, 8]);
    callName(rt, "_drawLine", [0, 0, 1, 1, 9, 8, 7]);
    callName(rt, "_drawRect", [1, 2, 3, 4, 5, 6, 7]);
    expect(g.commands.map((c) => c.op)).toEqual(["clear", "point", "line", "rect"]);
    expect(rt.screen.pixels[5 * rt.screen.width + 4]).not.toBe(0);
  });

  it("text and flush record", () => {
    const { rt, g } = gfx();
    rt.lua.runCold(
      proto({
        maxstack: 10,
        k: [ks("_drawText"), ks("hi"), kn(1), kn(2), kn(3), kn(4), kn(5), kn(0), kn(0)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABx(OP_LOADK, 3, 3),
          CREATE_ABx(OP_LOADK, 4, 4),
          CREATE_ABx(OP_LOADK, 5, 5),
          CREATE_ABx(OP_LOADK, 6, 6),
          CREATE_ABx(OP_LOADK, 7, 7),
          CREATE_ABx(OP_LOADK, 8, 8),
          CREATE_ABC(OP_CALL, 0, 9, 1),
        ],
      }),
    );
    callName(rt, "_dispUp", [0, 0, 10, 10]);
    expect(g.commands.some((c) => c.op === "text" && c.text === "hi")).toBe(true);
    expect(g.commands.some((c) => c.op === "flush")).toBe(true);
  });
});
