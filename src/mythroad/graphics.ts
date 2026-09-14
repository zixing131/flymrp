/** rxgj `MAKERGB` / `MAKERGB565`: R5 G6 B5. */
export function makeRgb565(r: number, g: number, b: number): number {
  return ((((r >>> 3) & 0x1f) << 11) | (((g >>> 2) & 0x3f) << 5) | ((b >>> 3) & 0x1f)) & 0xffff;
}

export function asI16(v: number): number {
  return (v << 16) >> 16;
}

/**
 * Physical LCD retain: `mr_drawBitmap` / table[118] only refresh one rectangle.
 * Games like 神兽传说 draw the next map into the working buffer (including the
 * HUD band) then present `0,0,240,256`. Copying the whole buffer shows that
 * overwrite as 花屏; the handset keeps the last HUD flush (`0,256,240,64`).
 */
export function copyLcdDirtyRect(
  lcd: Uint16Array,
  lcdWidth: number,
  lcdHeight: number,
  src: Uint16Array,
  srcWidth: number,
  srcHeight: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(lcdWidth, srcWidth, x0 + Math.max(0, w | 0));
  const y1 = Math.min(lcdHeight, srcHeight, y0 + Math.max(0, h | 0));
  if (x1 <= x0 || y1 <= y0) return;
  if (
    x0 === 0 && y0 === 0 && x1 === lcdWidth && y1 === lcdHeight &&
    lcdWidth === srcWidth && lcd.length === src.length
  ) {
    lcd.set(src);
    return;
  }
  const span = x1 - x0;
  for (let row = y0; row < y1; row++) {
    const from = row * srcWidth + x0;
    lcd.set(src.subarray(from, from + span), row * lcdWidth + x0);
  }
}

/** C `mr_helper.h` `_DrawBitmap` rop enum. Not the Lua `BM_COPY=0` test alias. */
export const DRAW_BM_OR = 0;
export const DRAW_BM_XOR = 1;
export const DRAW_BM_COPY = 2;
export const DRAW_BM_NOT = 3;
export const DRAW_BM_MERGENOT = 4;
export const DRAW_BM_ANDNOT = 5;
export const DRAW_BM_TRANSPARENT = 6;
export const DRAW_BM_AND = 7;
export const DRAW_BM_GRAY = 8;
export const DRAW_BM_REVERSE = 9;
export const MR_SPRITE_INDEX_MASK = 0x03ff;
export const MR_SPRITE_TRANSPARENT = 0x0400;
export const MR_TILE_SHIFT = 11;
export const MR_ROTATE_0 = 0;
export const MR_ROTATE_90 = 1;
export const MR_ROTATE_180 = 2;
export const MR_ROTATE_270 = 3;

/**
 * Mythroad `mr_screenBuf` RGB565 cache.
 * Host-owned screen memory, not a guest heap pointer.
 */
export class ScreenBuffer {
  pixels: Uint16Array;

  constructor(
    readonly width: number,
    readonly height: number,
    pixels?: Uint16Array,
  ) {
    this.pixels = pixels ?? new Uint16Array(width * height);
  }

  /** SDK _mr_EffSetCon: signed int16 rectangle/gains, RGB565 scaled by 256. */
  effSetCon(x: number, y: number, w: number, h: number, perr: number, perg: number, perb: number): void {
    x = asI16(x); y = asI16(y); w = asI16(w); h = asI16(h);
    perr = asI16(perr); perg = asI16(perg); perb = asI16(perb);
    const maxX = Math.min(this.width, x + w), maxY = Math.min(this.height, y + h);
    for (let dy = Math.max(0, y); dy < maxY; dy++) {
      for (let dx = Math.max(0, x); dx < maxX; dx++) {
        const offset = dy * this.width + dx, old = this.pixels[offset];
        this.pixels[offset] = (((Math.imul(old & 0xf800, perr) >>> 8) & 0xf800) |
          ((Math.imul(old & 0x07e0, perg) >>> 8) & 0x07e0) |
          ((Math.imul(old & 0x001f, perb) >>> 8) & 0x001f));
      }
    }
  }

