// Presentation hints never change the guest framebuffer. Compare against the
// final LCD, since sprites or direct ARM writes can cover an earlier glyph.
import type { GlyphObserver } from './graphics.ts';

type Cell = { code: number; x: number; y: number; width: number; height: number; bits: Uint8Array; color: number; underlay: Uint16Array; solid: boolean };
export type VisibleGlyph = Cell & { background: number };

function isInk(c: Cell, x: number, y: number): boolean {
  return !!(c.bits[y*2+(x>>3)]! & (128 >> (x&7)));
}

function matches(c: Cell, pixels: Uint16Array, width: number): boolean {
  for (let y=0; y<c.height; y++) {
    for (let x=0; x<c.width; x++) {
      const expected = isInk(c,x,y) ? c.color : c.underlay[y*c.width+x];
      if (pixels[(c.y+y)*width+c.x+x] !== expected) return false;
    }
  }
  return true;
}

export class LcdText {
  private cells = new Map<number, Cell>();

  readonly observe: GlyphObserver = (code, x, y, width, height, bits, color, screen) => {
    if (x < 0 || y < 0 || x > 2047 || y > 2047 || code <= 32 || height !== 16 ||
        width !== (code < 128 ? 8 : 16) || x+width > screen.width || y+height > screen.height) return;
    const key = y * 2048 + x;
    const previous = this.cells.get(key);
    // Redrawing an intact glyph must not bake its old ink into the background.
    if (previous?.code === code && previous.color === color && previous.width === width &&
        previous.bits.every((v,i) => v === bits[i]) && matches(previous,screen.pixels,screen.width)) return;
    const underlay = previous?.width === width ? previous.underlay : new Uint16Array(width*height);
    const cell = {code, x, y, width, height, bits, color, underlay, solid:true};
    let hasInk = false;
    for (let dy=0; dy<height; dy++) {
      for (let dx=0; dx<width; dx++) {
        const pixel = screen.pixels[(y+dy)*screen.width+x+dx]!;
        underlay[dy*width+dx] = pixel;
        if (pixel !== underlay[0]) cell.solid = false;
        if (pixel !== color && isInk(cell,dx,dy)) hasInk = true;
      }
    }
    if (!hasInk) { this.cells.delete(key); return; }
    if (!previous && this.cells.size >= 2048) this.cells.delete(this.cells.keys().next().value!);
    this.cells.set(key, cell);
  };

  // With a presentation copy, restore the exact pixels behind each verified
  // glyph. Callers without one can replace only glyphs on a solid background.
  visible(pixels: Uint16Array, width: number, height: number, presentation?: Uint16Array): VisibleGlyph[] {
    const out: VisibleGlyph[] = [];
    for (const c of this.cells.values()) {
      if (c.x+c.width > width || c.y+c.height > height) continue;
      const background = c.underlay[0]!;
      if ((!presentation && !c.solid) || !matches(c,pixels,width)) continue;
      if (presentation) {
        for (let y=0; y<c.height; y++) {
          for (let x=0; x<c.width; x++) {
            if (isInk(c,x,y)) presentation[(c.y+y)*width+c.x+x] = c.underlay[y*c.width+x]!;
          }
        }
      }
      out.push({...c, background});
    }
    return out;
  }
}
