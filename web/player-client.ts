import { rgb565ToRgba } from '../src/mythroad/graphics.ts';
import type { EditState } from '../src/mythroad/native-editor.ts';
import type { PlayerRequest, PlayerResponse } from './player-protocol.ts';

/** One worker per game. Termination stops a busy guest immediately. */
export class PlayerClient {
  private readonly worker = import.meta.env.PROD
    ? new Worker(new URL('player.worker.js', document.baseURI).href)
    : new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' });
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
    edit: (state: EditState | null) => void;
    sound: (format: number, bytes: Uint8Array | null, loop: number, positionMs?: number) => void;
    soundStop: (format: number) => void;
    error: (error: Error) => void;
    persist?: (path: string, bytes: Uint8Array | null) => void;
  }) {
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) { this.worker.terminate(); throw new Error('Canvas2D unavailable'); }
    this.worker.onmessage = (event: MessageEvent<PlayerResponse>) => {
      const data = event.data;
      if (data.type === 'efs-file') { hooks.persist?.(data.path, data.bytes); return; }
      if (this.stopped) return;
      switch (data.type) {
        case 'frame': {
          this.screenW = data.width; this.screenH = data.height;
          if (canvas.width !== data.width) canvas.width = data.width;
          if (canvas.height !== data.height) canvas.height = data.height;
          const image = context.createImageData(data.width, data.height);
          rgb565ToRgba(data.pixels, image.data); context.putImageData(image, 0, 0); this.frames++;
          break;
        }
        case 'ready': this.readyResolve?.(data.title); this.readyResolve = null; this.readyReject = null; break;
        case 'tick-complete':
          this.busy = false;
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
    if (reject) reject(error); else report(error);
  }
  private send(message: PlayerRequest): void { if (!this.stopped) this.worker.postMessage(message); }
  start(message: Extract<PlayerRequest, { type: 'start' }>): Promise<string> {
    return new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; this.worker.postMessage(message, [message.bytes]); });
  }
  tick(milliseconds: number, speed: number): void {
    // At most one tick is queued: long callbacks cannot build a catch-up backlog.
    if (this.busy || this.stopped) return;
    this.busy = true; this.send({ type: 'tick', milliseconds, speed });
  }
  queueEvent(_kind: number, event: number, x: number, y: number): void { this.send({ type: 'touch', event, x, y }); }
  motion(x: number, y: number): void {
    if (this.stopped) return;
    if (this.busy) { this.pendingMotion = [x, y]; return; }
    this.send({ type: 'motion', x, y });
  }
  setUserFile(path: string, bytes: Uint8Array | null): void { this.send({ type: 'sd-file', path, bytes }); }
  pause(): void { this.send({ type: 'pause', paused: true }); }
  resume(): void { this.send({ type: 'pause', paused: false }); }
  finishEdit(text: string, accepted: boolean): void { this.send({ type: 'edit', text, accepted }); }
  stop(): void {
    navigator.vibrate?.(0);
    this.stopped = true; this.worker.terminate();
    this.readyReject?.(new Error('游戏加载已取消')); this.readyResolve = null; this.readyReject = null;
  }
}