  /**
   * C `_DrawPoint`: clip then write one RGB565 pixel.
   * Out of bounds is a no-op. `native` is already RGB565, not 8-bit RGB.
   */
  drawPoint565(x: number, y: number, native: number): void {
    const x0 = asI16(x);
    const y0 = asI16(y);
    if (x0 < 0 || y0 < 0 || x0 >= this.width || y0 >= this.height) return;
    this.pixels[y0 * this.width + x0] = native & 0xffff;
  }

  /**
   * Official `MRF_DrawLine` Bresenham that calls `_DrawPoint`.
   * Axis-swap when |dy| > |dx|; always walks the long axis to the right.
   */
  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number): void {
    const native = makeRgb565(r & 0xff, g & 0xff, b & 0xff);
    let X1 = asI16(x1);
    let Y1 = asI16(y1);
    let X2 = asI16(x2);
    let Y2 = asI16(y2);
    let swap = 0;
    let dx = X2 - X1;
    let dy = Y2 - Y1;
    if (((dx < 0) ? -dx : dx) < ((dy < 0) ? -dy : dy)) {
      swap = 1;
      let t = X1;
      X1 = Y1;
      Y1 = t;
      t = X2;
      X2 = Y2;
      Y2 = t;
    }
    if (X1 > X2) {
      let t = X1;
      X1 = X2;
      X2 = t;
      t = Y1;
      Y1 = Y2;
      Y2 = t;
    }
    dx = X2 - X1;
    dy = Y2 - Y1;
    let c1 = dy * 2;
    let stepY = 1;
    if (c1 < 0) {
      c1 = -c1;
      stepY = -1;
    }
    let err = c1 - dx;
    const c2 = err - dx;
    let x = X1;
    let y = Y1;
    while (x <= X2) {
      this.drawPoint565(swap ? y : x, swap ? x : y, native);
      x++;
      if (err < 0) err += c1;
      else {
        y += stepY;
        err += c2;
      }
    }
  }

  /**
   * rxgj `DrawRect`: clip to screen, fill RGB565.
   * Zero-size or fully off-screen is a no-op (`MR_SUCCESS`).
   */
  drawRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    const x0 = asI16(x);
    const y0 = asI16(y);
    const w0 = asI16(w);
    const h0 = asI16(h);
    const minX = Math.max(0, x0);
    const minY = Math.max(0, y0);
    const maxX = Math.min(this.width, x0 + w0);
    const maxY = Math.min(this.height, y0 + h0);
    if (maxY <= minY || maxX <= minX) return;
    const color = makeRgb565(r & 0xff, g & 0xff, b & 0xff);
    for (let yy = minY; yy < maxY; yy++) {
      const row = yy * this.width;
      for (let xx = minX; xx < maxX; xx++) this.pixels[row + xx] = color;
    }
  }

  /**
   * Blit a sky16-style glyph: 16 rows × 2 bytes, MSB-first.
   * Not pixel-identical to device `gb16.uc2`.
   */
  drawGlyph(x: number, y: number, width: number, height: number, bits: Uint8Array, r: number, g: number, b: number): void {
    const color = makeRgb565(r & 0xff, g & 0xff, b & 0xff);
    const x0 = asI16(x);
    const y0 = asI16(y);
    const w = width | 0;
    const h = height | 0;
    for (let gy = 0; gy < h; gy++) {
      const py = y0 + gy;
      if (py < 0 || py >= this.height) continue;
      const hi = bits[gy * 2] ?? 0;
      const lo = bits[gy * 2 + 1] ?? 0;
      const row = ((hi << 8) | lo) & 0xffff;
      const dest = py * this.width;
      for (let gx = 0; gx < w; gx++) {
        if ((row & (0x8000 >> gx)) === 0) continue;
        const px = x0 + gx;
        if (px < 0 || px >= this.width) continue;
        this.pixels[dest + px] = color;
      }
    }
  }

  /**
   * rxgj `_DrawBitmap` into this RGB565 cache.
   * `readPixel(i)` is guest pixel `p[i]` (uint16 index, not a host pointer).
   */
  drawBitmapRop(
    readPixel: (i: number) => number,
    x: number,
    y: number,
    w: number,
    h: number,
    rop: number,
    trans: number,
    sx: number,
    sy: number,
    mw: number,
  ): void {
    const maxX = Math.min(this.width, x + w);
    const maxY = Math.min(this.height, y + h);
    const minX = Math.max(0, x);
    const minY = Math.max(0, y);
    if (maxY <= minY || maxX <= minX) return;
    const t = trans & 0xffff;
    const blitW = w | 0;
    if ((rop & 0xffff) > MR_SPRITE_TRANSPARENT) {
      const bitmapRop = rop & MR_SPRITE_INDEX_MASK;
      const mode = (rop >>> MR_TILE_SHIFT) & 0x3;
      const flip = (rop >>> MR_TILE_SHIFT) & 0x4;
      if (bitmapRop === DRAW_BM_TRANSPARENT) {
        for (let dy = minY; dy < maxY; dy++) {
          const dest = dy * this.width;
          for (let dx = minX; dx < maxX; dx++) {
            const src = readPixel((dy - y) * blitW + (dx - x)) & 0xffff;
            if (src !== t) this.pixels[dest + dx] = src;
          }
        }
        return;
      }
      if (bitmapRop !== DRAW_BM_COPY) return;
      for (let dy = minY; dy < maxY; dy++) {
        const dest = dy * this.width;
        for (let dx = minX; dx < maxX; dx++) {
          const relX = dx - x;
          const relY = dy - y;
          let srcI = 0;
          switch (mode) {
            case MR_ROTATE_0:
              srcI = (flip ? h - 1 - relY : relY) * blitW + relX;
              break;
            case MR_ROTATE_90:
              srcI = (flip ? h - 1 - relX : relX) * blitW + (w - 1 - relY);
              break;
            case MR_ROTATE_180:
              srcI = (flip ? relY : h - 1 - relY) * blitW + (w - 1 - relX);
              break;
            case MR_ROTATE_270:
              srcI = (flip ? relX : h - 1 - relX) * blitW + relY;
              break;
            default:
              continue;
          }
          this.pixels[dest + dx] = readPixel(srcI) & 0xffff;
        }
      }
      return;
    }
    const srcAt = (dx: number, dy: number) => readPixel((dy - y + sy) * mw + (dx - x + sx)) & 0xffff;
    switch (rop & 0xffff) {
      case DRAW_BM_TRANSPARENT:
        for (let dy = minY; dy < maxY; dy++) {
          const dest = dy * this.width;
          for (let dx = minX; dx < maxX; dx++) {
            const src = srcAt(dx, dy);
            if (src !== t) this.pixels[dest + dx] = src;
          }
        }
        break;
      case DRAW_BM_COPY:
        for (let dy = minY; dy < maxY; dy++) {
          const dest = dy * this.width;
          for (let dx = minX; dx < maxX; dx++) this.pixels[dest + dx] = srcAt(dx, dy);
        }
        break;
      case DRAW_BM_GRAY:
      case DRAW_BM_OR:
      case DRAW_BM_XOR:
      case DRAW_BM_NOT:
      case DRAW_BM_MERGENOT:
      case DRAW_BM_ANDNOT:
      case DRAW_BM_AND:
      case DRAW_BM_REVERSE:
        for (let dy = minY; dy < maxY; dy++) {
          const dest = dy * this.width;
          for (let dx = minX; dx < maxX; dx++) {
            const src = srcAt(dx, dy);
            const dst = this.pixels[dest + dx]! & 0xffff;
            switch (rop & 0xffff) {
              case DRAW_BM_GRAY:
                if (src !== t) {
                  const r5 = (src & 0xf800) >>> 11;
                  const g5 = (src & 0x7e0) >>> 6;
                  const b5 = src & 0x1f;
                  const gray = ((r5 * 60 + g5 * 118 + b5 * 22) / 25) | 0;
                  this.pixels[dest + dx] = makeRgb565(gray, gray, gray);
                }
                break;
              case DRAW_BM_REVERSE:
                if (src !== t) this.pixels[dest + dx] = (~src) & 0xffff;
                break;
              case DRAW_BM_OR:
                this.pixels[dest + dx] = (src | dst) & 0xffff;
                break;
              case DRAW_BM_XOR:
                this.pixels[dest + dx] = (src ^ dst) & 0xffff;
                break;
              case DRAW_BM_NOT:
                this.pixels[dest + dx] = (~src) & 0xffff;
                break;
              case DRAW_BM_MERGENOT:
                this.pixels[dest + dx] = ((~src) | dst) & 0xffff;
                break;
              case DRAW_BM_ANDNOT:
                this.pixels[dest + dx] = ((~src) & dst) & 0xffff;
                break;
              case DRAW_BM_AND:
                this.pixels[dest + dx] = (src & dst) & 0xffff;
                break;
            }
          }
        }
        break;
    }
  }

  /**
   * Official `_BitmapCheck`: count non-transparent source pixels whose
   * destination is not `colorCheck`. Used for collision, not drawing.
   */
  bitmapCheck(readPixel: (i: number) => number, x: number, y: number, w: number, h: number, trans: number, colorCheck: number): number {
    const maxX = Math.min(this.width, x + w);
    const maxY = Math.min(this.height, y + h);
    const minX = Math.max(0, x);
    const minY = Math.max(0, y);
    const t = trans & 0xffff;
    const want = colorCheck & 0xffff;
    const blitW = w | 0;
    let n = 0;
    for (let dy = minY; dy < maxY; dy++) {
      const dest = dy * this.width;
      for (let dx = minX; dx < maxX; dx++) {
        const src = readPixel((dy - y) * blitW + (dx - x)) & 0xffff;
        if (src === t) continue;
        if ((this.pixels[dest + dx]! & 0xffff) !== want) n++;
      }
    }
    return n;
  }

  /**
   * Official `_DrawBitmapEx` inverse-transform blit.
   * `A,B,C,D` are 8.8 fixed point. `I==0` is a no-op.
   */
  drawBitmapEx(
    readSrc: (sx: number, sy: number) => number,
    srcX: number,
    srcY: number,
    writeDst: (dx: number, dy: number, color: number) => void,
    dstW: number,
    dstH: number,
    dstX: number,
    dstY: number,
    w: number,
    h: number,
    a: number,
    b: number,
    c: number,
    d: number,
    rop: number,
    trans: number,
  ): void {
    const A = asI16(a);
    const B = asI16(b);
    const C = asI16(c);
    const D = asI16(d);
    const I = (A * D - B * C) | 0;
    if (I === 0) return;
    const W = w & 0xffff;
    const H = h & 0xffff;
    const centerX = asI16(dstX) + ((W / 2) | 0);
    const centerY = asI16(dstY) + ((H / 2) | 0);
    let maxY = ((Math.abs(C) * W + Math.abs(D) * H) >> 9) | 0;
    let minY = 0 - maxY;
    maxY = Math.min(maxY, dstH - centerY);
    minY = Math.max(minY, 0 - centerY);
    const t = trans & 0xffff;
    const copy = (rop & 0xffff) === DRAW_BM_COPY;
    const key = (rop & 0xffff) === DRAW_BM_TRANSPARENT;
    if (!copy && !key) return;
    const div = (num: number, den: number) => (num / den) | 0;
    for (let dy = minY; dy < maxY; dy++) {
      const wI = (W * I) >> 9;
      const hI = (H * I) >> 9;
      let maxX = Math.min(
        D === 0 ? 999 : Math.max(div(wI + B * dy, D), div(B * dy - wI, D)),
        C === 0 ? 999 : Math.max(div(A * dy + hI, C), div(A * dy - hI, C)),
      );
      let minX = Math.max(
        D === 0 ? -999 : Math.min(div(B * dy - wI, D), div(wI + B * dy, D)),
        C === 0 ? -999 : Math.min(div(A * dy - hI, C), div(A * dy + hI, C)),
      );
      maxX = Math.min(maxX, dstW - centerX);
      minX = Math.max(minX, 0 - centerX);
      for (let dx = minX; dx < maxX; dx++) {
        const offsety = ((((A * dy - C * dx) << 8) / I) | 0) + ((H / 2) | 0);
        const offsetx = ((((D * dx - B * dy) << 8) / I) | 0) + ((W / 2) | 0);
        if (offsety < 0 || offsety >= H || offsetx < 0 || offsetx >= W) continue;
        const src = readSrc((offsetx + srcX) | 0, (offsety + srcY) | 0) & 0xffff;
        if (key && src === t) continue;
        writeDst((dx + centerX) | 0, (dy + centerY) | 0, src);
      }
    }
  }
}

