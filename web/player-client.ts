import { rgb565ToRgba } from '../src/mythroad/graphics.ts';
import type { EditState } from '../src/mythroad/native-editor.ts';
import type { PlayerRequest, PlayerResponse } from './player-protocol.ts';

/** One worker per game. Termination stops a busy guest immediately. */
export class PlayerClient {
  private readonly worker = import.meta.env.PROD
    ? new Worker(new URL('player.worker.js', document.baseURI).href)
    : new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' });
  private watchdog?: ReturnType<typeof setTimeout>;
  private readonly guard: () => void;
  private busy = false;
  private stopped = false;
  private pendingMotion: [number, number] | null = null;
  private readyResolve: ((title: string) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  screenW = 240;
  screenH = 320;
  frames = 0;
  exited = false;
  readonly input = { press: (key: string) => this.send({ type: 'key', key, pressed: true }), release: (key: string) => this.send({ type: 'key', key, pressed: false }) };
  constructor(canvas: HTMLCanvasElement, hooks: {
    resize?: (width: number, height: number) => void;
    edit: (state: EditState | null) => void;
    sound: (format: number, bytes: Uint8Array | null, loop: number, positionMs?: number) => void;
    soundStop: (format: number) => void;
    error: (error: Error) => void;
    persist?: (path: string, bytes: Uint8Array | null) => void;
  }) {
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) { this.worker.terminate(); throw new Error('Canvas2D unavailable'); }
    let base: HTMLCanvasElement | undefined;
    this.guard = () => {
      clearTimeout(this.watchdog);
      if (!this.stopped && !globalThis.document?.hidden && (this.busy || this.readyReject))
        this.watchdog = setTimeout(() => this.failed(new Error('应用长时间未响应，已停止运行。'), hooks.error), 8000);
    };
    globalThis.document?.addEventListener('visibilitychange', this.guard);
    this.worker.onmessage = (event: MessageEvent<PlayerResponse>) => {
      const data = event.data;
      if (data.type === 'efs-file') { hooks.persist?.(data.path, data.bytes); return; }
      if (this.stopped) return;
      switch (data.type) {
        case 'frame': {
          const { width, height, glyphs } = data;
          if (width !== this.screenW || height !== this.screenH) hooks.resize?.(width, height);
          this.screenW = width; this.screenH = height;
          const scale = glyphs.length ? Math.max(1, Math.min(6,
            Math.ceil(canvas.clientWidth * (window.devicePixelRatio || 1) / width),
            Math.floor(Math.sqrt(4194304 / (width * height))))) : 1;
          if (canvas.width !== width * scale) canvas.width = width * scale;
          if (canvas.height !== height * scale) canvas.height = height * scale;
          const image = context.createImageData(width, height);
          rgb565ToRgba(data.pixels, image.data);
          if (scale === 1) context.putImageData(image, 0, 0);
          else {
            base ??= document.createElement('canvas');
            if (base.width !== width) base.width = width;
            if (base.height !== height) base.height = height;
            base.getContext('2d', { alpha: false })!.putImageData(image, 0, 0);
            context.setTransform(scale, 0, 0, scale, 0, 0);
            context.imageSmoothingEnabled = false;
            context.drawImage(base, 0, 0);
          }
          this.frames++;
          if (!glyphs.length) break;
          context.setTransform(scale, 0, 0, scale, 0, 0);
          context.font = '16px sans-serif';
          context.textBaseline = 'middle';
          for (const g of glyphs) {
            const c = g.color;
            context.save();
            context.beginPath();
            context.rect(g.x, g.y, g.width, g.height);
            context.clip();
            context.fillStyle = 'rgb(' + Math.round((c >> 11) * 255 / 31) + ',' + Math.round(((c >> 5) & 63) * 255 / 63) + ',' + Math.round((c & 31) * 255 / 31) + ')';
            context.fillText(String.fromCharCode(g.code), g.x, g.y + 8, g.width);
            context.restore();
          }
          break;
        }
        case 'ready': clearTimeout(this.watchdog); this.readyResolve?.(data.title); this.readyResolve = null; this.readyReject = null; break;
        case 'tick-complete':
          clearTimeout(this.watchdog); this.busy = false;
          if (this.pendingMotion) {
            const motion = this.pendingMotion;
            this.pendingMotion = null;
            this.send({ type: 'motion', x: motion[0], y: motion[1] });
          }
          break;
        case 'edit': hooks.edit(data.state); break;
        case 'sound': hooks.sound(data.format, data.bytes, data.loop, data.positionMs); break;
        case 'vibrate': navigator.vibrate?.(data.milliseconds); break;
        case 'sound-stop': hooks.soundStop(data.format); break;
        case 'error': this.exited = data.exited; this.failed(new Error(data.message), hooks.error); break;
      }
    };
    this.worker.onerror = event => { event.preventDefault(); this.failed(new Error(event.message || '无法启动游戏执行线程'), hooks.error); };
  }
  private failed(error: Error, report: (error: Error) => void): void {
    if (this.stopped) return;
    const reject = this.readyReject; this.readyResolve = null; this.readyReject = null;
    this.stop();
    if (reject) reject(error); else report(error);
  }
  private send(message: PlayerRequest): void { if (!this.stopped) this.worker.postMessage(message); }
  start(message: Extract<PlayerRequest, { type: 'start' }>): Promise<string> {
    return new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; this.guard(); this.worker.postMessage(message, [message.bytes]); });
  }
  tick(milliseconds: number, speed: number): void {
    // At most one tick is queued: long callbacks cannot build a catch-up backlog.
    if (this.busy || this.stopped) return;
    this.busy = true; this.guard(); this.send({ type: 'tick', milliseconds, speed });
  }
  queueEvent(_kind: number, event: number, x: number, y: number): void { this.send({ type: 'touch', event, x, y }); }
  motion(x: number, y: number): void {
    if (this.stopped) return;
    if (this.busy) { this.pendingMotion = [x, y]; return; }
    this.send({ type: 'motion', x, y });
  }
  setUserFile(path: string, bytes: Uint8Array | null): void { this.send({ type: 'sd-file', path, bytes }); }
  setHdText(enabled: boolean): void { this.send({ type: 'hd-text', enabled }); }
  pause(): void { this.send({ type: 'pause', paused: true }); }
  resume(): void { this.send({ type: 'pause', paused: false }); }
  finishEdit(text: string, accepted: boolean): void { this.send({ type: 'edit', text, accepted }); }
  stop(): void {
    if (this.stopped) return;
    clearTimeout(this.watchdog);
    globalThis.document?.removeEventListener('visibilitychange', this.guard);
    navigator.vibrate?.(0);
    this.stopped = true; this.worker.terminate();
    this.readyReject?.(new Error('游戏加载已取消')); this.readyResolve = null; this.readyReject = null;
  }
}
