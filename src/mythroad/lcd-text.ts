// Text is a presentation hint, never part of the guest framebuffer. Match the
// final LCD after dirty-rectangle copies: a menu, sprite or direct ARM write
// may already have covered part of a recorded glyph.
import type { GlyphObserver } from './graphics.ts';

type Cell = { code: number; x: number; y: number; width: number; height: number; bits: Uint8Array; color: number };
export type VisibleGlyph = Cell & { background: number };

export class LcdText {
  private cells = new Map<number, Cell>();

  readonly observe: GlyphObserver = (code, x, y, width, height, bits, color) => {
    if (x < 0 || y < 0 || x > 2047 || y > 2047 || code <= 32 || height !== 16 ||
        width !== (code < 128 ? 8 : 16)) return;
    const key = y * 2048 + x;
    // An application can draw at arbitrarily many locations between presents.
    if (!this.cells.has(key) && this.cells.size >= 2048)
      this.cells.delete(this.cells.keys().next().value!);
    this.cells.set(key, {code, x, y, width, height, bits, color});
  };

  visible(pixels: Uint16Array, width: number, height: number): VisibleGlyph[] {
    const out: VisibleGlyph[] = [];
    for (const c of this.cells.values()) {
      if (c.x+c.width > width || c.y+c.height > height) continue;
      let bg = -1, ink = false, valid = true;
      for (let y=0; y<c.height && valid; y++) {
        const mask = (c.bits[y*2]! << 8) | c.bits[y*2+1]!;
        for (let x=0; x<c.width; x++) {
          const pixel = pixels[(c.y+y)*width+c.x+x]!;
          if (mask & (0x8000 >> x)) {
            ink = true;
            if (pixel !== c.color) { valid=false; break; }
          } else if (bg < 0) bg=pixel;
          else if (pixel !== bg) { valid=false; break; }
        }
      }
      if (valid && ink && bg >= 0 && bg !== c.color) out.push({...c, background:bg});
    }
    return out;
  }
}
