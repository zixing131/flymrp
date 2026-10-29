import './kaios-polyfill.ts';
import { AppFileSystem, copyLcdDirtyRect, MythroadRuntime, loadGb16Uc2, type GraphicsBackend } from '../src/mythroad/index.ts';
import { DEFAULT_NETWORK_RULES } from '../src/mythroad/network-rules.ts';
import { binToBytes } from '../src/mrp/index.ts';
import { EV_KEY } from '../src/mythroad/events.ts';
import type { PlayerRequest, PlayerResponse } from './player-protocol.ts';
import { clockSlices } from './player-options.ts';
import { createRemoteFileLoaders } from './remote-files.ts';
import { createLegacyPackageLoader } from './legacy-packages.ts';

const post = self.postMessage.bind(self) as (message: PlayerResponse, transfer?: Transferable[]) => void;
const send = (message: PlayerResponse, transfer: Transferable[] = []) => post(message, transfer);
let rt: MythroadRuntime | null = null;
let nextPresent = 0, remainder = 0;
class Display implements GraphicsBackend {
  lcd = new Uint16Array(0);
  width = 0;
  height = 0;
  dirty = false;
  clear() {} drawRect() {} drawLine() {} drawPoint() {} drawText() {}
  effSetCon() {} image() {} sprite() {} tile() {}
  flush(x: number, y: number, w: number, h: number): void {
    if (!rt) return;
    const screen = rt.screen;
    if (this.width !== screen.width || this.height !== screen.height) {
      this.width = screen.width;
      this.height = screen.height;
      this.lcd = new Uint16Array(screen.pixels.length);
    }
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.width, screen.width, x0 + Math.max(0, w | 0));
    const y1 = Math.min(this.height, screen.height, y0 + Math.max(0, h | 0));
    if (x1 <= x0 || y1 <= y0) return;
    // Retain LCD pixels. postMessage must send a copy; transferring this
    // buffer would force the next dirty flush to start from a black screen.
    copyLcdDirtyRect(this.lcd, this.width, this.height, screen.pixels, screen.width, screen.height, x, y, w, h);
    this.dirty = true;
    if (performance.now() >= nextPresent) present();
  }
}
const display = new Display();
function present(): void {
  if (!display.dirty || !display.lcd.length) return;
  const pixels = display.lcd.slice();
  display.dirty = false;
  send({ type: 'frame', width: display.width, height: display.height, pixels }, [pixels.buffer]);
  nextPresent = performance.now() + 16;
}
function step(milliseconds: number): void {
  remainder += milliseconds;
  const whole = Math.floor(remainder); remainder -= whole;
  rt!.advance(whole);
  for (let i = 0; i < 16 && rt!.step(); i++);
  if (rt!.exited) throw new Error('游戏已退出');
}
onmessage = (event: MessageEvent<PlayerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'start') {
      display.lcd = new Uint16Array(0);
      display.width = 0;
      display.height = 0;
      display.dirty = false;
      loadGb16Uc2(message.files['system/gb16.uc2']);
      const names = new AppFileSystem();
      const loaders = message.fileSource ? createRemoteFileLoaders(message.fileSource, name => names.normalize(name)) : null;
      rt = new MythroadRuntime({ profile: message.profile, systemFiles: message.files, resourceFiles: message.resources, userFiles: message.userFiles,
        systemCatalog: message.fileSource?.system, resourceCatalog: message.fileSource?.resources,
        loadSystemFile: loaders?.loadSystemFile, loadResourceFile: loaders?.loadResourceFile,
        graphics: display, abiMode: 'strict', monotonicTime: () => performance.now(),
        networkRules: DEFAULT_NETWORK_RULES,
        loadDownloadPackage: createLegacyPackageLoader(message.profile.width ?? 240, message.profile.height ?? 320),
        onEditChange: state => send({ type: 'edit', state }),
        onVibrate: milliseconds => send({ type: 'vibrate', milliseconds }),
        onPlaySound: (format, bytes, loop, positionMs) => send({ type: 'sound', format, bytes, loop, positionMs }),
        onStopSound: format => send({ type: 'sound-stop', format }),
        onPersistFile: (path, bytes) => send({ type: 'efs-file', path, bytes: bytes ? bytes.slice() : null }),
      });
      const archive = rt.loadMrp(new Uint8Array(message.bytes));
      rt.start();
      present();
      let title = '';
      try { title = new TextDecoder('gbk').decode(binToBytes(archive.header.appname)); }
      catch { try { title = new TextDecoder().decode(binToBytes(archive.header.appname)); } catch { title = ''; } }
      send({ type: 'ready', title });
      return;
    }
    if (!rt) return;
    switch (message.type) {
      case 'tick': for (const elapsed of clockSlices(message.milliseconds, message.speed)) step(elapsed); present(); send({ type: 'tick-complete' }); break;
      case 'sd-file': rt.setUserFile(message.path, message.bytes); break;
      case 'key': if (message.pressed) rt.input.press(message.key); else rt.input.release(message.key); break;
      case 'touch': rt.queueEvent(EV_KEY, message.event, message.x, message.y); break;
      case 'motion': rt.queueMotion(message.x, message.y); break;
      case 'pause': if (message.paused) rt.pause(); else rt.resume(); present(); break;
      case 'edit': rt.mrTable?.editor.finish(message.text, message.accepted); break;
    }
  } catch (error) {
    present();
    send({ type: 'error', message: error instanceof Error ? error.message : String(error), exited: rt?.exited ?? false });
    rt = null;
  }
};
