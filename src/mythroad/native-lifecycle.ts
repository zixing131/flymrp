import type { ExtRuntime } from '../abi/runtime.ts';
import { tableSlotAddr } from '../abi/layout.ts';
import type { MythroadTimer } from './timer.ts';

/** The writable lifecycle globals in mythroad.c's internal table. */
export class NativeLifecycle {
  private readonly cells = new Map<number, { address: number; published: number }>();

  constructor(private readonly ext: ExtRuntime, private readonly timer: MythroadTimer,
    private readonly getState: () => number,
    private readonly setState: (state: number, pack: string, entry: string) => void) {
    const table = ext.mem.read32(tableSlotAddr(23));
    for (const index of [2, 4, 5, 6, 11]) {
      const address = ext.allocU32();
      ext.mem.write32(table + index * 4, address);
      this.cells.set(index, { address, published: 0 });
    }
    this.publish();
  }

  private string(address: number): string {
    let value = '';
    for (let i = 0; i < 128; i++) {
      const byte = this.ext.mem.read8(address + i);
      if (!byte) break;
      value += String.fromCharCode(byte);
    }
    return value;
  }

  /** Consume only guest changes, so host timer expiry cannot be undone by stale RAM. */
  consume(): void {
    for (const index of [4, 5, 6, 2]) {
      const cell = this.cells.get(index)!;
      const value = this.ext.mem.read32(cell.address);
      if (value === cell.published) continue;
      if (index === 4 && value) this.timer.callback = this.string(value);
      if (index === 5) this.timer.state = value;
      if (index === 6) this.timer.runWithoutPause = value;
      if (index === 2) this.setState(value,
        this.string(this.ext.mem.read32(tableSlotAddr(100))),
        this.string(this.ext.mem.read32(tableSlotAddr(101))));
      cell.published = value;
    }
  }

  publish(): void {
    for (const [index, value] of [[2, this.getState()], [5, this.timer.state], [6, this.timer.runWithoutPause]]) {
      const cell = this.cells.get(index)!;
      this.ext.mem.write32(cell.address, value);
      cell.published = value;
    }
  }
}
