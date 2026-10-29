import { md5 } from './codec.ts';
import type { DeviceProfile } from './profile.ts';
import type { ExtRuntime } from '../abi/runtime.ts';

// These two MTK ports read packed, unaligned resource widths with LDR.
// Match whole-package content: the filename alone is not a compatibility rule.
const BYTEWISE_PACKAGES = new Set([
  '8cffb31c17c42bc55f9f3a839bcdf009',
  'eaa4ecb7de09a9230cca74c41b41d390',
]);

export function packageWordLoadMode(bytes: Uint8Array, filename: string): DeviceProfile['wordLoadMode'] {
  if (filename.toLowerCase() !== 'gmsushi.mrp') return 'armv5';
  const digest = Array.from(md5(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  return BYTEWISE_PACKAGES.has(digest) ? 'bytewise' : 'armv5';
}

export type GuestFix = 'resource-output' | 'null-free' | 'unicode-measure' | 'empty-launch-param' | null;

export function packageGuestFix(bytes: Uint8Array, filename: string): GuestFix {
  if (!['yhds.mrp', 'gsgyxz.mrp', 'gmxmj.mrp', 'optsxm.mrp'].includes(filename.toLowerCase())) return null;
  const digest = Array.from(md5(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest === 'c311486367124b5559ea3186e6b2f748') return 'resource-output';
  if (digest === '101797ab163609eb298d559fc1e949c8') return 'null-free';
  if (digest === 'cf3cae04628e37cdd32bd9b7d0718362') return 'unicode-measure';
  if (digest === '3726f59c3310467b087f424b8e330987') return 'empty-launch-param';
  return null;
}

/** Narrow repairs for verified guest bugs, gated by package and instruction bytes. */
export function installPackageGuestFix(ext: ExtRuntime, current: () => GuestFix): void {
  const previous = ext.cpu.onBeforeFetch;
  ext.cpu.onBeforeFetch = cpu => {
    const pc = cpu.r[15], fix = current();
    if (fix === 'empty-launch-param' && pc === 0x267398 && cpu.t && cpu.r[0] === 5001 && cpu.r[2] === 0 &&
        ext.mem.read32(pc) === 0x1c03b508 && ext.mem.read32(pc + 4) === 0x1c111c08 &&
        ext.mem.read32(pc + 0x28) === 0xf9daf7ff) {
      // optsxm's loader sends event 5001 even for the empty launch parameter.
      // Its old engine has no such event: it indexes the keyboard table by the
      // string pointer. Ignore only the empty parameter, preserving real input.
      cpu.r[0] = 0;
      const lr = cpu.r[14]; cpu.t = lr & 1; cpu.r[15] = (lr & (cpu.t ? ~1 : ~3)) >>> 0;
      return true;
    }
    if (fix === 'unicode-measure' && pc === 0x1e975f0 && !cpu.t && cpu.r[14] === 0x1e9c370 &&
        ext.mem.read32(pc) === 0xe92d4dff && ext.mem.read32(0x1e9c364) === 0xe3a01000 &&
        ext.mem.read32(0x1e9c36c) === 0xebffec9f && ext.mem.read32(0x1e9c3f4) === 0xe3a02003) {
      // gmxmj's Unicode multiline wrapper draws with flags=3 (Unicode +
      // wrapping), but measures the same buffer with is_unicode=0. Its GBK
      // conversion skips embedded NULs and overwrites the next heap block.
      cpu.r[1] = 1;
    }
    if (fix === 'resource-output' && pc === 0x1e867c0 && !cpu.t &&
        ext.mem.read32(pc) === 0xe92d4030 && ext.mem.read32(pc + 4) === 0xe24dd00c &&
        ext.mem.read32(pc + 0x28) === 0xeb003540) {
      // yhds's extraction helper passes an uninitialized local as void **out.
      // Its unzip function treats that stale saved LR as a supplied buffer,
      // overwriting executable code. Initialize only that helper's out local.
      ext.mem.write32(cpu.r[13] - 16, 0);
    }
    if (fix === 'null-free' && pc === 0x24c6dc && cpu.t && cpu.r[0] === 0 &&
        ext.mem.read32(pc) === 0x43c92103 && ext.mem.read32(pc + 4) === 0x5809b508 &&
        ext.mem.read16(pc + 16) === 0xbd08) {
      // This vendor free helper reads ptr[-1] before checking ownership.
      // The sound-prompt path passes NULL; free(NULL) must do nothing.
      const lr = cpu.r[14]; cpu.t = lr & 1; cpu.r[15] = (lr & (cpu.t ? ~1 : ~3)) >>> 0;
      return true;
    }
    return previous?.(cpu) ?? false;
  };
}
