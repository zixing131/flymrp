import { md5 } from './codec.ts';
import type { DeviceProfile } from './profile.ts';

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