export type DrawCommand =
  | { op: "clear"; r: number; g: number; b: number }
  | { op: "rect"; x: number; y: number; w: number; h: number; r: number; g: number; b: number }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; r: number; g: number; b: number }
  | { op: "point"; x: number; y: number; r: number; g: number; b: number }
  | { op: "pixel"; x: number; y: number; r: number; g: number; b: number }
  | { op: "text"; text: string; x: number; y: number; r: number; g: number; b: number; unicode: number; font: number }
  | { op: "eff"; x: number; y: number; w: number; h: number; perr: number; perg: number; perb: number }
  | { op: "flush"; x: number; y: number; w: number; h: number; index: number }
  | {
      op: "image";
      sub?: "load" | "show" | "draw" | "new";
      i: number;
      filename?: string;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      maxw?: number;
      rop?: number;
      sx?: number;
      sy?: number;
      di?: number;
      si?: number;
    }
  | { op: "sprite"; i: number; spriteindex: number; x: number; y: number; mod: number }
  | {
      op: "tile";
      sub?: "set" | "rect" | "draw";
      i: number;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      tileh?: number;
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
    };

export type BitmapSlot = { w: number; h: number; loaded: boolean; name: string; pixels?: Uint16Array };
export type SpriteSlot = { h: number };
export type TileSlot = { x: number; y: number; w: number; h: number; tileh: number; x1: number; y1: number; x2: number; y2: number; cells?: Uint16Array };

