import type { DeviceProfile } from '../src/mythroad/profile.ts';
import type { EditState } from '../src/mythroad/native-editor.ts';
import type { PlayerFileSource } from './remote-files.ts';

import type { VisibleGlyph } from '../src/mythroad/lcd-text.ts';
export type LcdGlyph = Pick<VisibleGlyph, 'code' | 'x' | 'y' | 'width' | 'height' | 'color'>;
export type { PlayerFileSource };

export type PlayerRequest =
  | { type: 'hd-text'; enabled: boolean }
  | { type: 'start'; hdText?: boolean; bytes: ArrayBuffer; profile: Partial<DeviceProfile>; files: Record<string, Uint8Array>; resources?: Record<string, Uint8Array>; userFiles?: Record<string, Uint8Array>; fileSource?: PlayerFileSource }
  | { type: 'sd-file'; path: string; bytes: Uint8Array | null }
  | { type: 'tick'; milliseconds: number; speed: number }
  | { type: 'key'; key: string; pressed: boolean }
  | { type: 'touch'; event: number; x: number; y: number }
  | { type: 'motion'; x: number; y: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'edit'; text: string; accepted: boolean };
export type PlayerResponse =
  | { type: 'frame'; width: number; height: number; pixels: Uint16Array; glyphs: LcdGlyph[] }
  | { type: 'ready'; title: string }
  | { type: 'tick-complete' }
  | { type: 'edit'; state: EditState | null }
  | { type: 'sound'; format: number; bytes: Uint8Array | null; loop: number; positionMs?: number }
  | { type: 'sound-stop'; format: number }
  | { type: 'vibrate'; milliseconds: number }
  | { type: 'error'; message: string; exited: boolean }
  | { type: 'efs-file'; path: string; bytes: Uint8Array | null };
