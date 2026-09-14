/** Device / system info. Lua never reads DOM/window. */

export type DeviceProfile = {
  width: number;
  height: number;
  /** FULL mythroad.c */
  vmver: number;
  hsman: string;
  hstype: string;
  IMEI: string;
  IMSI: string;
  hsver: number;
  /** gb16 MEDIUM: U+70B9 */
  chw: number;
  chh: number;
  /** gb16 MEDIUM: U+0032 */
  ascw: number;
  asch: number;
  datetime: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
  randSeed: number;
  /** Guest-visible native heap capacity; older titles may require a small handset heap. */
  guestHeapSize: number;
  memMin: number;
  memTop: number;
  memLeft: number;
};

export function defaultProfile(over: Partial<DeviceProfile> = {}): DeviceProfile {
  const { datetime, ...rest } = over;
  if (over.guestHeapSize !== undefined && (!Number.isInteger(over.guestHeapSize) || over.guestHeapSize < 256 * 1024 || over.guestHeapSize > 8 * 1024 * 1024 || over.guestHeapSize % 8 !== 0)) throw new RangeError("guestHeapSize must be aligned and between 256 KiB and 8 MiB");
  return {
    width: 240,
    height: 320,
    vmver: 1968,
    // Legacy SDK launchers explicitly recognize this emulated environment.
    // A caller-supplied handset identity still wins through the override below.
    hsman: "sdk",
    hstype: "stage5b",
    IMEI: "0000000000000000",
    IMSI: "0000000000000000",
    hsver: 1,
    chw: 16,
    chh: 16,
    ascw: 8,
    asch: 16,
    // Emulate a period handset clock: many offline titles expire into a
    // mandatory update screen when shown a modern date. Explicit dates win.
    datetime: { year: 2011, month: 1, day: 1, hour: 16, minute: 0, second: 0, ...datetime },
    randSeed: 1,
    guestHeapSize: 8 * 1024 * 1024,
    memMin: 0,
    memTop: 1024 * 1024,
    memLeft: 512 * 1024,
    ...rest,
  };
}

export function lcgNext(seed: number): number {
  return (Math.imul(seed, 1103515245) + 12345) >>> 0;
}
