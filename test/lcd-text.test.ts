import { expect, it } from 'vitest';
import { LcdText } from '../src/mythroad/lcd-text.ts';
import { ScreenBuffer } from '../src/mythroad/graphics.ts';

it('only substitutes a complete visible glyph over its original solid background', () => {
  const screen=new ScreenBuffer(32,16), hints=new LcdText();
  screen.onGlyph=hints.observe;
  const bits=new Uint8Array(32).fill(0xaa);
  screen.drawGlyph(8,0,16,16,bits,255,255,255,0x4e00);
  expect(hints.visible(screen.pixels,32,16)).toMatchObject([{code:0x4e00,x:8,background:0}]);
  screen.drawPoint565(9,0,15);
  expect(hints.visible(screen.pixels,32,16)).toEqual([]);
  screen.drawRect(0,0,32,16,255,255,255);
  expect(hints.visible(screen.pixels,32,16)).toEqual([]);
});

it('restores patterned pixels only on a display copy, including after a repeated draw', () => {
  const screen = new ScreenBuffer(16,16), hints = new LcdText();
  screen.onGlyph = hints.observe;
  for (let i=0; i<screen.pixels.length; i++) screen.pixels[i]=i;
  const before = screen.pixels.slice(), bits = new Uint8Array(32).fill(0xaa);
  for (let i=0; i<2; i++) screen.drawGlyph(0,0,16,16,bits,255,255,255,0x795e);
  const displayed = screen.pixels.slice();
  expect(hints.visible(screen.pixels,16,16,displayed)).toMatchObject([{code:0x795e}]);
  expect(displayed).toEqual(before);
  expect(screen.pixels).not.toEqual(before);
  screen.drawPoint565(0,0,123);
  const covered = screen.pixels.slice();
  expect(hints.visible(screen.pixels,16,16,covered)).toEqual([]);
  expect(covered).toEqual(screen.pixels);
});
