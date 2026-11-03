import { afterEach, expect, it, vi } from 'vitest';
import { PlayerClient } from '../../web/player-client.ts';
import type { PlayerResponse } from '../../web/player-protocol.ts';

class WorkerDouble {
  static latest: WorkerDouble;
  onmessage: ((event: { data: PlayerResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;
  constructor() { WorkerDouble.latest = this; }
  postMessage(message: unknown) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data: PlayerResponse) { this.onmessage?.({ data }); }
}
function fixture() {
  vi.stubGlobal('Worker', WorkerDouble);
  const draw = vi.fn();
  const canvas = { width: 240, height: 320, getContext: () => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: draw,
  }) };
  const hooks = { edit: vi.fn(), sound: vi.fn(), soundStop: vi.fn(), error: vi.fn() };
  const player = new PlayerClient(canvas as unknown as HTMLCanvasElement, hooks);
  return { player, worker: WorkerDouble.latest, canvas, hooks, draw };
}
afterEach(() => vi.unstubAllGlobals());
it('holds only the latest motion sample while a long tick is busy', () => {
  const { player, worker } = fixture();
  player.tick(16, 1);
  player.motion(10, 0);
  player.motion(20, -5);
  expect(worker.messages.filter(message => (message as { type?: string }).type === 'motion')).toEqual([]);
  worker.emit({ type: 'tick-complete' });
  expect(worker.messages.at(-1)).toEqual({ type: 'motion', x: 20, y: -5 });
});
it('bounds pending ticks and preserves key presses and releases during a busy callback', () => {
  const { player, worker } = fixture();
  player.tick(16, 1); player.tick(20, 4);
  player.input.press('FIRE'); player.input.release('FIRE');
  expect(worker.messages).toEqual([{ type: 'tick', milliseconds: 16, speed: 1 }, { type: 'key', key: 'FIRE', pressed: true }, { type: 'key', key: 'FIRE', pressed: false }]);
  worker.emit({ type: 'tick-complete' }); player.tick(17, 2);
  expect(worker.messages.at(-1)).toEqual({ type: 'tick', milliseconds: 17, speed: 2 });
});
it('terminates loading immediately and ignores stale frames and errors after replacement', async () => {
  const { player, worker, draw, hooks } = fixture();
  const ready = player.start({ type: 'start', bytes: new ArrayBuffer(4), files: {}, profile: {} });
  const cancelled = expect(ready).rejects.toThrow('取消');
  player.stop(); await cancelled;
  worker.emit({ type: 'frame', glyphs: [], width: 1, height: 1, pixels: new Uint16Array([0xffff]) });
  worker.emit({ type: 'error', message: 'old guest', exited: false });
  expect(worker.terminated).toBe(true); expect(draw).not.toHaveBeenCalled(); expect(hooks.error).not.toHaveBeenCalled();
});
it('keeps guest file writes after the player has been stopped', () => {
  const persist = vi.fn();
  vi.stubGlobal('Worker', WorkerDouble);
  const canvas = { width: 240, height: 320, getContext: () => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn(),
  }) };
  const player = new PlayerClient(canvas as unknown as HTMLCanvasElement, {
    edit: vi.fn(), sound: vi.fn(), soundStop: vi.fn(), error: vi.fn(), persist,
  });
  player.stop();
  WorkerDouble.latest.emit({ type: 'efs-file', path: 'game.sav', bytes: new Uint8Array([4, 5]) });
  expect(persist).toHaveBeenCalledWith('game.sav', new Uint8Array([4, 5]));
});
it('renders transferred LCD pixels and handles resolution changes and editor messages', () => {
  const { player, worker, canvas, draw, hooks } = fixture();
  worker.emit({ type: 'frame', glyphs: [], width: 2, height: 1, pixels: new Uint16Array([0xf800, 0x07e0]) });
  expect([canvas.width, canvas.height, player.frames]).toEqual([2, 1, 1]);
  expect([...draw.mock.calls[0][0].data]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  worker.emit({ type: 'edit', state: { handle: 1, title: '姓名', text: '', type: 0, maxLength: 8 } });
  expect(hooks.edit).toHaveBeenCalledOnce();
  player.finishEdit('阿明', true);
  expect(worker.messages.at(-1)).toEqual({ type: 'edit', text: '阿明', accepted: true });
});

it('terminates an unresponsive guest and reports the failure once', () => {
  vi.useFakeTimers();
  try {
    const { player, worker, hooks } = fixture();
    player.tick(16, 1);
    vi.advanceTimersByTime(8000);
    expect(worker.terminated).toBe(true);
    expect(hooks.error).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringContaining('未响应')}));
    worker.emit({ type: 'tick-complete' });
    vi.advanceTimersByTime(8000);
    expect(hooks.error).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