export interface GraphicsBackend {
  clear(r: number, g: number, b: number): void;
  drawRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number): void;
  drawPoint(x: number, y: number, r: number, g: number, b: number): void;
  drawText(text: string, x: number, y: number, r: number, g: number, b: number, unicode: number, font: number): void;
  effSetCon(x: number, y: number, w: number, h: number, perr: number, perg: number, perb: number): void;
  flush(x: number, y: number, w: number, h: number, index: number): void;
  image(cmd: Extract<DrawCommand, { op: "image" }>): void;
  sprite(cmd: Extract<DrawCommand, { op: "sprite" }>): void;
  tile(cmd: Extract<DrawCommand, { op: "tile" }>): void;
}

/** Test-only. No Canvas. Replaced later without touching Lua/CPU hot path. */
export class NullGraphicsBackend implements GraphicsBackend {
  commands: DrawCommand[] = [];
  bitmaps: BitmapSlot[] = [];
  sprites: SpriteSlot[] = [];
  tiles: TileSlot[] = [];

  clear(r: number, g: number, b: number): void {
    this.commands.push({ op: "clear", r, g, b });
  }
  drawRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    this.commands.push({ op: "rect", x, y, w, h, r, g, b });
  }
  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number): void {
    this.commands.push({ op: "line", x1, y1, x2, y2, r, g, b });
  }
  drawPoint(x: number, y: number, r: number, g: number, b: number): void {
    this.commands.push({ op: "point", x, y, r, g, b });
  }
  drawText(text: string, x: number, y: number, r: number, g: number, b: number, unicode: number, font: number): void {
    this.commands.push({ op: "text", text, x, y, r, g, b, unicode, font });
  }
  effSetCon(x: number, y: number, w: number, h: number, perr: number, perg: number, perb: number): void {
    this.commands.push({ op: "eff", x, y, w, h, perr, perg, perb });
  }
  flush(x: number, y: number, w: number, h: number, index: number): void {
    this.commands.push({ op: "flush", x, y, w, h, index });
  }
  image(cmd: Extract<DrawCommand, { op: "image" }>): void {
    this.commands.push(cmd);
    if (cmd.sub === "load" || cmd.sub === "new") {
      this.bitmaps[cmd.i] = { w: cmd.w ?? 0, h: cmd.h ?? 0, loaded: true, name: cmd.filename ?? "" };
    }
  }
  sprite(cmd: Extract<DrawCommand, { op: "sprite" }>): void {
    this.commands.push(cmd);
  }
  tile(cmd: Extract<DrawCommand, { op: "tile" }>): void {
    this.commands.push(cmd);
    if (cmd.sub === "set") {
      this.tiles[cmd.i] = {
        x: cmd.x ?? 0,
        y: cmd.y ?? 0,
        w: cmd.w ?? 0,
        h: cmd.h ?? 0,
        tileh: cmd.tileh ?? 0,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
      };
    }
    if (cmd.sub === "rect" && this.tiles[cmd.i]) {
      const t = this.tiles[cmd.i]!;
      t.x1 = cmd.x1 ?? 0;
      t.y1 = cmd.y1 ?? 0;
      t.x2 = cmd.x2 ?? 0;
      t.y2 = cmd.y2 ?? 0;
    }
  }
}

