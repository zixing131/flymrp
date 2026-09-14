import type { GuestMemory } from '../hot/memory.ts';
import { ScreenBuffer } from './graphics.ts';
import { gb16Glyph } from './font.ts';
import { MR_FAILED, MR_SUCCESS, MR_IGNORE, MR_KEY_UP, MR_KEY_DOWN, MR_KEY_FIRE, MR_KEY_SOFTLEFT, MR_KEY_SOFTRIGHT, MR_MENU_SELECT, MR_MENU_RETURN, MR_DIALOG_EVENT, MR_MOTION_EVENT, MR_MOUSE_DOWN, MR_MOUSE_UP } from './constants.ts';

type View = { handle: number; kind: 'menu' | 'text' | 'dialog'; title: string; text: string; items: string[]; selected: number; buttons: number; scroll: number };
/** Handset menu/text/dialog ABI with independent handles and real events. */
export class NativeUi {
  active: View | null = null;
  private readonly views = new Map<number, View>();
  private nextHandle = 1;
  private swallowRelease: number | null = null;
  private swallowTouchRelease = false;
  private width = 240;
  private height = 320;
  constructor(private readonly mem: GuestMemory, private readonly changed: () => void, private readonly event: (type: number, value: number) => void) {}
  private read(p: number | string): string {
    if (typeof p === 'string') return p;
    if (!p) return '';
    let text = '';
    for (let i = 0; i < 4096; i++) { const ch = this.mem.read8(p + i * 2) << 8 | this.mem.read8(p + i * 2 + 1); if (!ch) break; text += String.fromCharCode(ch); }
    return text;
  }
  create(kind: View['kind'], title: number | string, text: number | string = 0, buttons = 0): number {
    if (this.views.size >= 64) return MR_FAILED;
    const view: View = { handle: this.nextHandle++, kind, title: this.read(title), text: this.read(text), items: [], selected: 0, buttons, scroll: 0 };
    this.views.set(view.handle, view);
    if (kind !== 'menu') { this.active = view; this.changed(); }
    return view.handle;
  }
  setItem(handle: number, text: number | string, index: number): number {
    const view = this.views.get(handle);
    if (!view || view.kind !== 'menu' || index < 0 || index >= 256) return MR_FAILED;
    view.items[index] = this.read(text); if (this.active === view) this.changed(); return MR_SUCCESS;
  }
  show(handle: number): number {
    const view = this.views.get(handle); if (!view) return MR_FAILED;
    this.active = view; this.changed(); return MR_SUCCESS;
  }
  release(handle: number): number {
    const view = this.views.get(handle); if (!view) return MR_IGNORE;
    this.views.delete(handle); if (this.active === view) { this.active = null; this.changed(); } return MR_SUCCESS;
  }
  refresh(handle: number, title: number | string, text: number | string, buttons?: number): number {
    const view = this.views.get(handle); if (!view) return MR_FAILED;
    view.title = this.read(title); view.text = this.read(text); view.scroll = 0;
    if (buttons !== undefined && buttons !== -1) view.buttons = buttons;
    return this.show(handle);
  }
  focus(handle: number, index: number): number {
    const view = this.views.get(handle);
    if (!view || view.kind !== 'menu' || index < 0 || index >= view.items.length) return MR_FAILED;
    view.selected = index; if (this.active === view) this.changed(); return MR_SUCCESS;
  }
  key(type: number, key: number, y = 0): boolean {
    if (type === 1 && this.swallowRelease === key) { this.swallowRelease = null; return true; }
    if (type === MR_MOUSE_UP && this.swallowTouchRelease) { this.swallowTouchRelease = false; return true; }
    const view = this.active; if (!view) return false;
    if (type === MR_MOUSE_DOWN) {
      this.swallowTouchRelease = true;
      if (y >= this.height - 30) this.choose(key < this.width / 2);
      else if (view.kind === 'menu') { view.selected = Math.max(0, Math.min(view.items.length - 1, Math.floor((y - 38) / 26) + view.scroll)); this.changed(); }
      return true;
    }
    if (type === MR_MOUSE_UP) return true;
    if (type === MR_MOTION_EVENT) return false;
    if (type !== 0) return true;
    if ([MR_KEY_UP, MR_KEY_DOWN, 2, 8].includes(key)) {
      const delta = key === MR_KEY_UP || key === 2 ? -1 : 1;
      if (view.kind === 'menu') view.selected = Math.max(0, Math.min(view.items.length - 1, view.selected + delta));
      else view.scroll = Math.max(0, view.scroll + delta);
      this.changed(); return true;
    }
    if ([MR_KEY_FIRE, MR_KEY_SOFTLEFT, 5, MR_KEY_SOFTRIGHT].includes(key)) {
      this.swallowRelease = key; this.choose(key !== MR_KEY_SOFTRIGHT);
    }
    return true;
  }
  private choose(accepted: boolean): void {
    const view = this.active; if (!view) return;
    if (view.kind !== 'menu' && (view.buttons === 100 || (view.buttons === 0 && !accepted) || (view.buttons === 2 && accepted))) return;
    this.active = null; this.changed();
    this.event(view.kind === 'menu' ? (accepted ? MR_MENU_SELECT : MR_MENU_RETURN) : MR_DIALOG_EVENT, view.kind === 'menu' ? (accepted ? view.selected : 0) : (accepted ? 0 : 1));
  }
  render(screen: ScreenBuffer): ScreenBuffer {
    const view = this.active; if (!view) return screen;
    this.width = screen.width; this.height = screen.height;
    const out = new ScreenBuffer(screen.width, screen.height); out.drawRect(0, 0, out.width, out.height, 246, 246, 240);
    out.drawRect(0, 0, out.width, 32, 50, 74, 92);
    const text = (value: string, x: number, y: number, light = false) => {
      for (const ch of value) { const glyph = gb16Glyph(ch.charCodeAt(0)); if (x + glyph.width > out.width - 6) break; out.drawGlyph(x, y, glyph.width, glyph.height, glyph.bits, light ? 255 : 30, light ? 255 : 30, light ? 255 : 30); x += glyph.width; }
    };
    text(view.title, 8, 8, true);
    const rows = Math.max(1, Math.floor((out.height - 72) / 26));
    if (view.kind === 'menu') {
      if (view.selected < view.scroll) view.scroll = view.selected;
      if (view.selected >= view.scroll + rows) view.scroll = view.selected - rows + 1;
      view.items.slice(view.scroll, view.scroll + rows).forEach((item, i) => {
        const y = 38 + i * 26, selected = view.scroll + i === view.selected;
        if (selected) out.drawRect(4, y - 2, out.width - 8, 24, 211, 226, 248);
        text(item ?? '', 10, y + 2);
      });
    } else {
      const lines: string[] = []; let line = '', width = 0;
      for (const ch of view.text.replace(/\r/g, '')) {
        const w = gb16Glyph(ch.charCodeAt(0)).width;
        if (ch === '\n' || width + w > out.width - 20) { lines.push(line); line = ''; width = 0; }
        if (ch !== '\n') { line += ch; width += w; }
      }
      lines.push(line); view.scroll = Math.min(view.scroll, Math.max(0, lines.length - rows));
      lines.slice(view.scroll, view.scroll + rows).forEach((line, i) => text(line, 10, 40 + i * 26));
    }
    out.drawRect(0, out.height - 30, out.width, 30, 226, 230, 232);
    if (view.kind === 'menu' || view.buttons === 0 || view.buttons === 1) text('确定', 8, out.height - 23);
    if (view.kind === 'menu' || view.buttons === 1 || view.buttons === 2) text('返回', out.width - 40, out.height - 23);
    return out;
  }
}
