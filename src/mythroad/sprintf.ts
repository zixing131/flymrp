/**
 * Guest-aware sprintf_ subset for table[17].
 *
 * Integer, string and character formats with field widths; values come from guest AAPCS arguments.
 * Does not construct a host C argument list. Does not call host sprintf.
 *
 * Return: number of bytes written excluding the trailing NUL
 * (mpaland `_vsnprintf` / `sprintf_`).
 */
import { formatU64 } from "../abi/u64.ts";
import { UnknownAbiError } from "../err/errors.ts";
import type { GuestMemory } from "../hot/memory.ts";

/** Bound on format walk. Unterminated format is an ABI error, not silent truncate. */
export const SPRINTF_FORMAT_MAX = 4096;

export type SprintfVararg = (index: number) => number;

function int32Decimal(word: number): string {
  const n = word | 0;
  if (n === 0) return "0";
  return n.toString(10);
}

function unsupported(spec: string): never {
  throw new UnknownAbiError(`unsupported sprintf format ${spec}`, {
    family: "sprintf_",
    code: spec,
    caller: "ext",
  });
}

function padAlign(value: string, width: number, fill: string, atEnd: boolean): string {
  if (width <= value.length) return value;
  let pad = "";
  const need = width - value.length;
  const ch = fill || " ";
  while (pad.length < need) pad += ch;
  pad = pad.slice(0, need);
  return atEnd ? value + pad : pad + value;
}

/**
 * `int sprintf_(char *buffer, const char *format, ...)` guest subset.
 * `nextVararg` is called for each conversion except `%%`. Index 0 is R2.
 */
export function guestSprintf(
  mem: GuestMemory,
  buffer: number,
  format: number,
  nextVararg: SprintfVararg,
): number {
  const dst = buffer >>> 0;
  let fmt = "";
  for (let i = 0; i < SPRINTF_FORMAT_MAX; i++) {
    const b = mem.read8((format + i) >>> 0);
    if (!b) break;
    fmt += String.fromCharCode(b);
    if (i === SPRINTF_FORMAT_MAX - 1) unsupported("unterminated format");
  }
  let out = 0, vi = 0;
  const write = (piece: string) => {
    for (let i = 0; i < piece.length; i++) mem.write8((dst + out++) >>> 0, piece.charCodeAt(i));
  };
  for (let i = 0; i < fmt.length;) {
    if (fmt[i] !== "%") { write(fmt[i++]); continue; }
    // Legacy printf.c's default conversion emits the NUL following a bare
    // trailing %. Preserve that byte and its return count, but stop at the
    // format terminator instead of walking into unrelated guest memory.
    if (i + 1 === fmt.length) { write("\0"); break; }
    const match = /^%([0-]?)(\d{0,4})(?:\.(\d{0,4}))?(l{0,2})([diuxXpscf%])/.exec(fmt.slice(i));
    // Legacy printf.c emits unknown bare specifiers without consuming an arg.
    if (!match && (fmt[i + 1] === 'm' || fmt.charCodeAt(i + 1) >= 128)) { write(fmt[i + 1]); i += 2; continue; }
    if (!match) unsupported(fmt.slice(i, i + 2));
    i += match[0].length;
    const [, flag, widthText, precisionText, length, spec] = match;
    const precision = precisionText === undefined ? undefined : Number(precisionText || 0);
    if (precision !== undefined && precision > 4096) unsupported('precision too large');
    // ARM's ILP32 long is one word. AAPCS long long is an aligned pair;
    // sprintf's first vararg is R2, so even vararg indices are aligned.
    if (length && !"diuxX".includes(spec) && !(length === 'l' && spec === 'f')) unsupported(match[0]);
    const width = Number(widthText || 0);
    if (width > 4096) unsupported("width too large");
    if (spec === "%") { write("%"); continue; }
    if (length === "ll" || spec === 'f') vi = (vi + 1) & ~1;
    const value = nextVararg(vi++) >>> 0;
    const wideHi = length === "ll" || spec === 'f' ? nextVararg(vi++) >>> 0 : 0;
    let piece = "";
    if (spec === 'f') {
      if ((precision ?? 6) > 100) unsupported('float precision too large');
      const view = new DataView(new ArrayBuffer(8));
      view.setUint32(0, value, true); view.setUint32(4, wideHi, true);
      const n = view.getFloat64(0, true);
      piece = Number.isNaN(n) ? 'nan' : n === Infinity ? 'inf' : n === -Infinity ? '-inf' : n.toFixed(precision ?? 6);
    } else if (length === "ll") {
      piece = formatU64(wideHi, value, spec);
    } else if (spec === "s") {
      if (value) {
        for (let j = 0; precision === undefined || j < precision; j++) {
          const b = mem.read8((value + j) >>> 0);
          if (!b) break;
          if (j >= 65536) unsupported("unterminated string");
          piece += String.fromCharCode(b);
        }
      } else piece = "(null)";
    } else if (spec === "c") piece = String.fromCharCode(value & 255);
    else if (spec === "p") piece = `0x${value.toString(16)}`;
    else if (spec === "d" || spec === "i") piece = String(value | 0);
    else if (spec === "u") piece = String(value);
    else piece = value.toString(16);
    if (spec === "X") piece = piece.toUpperCase();
    if (precision !== undefined && 'diuxX'.includes(spec)) {
      const negative = piece.startsWith('-');
      let digits = negative ? piece.slice(1) : piece;
      if (digits === '0' && precision === 0) digits = '';
      piece = (negative ? '-' : '') + digits.padStart(precision, '0');
    }
    if (flag === "-") piece = padAlign(piece, width, " ", true);
    else if (flag === "0" && precision === undefined && spec !== "s" && spec !== "c") {
      piece = piece.charAt(0) === "-" ? "-" + padAlign(piece.slice(1), Math.max(0, width - 1), "0", false) : padAlign(piece, width, "0", false);
    } else piece = padAlign(piece, width, " ", false);
    write(piece);
  }
  mem.write8((dst + out) >>> 0, 0);
  return out;
}