/** 5-bit / 6-bit channel → 8-bit. Not claimed pixel-identical to a device LCD. */
export function rgb565ToRgba(src: Uint16Array, dst: Uint8ClampedArray): void {
  if (dst.length < src.length * 4) throw new RangeError("rgba buffer too small");
  for (let i = 0; i < src.length; i++) {
    const p = src[i]! & 0xffff;
    const r5 = (p >>> 11) & 0x1f;
    const g6 = (p >>> 5) & 0x3f;
    const b5 = p & 0x1f;
    const o = i << 2;
    dst[o] = (r5 << 3) | (r5 >>> 2);
    dst[o + 1] = (g6 << 2) | (g6 >>> 4);
    dst[o + 2] = (b5 << 3) | (b5 >>> 2);
    dst[o + 3] = 255;
  }
}

export type CanvasImageDataLike = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** Minimal Canvas2D surface. No DOM types. */
export type Canvas2DContextLike = {
  createImageData(width: number, height: number): CanvasImageDataLike;
  putImageData(image: CanvasImageDataLike, dx: number, dy: number): void;
};

/**
 * Guest RGB565 ScreenBuffer → host RGBA ImageData → putImageData.
 * Drawing stays on the guest-visible cache; this only presents.
 */
export class Canvas2DBackend implements GraphicsBackend {
  frames = 0;
  lastImage: CanvasImageDataLike | null = null;

