import { mrEncode } from './codec.ts';
import { MR_FAILED, MR_SUCCESS } from './constants.ts';

/** Legacy DSM configuration bytes; this does not send SMS or contact services. */
export class LegacyConfig {
  readonly bytes = new Uint8Array(120 * 36);
  private dirty = false;
  constructor(private readonly read: () => Uint8Array | null, private readonly write: (bytes: Uint8Array) => void) {}
  load(): number {
    this.bytes.fill(0); this.dirty = false;
    const file = this.read();
    if (file) this.bytes.set(file.subarray(0,this.bytes.length));
    if (!file || file.length < this.bytes.length) {
      // Defaults from _mr_load_sms_cfg/_mr_smsAddNum in the reference runtime.
      for (const [index,value] of [[0,'518869058'],[1,'918869058'],[3,'aa']] as const) {
        const encoded=mrEncode(new TextEncoder().encode(value))!;
        const start=120+index*32;this.bytes.fill(0,start,start+32);this.bytes.set(encoded,start);
      }
      this.dirty = true;
    }
    return MR_SUCCESS;
  }
  get(offset: number, length: number): Uint8Array | null {
    if (offset < 0 || length < 0 || offset + length >= this.bytes.length) return null;
    return this.bytes.slice(offset,offset+length);
  }
  set(offset: number, bytes: Uint8Array): number {
    if (offset < 0 || offset + bytes.length >= this.bytes.length) return MR_FAILED;
    this.bytes.set(bytes,offset);this.dirty=true;return MR_SUCCESS;
  }
  save(): number {
    if (this.dirty) { this.write(this.bytes.slice()); this.dirty=false; }
    return MR_SUCCESS;
  }
}