/**
 * Guest-aware `mr_printf`: integer, string, character, and percent conversions.
 * `%s` reads a guest C string. Does not call host printf/sprintf.
 * Returns the formatted bytes (excluding NUL), matching mpaland length.
 */
export function guestPrintf(
  mem: GuestMemory,
  format: number,
  nextVararg: SprintfVararg,
  maxOut = 1024,
): string {
  const fmt = format >>> 0;
  let out = "";
  let vi = 0;
  for (let i = 0; i < SPRINTF_FORMAT_MAX; i++) {
    const ch = mem.read8((fmt + i) >>> 0) & 0xff;
    if (ch === 0) return out;
    if (ch !== 0x25) {
      out += String.fromCharCode(ch);
      if (out.length >= maxOut) return out.slice(0, maxOut);
      continue;
    }
    i++;
    if (i >= SPRINTF_FORMAT_MAX) unsupported("%");
    let width = 0;
    let zeroPad = false;
    let spec = mem.read8((fmt + i) >>> 0) & 0xff;
    const leftAlign = spec === 0x2d;
    if (leftAlign) spec = mem.read8((fmt + ++i) >>> 0) & 0xff;
    zeroPad = spec === 0x30;
    while (spec >= 0x30 && spec <= 0x39) {
      width = width * 10 + (spec - 0x30);
      i++;
      if (i >= SPRINTF_FORMAT_MAX) unsupported("%");
      spec = mem.read8((fmt + i) >>> 0) & 0xff;
    }
    if (width > 4096) unsupported("width too large");
    if (spec === 0) unsupported("%");
    let wide = false;
    if (spec === 0x6c) {
      spec = mem.read8((fmt + ++i) >>> 0) & 0xff;
      if (spec === 0x6c) { wide = true; spec = mem.read8((fmt + ++i) >>> 0) & 0xff; }
      if (![0x64, 0x69, 0x75, 0x78, 0x58].includes(spec)) unsupported("%l" + String.fromCharCode(spec));
    }
    let piece = "";
    if (wide) {
      // printf's first vararg is R1: skip an odd register/stack word.
      vi |= 1;
      const lo = nextVararg(vi++) >>> 0, hi = nextVararg(vi++) >>> 0;
      piece = formatU64(hi, lo, spec === 0x64 || spec === 0x69 ? "d" : spec === 0x58 ? "X" : spec === 0x78 ? "x" : "u");
    } else if (spec === 0x25) {
      piece = "%";
    } else if (spec === 0x75 || spec === 0x78 || spec === 0x58 || spec === 0x70) {
      const value = nextVararg(vi++) >>> 0;
      piece = spec === 0x75 ? value.toString(10) : (spec === 0x70 ? `0x${value.toString(16)}` : value.toString(16));
      if (spec === 0x58) piece = piece.toUpperCase();
    } else if (spec === 0x63) {
      piece = String.fromCharCode(nextVararg(vi++) & 255);
    } else if (spec === 0x64 || spec === 0x69) {
      piece = int32Decimal(nextVararg(vi++));
    } else if (spec === 0x73) {
      const p = nextVararg(vi++) >>> 0;
      if (p) {
        for (let k = 0; k < 256; k++) {
          const b = mem.read8((p + k) >>> 0) & 0xff;
          if (b === 0) break;
          piece += String.fromCharCode(b);
        }
      }
    } else {
      unsupported(`%${spec >= 0x20 && spec < 0x7f ? String.fromCharCode(spec) : spec.toString(16)}`);
    }
    if (width > piece.length) {
      const pad = zeroPad && ![0x73, 0x63, 0x25].includes(spec) ? "0" : " ";
      piece = leftAlign ? padAlign(piece, width, ' ', true) : pad === "0" && piece.charAt(0) === "-"
        ? "-" + padAlign(piece.slice(1), width - 1, pad, false) : padAlign(piece, width, pad, false);
    }
    out += piece;
    if (out.length >= maxOut) return out.slice(0, maxOut);
  }
  throw new UnknownAbiError("unterminated sprintf format", {
    family: "mr_printf",
    code: "format",
    caller: "ext",
  });
}

/** AAPCS vararg #n for `mr_printf`: 0→R1, 1→R2, 2→R3, 3+→stack. */
export function aapcsPrintfVararg(args: Uint32Array, index: number): number {
  const slot = index + 1;
  if (slot < 0 || slot >= args.length) {
    throw new UnknownAbiError(`printf vararg ${index} out of AAPCS window`, {
      family: "mr_printf",
      code: index,
      caller: "ext",
    });
  }
  return args[slot]! >>> 0;
}

/** AAPCS vararg #n: 0→R2, 1→R3, 2+→[SP+(n-2)*4] via `readAapcs` slots 2..7. */
export function aapcsSprintfVararg(args: Uint32Array, index: number, mem?: GuestMemory, sp?: number): number {
  const slot = index + 2;
  if (slot >= args.length && mem && sp !== undefined && index >= 2) {
    return mem.read32((sp + (index - 2) * 4) >>> 0) >>> 0;
  }
  if (slot < 0 || slot >= args.length) {
    throw new UnknownAbiError(`sprintf vararg ${index} out of AAPCS window`, {
      family: "sprintf_",
      code: index,
      caller: "ext",
    });
  }
  return args[slot]! >>> 0;
}