  constructor(
    private readonly ctx: Canvas2DContextLike,
    private readonly getScreen: () => ScreenBuffer,
  ) {}

  clear(_r: number, _g: number, _b: number): void {}
  drawRect(_x: number, _y: number, _w: number, _h: number, _r: number, _g: number, _b: number): void {}
  drawLine(_x1: number, _y1: number, _x2: number, _y2: number, _r: number, _g: number, _b: number): void {}
  drawPoint(_x: number, _y: number, _r: number, _g: number, _b: number): void {}
  drawText(
    _text: string,
    _x: number,
    _y: number,
    _r: number,
    _g: number,
    _b: number,
    _unicode: number,
    _font: number,
  ): void {}
  effSetCon(_x: number, _y: number, _w: number, _h: number, _perr: number, _perg: number, _perb: number): void {}
  image(_cmd: Extract<DrawCommand, { op: "image" }>): void {}
  sprite(_cmd: Extract<DrawCommand, { op: "sprite" }>): void {}
  tile(_cmd: Extract<DrawCommand, { op: "tile" }>): void {}

  flush(_x: number, _y: number, _w: number, _h: number, _index: number): void {
    const screen = this.getScreen();
    const img = this.ctx.createImageData(screen.width, screen.height);
    rgb565ToRgba(screen.pixels, img.data);
    this.ctx.putImageData(img, 0, 0);
    this.lastImage = img;
    this.frames++;
  }
}
