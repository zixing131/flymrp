import { diskSpace } from "./work-path.ts";
import { installLuaGui } from './lua-gui.ts';
import { makeBitmapInfo } from './lua-bitmap-info.ts';
import { LegacyConfig } from './legacy-config.ts';
import { LuaChunkFormatError, LuaRuntimeError, NativeAbiError, VfsError } from "../err/errors.ts";
import { LuaState } from "../lua/state.ts";
import { TAG_NUMBER, TAG_TABLE, TAG_STRING, TAG_NIL, type NativeFunction } from "../lua/types.ts";
import {
  BITMAPMAX,
  MR_FAILED,
  MR_IGNORE,
  MR_FILE_CREATE,
  MR_FILE_RDONLY,
  MR_FILE_STATE_CLOSED,
  MR_FILE_STATE_NIL,
  MR_FILE_STATE_OPEN,
  MR_FILE_WRONLY,
  MR_FLAGS_BI,
  MR_FONT_MEDIUM,
  MR_SEEK_SET,
  MR_SUCCESS,
  MR_VERSION,
  MR_NET_ID_MOBILE,
  MR_SOUND_WAV,
  MR_SOUND_MIDI,
  SHORT_TYPENAMES,
  SPRITEMAX,
  TILEMAX,
} from "./constants.ts";
import { persistRoot, unpersistRoot } from "./persist.ts";
import { gb16Glyph, gbkBytesToUcs2, ucs2ToGbk } from "./font.ts";
import { binToBytes } from "../mrp/archive.ts";
import { makeRgb565, DRAW_BM_COPY, DRAW_BM_TRANSPARENT, MR_SPRITE_INDEX_MASK, MR_SPRITE_TRANSPARENT } from "./graphics.ts";
import { lcgNext } from "./profile.ts";
import type { MythroadRuntime } from "./runtime.ts";

export function installNatives(rt: MythroadRuntime): void {
  const L = rt.lua.L;
  const reg = (name: string, fn: NativeFunction) => L.register(name, fn);
  installLuaGui(rt);

  const c2u: NativeFunction = Ls => {
    const chars = gbkBytesToUcs2(binToBytes(Ls.checkString(1).s.split('\0')[0]));
    const bytes = new Uint8Array((chars.length + 1) * 2);
    chars.forEach((ch,i) => { bytes[i*2]=ch>>>8; bytes[i*2+1]=ch&255; });
    Ls.pushString(bytes); return 1;
  };
  reg('c2u', c2u); L.setTableFn(L.getGlobal('string').num, 'c2u', c2u);
  reg("_strCom", rt.strCom);
  reg("TestCom1", rt.strCom);
  reg("GetNetworkID", Ls => { Ls.pushInteger(MR_NET_ID_MOBILE); return 1; });
  const phone = L.newTable();
  L.setTableFn(phone, 'getNetID', Ls => { Ls.pushInteger(MR_NET_ID_MOBILE); return 1; });
  L.setGlobal('phone', TAG_TABLE, phone);
  // mythroad.c MRF_platEx returns (binary output, platform status). Old Lua
  // games query the four little-endian font metric bytes before drawing menus.
  reg("_platEx", (Ls) => {
    const code = Ls.optNumber(1, 0) | 0;
    if (code === 1201) { Ls.pushString(new Uint8Array([16, 16, 8, 16])); Ls.pushInteger(MR_SUCCESS); return 2; }
    // The reference DSM port returns MR_IGNORE for keypad/title probes
    // and the legacy vendor probe 2200 (no case in its platform switch).
    if (code === 1210 || code === 1221 || code === 2200) { Ls.pushString(''); Ls.pushInteger(MR_IGNORE); return 2; }
    if (code === 1204) {
      const input = Ls.checkString(2).s;
      const status = rt.workPath.switch(input);
      Ls.pushString(input.charAt(0).toUpperCase() === 'Y' ? rt.workPath.query() + '\0' : '');
      Ls.pushInteger(status); return 2;
    }
    if (code === 1305) {
      const values = diskSpace(Ls.checkString(2).s);
      if (!values) { Ls.pushString(''); Ls.pushInteger(MR_IGNORE); return 2; }
      const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
      values.forEach((value, index) => view.setUint32(index * 4, value, true));
      Ls.pushString(bytes); Ls.pushInteger(MR_SUCCESS); return 2;
    }
    throw new NativeAbiError(`unsupported Lua _platEx code ${code}`);
  });
  const sounds = new Map<number, { data: Uint8Array; type: number }>();
  const soundIndex = (Ls: LuaState): number => {
    const index = (Ls.optNumber(1, 0) | 0) & 0xffff;
    if (index >= 5) throw new LuaRuntimeError(`Sound index ${index} invalid`);
    return index;
  };
  const setSound = (index: number, name: string, type: number): void => {
    sounds.delete(index);
    if (name.startsWith("*")) return;
    const data = rt.vfs.readFile(name);
    if (!data) throw new LuaRuntimeError(`SoundSet cannot read ${name}`);
    sounds.set(index, { data, type });
  };
  const playSound = (index: number, loop: number): void => {
    const sound = sounds.get(index);
    if (sound && rt.soundOn && rt.state === 1) rt.onPlaySound?.(sound.type, sound.data, loop);
  };
  reg("SoundSet", Ls => { setSound(soundIndex(Ls), Ls.checkString(2).s, Ls.optNumber(3, MR_SOUND_WAV)); return 0; });
  reg("SoundPlay", Ls => { playSound(soundIndex(Ls), Ls.top > Ls.base + 1 && !Ls.isFalse(Ls.base + 1) ? 1 : 0); return 0; });
  reg("SoundStop", Ls => { const sound = sounds.get(soundIndex(Ls)); if (sound) rt.onStopSound?.(sound.type); return 0; });
  reg("BgMusicSet", Ls => { setSound(0, Ls.checkString(1).s, Ls.optNumber(2, MR_SOUND_MIDI)); return 0; });
  reg("BgMusicStart", Ls => { playSound(0, Ls.top === Ls.base || !Ls.isFalse(Ls.base) ? 1 : 0); return 0; });
  reg("BgMusicStop", () => { const sound = sounds.get(0); if (sound) rt.onStopSound?.(sound.type); return 0; });
  reg("print", (Ls) => {
    const parts: string[] = [];
    for (let i = Ls.base; i < Ls.top; i++) {
      parts.push(Ls.tags[i] === TAG_STRING ? Ls.strings[Ls.nums[i]] : Ls.tags[i] === TAG_NUMBER ? String(Ls.nums[i]) : Ls.tags[i] === TAG_NIL ? "nil" : `[type ${Ls.tags[i]}]`);
    }
    rt.logs.push(parts.join("\t"));
    if (rt.logs.length > 256) rt.logs.shift();
    return 0;
  });
  reg("_error", (Ls) => { throw new LuaRuntimeError(Ls.checkString(1).s); });
  reg("dofile", (Ls) => {
    const name = Ls.checkString(1).s;
    const bytes = rt.vfs.readFile(name);
    if (!bytes) throw new LuaRuntimeError(`cannot read ${name}`);
    const top = Ls.top;
    rt.lua.runBytes(bytes);
    return Ls.top - top;
  });
  reg('loadfile', Ls => {
    const name = Ls.checkString(1).s, bytes = rt.vfs.readFile(name);
    if (!bytes) { Ls.pushNil(); Ls.pushString(`cannot read ${name}`); return 2; }
    try { rt.lua.loadBytes(bytes); return 1; }
    catch (error) {
      if (!(error instanceof LuaChunkFormatError)) throw error;
      Ls.pushNil(); Ls.pushString(error.message); return 2;
    }
  });
  reg("_textWidth", (Ls) => {
    const unicode = Ls.optNumber(2, 0) !== 0;
    const slot = Ls.checkArg(1);
    let chars: number[];
    if (Ls.tags[slot] === TAG_STRING) {
      const bytes = binToBytes(Ls.checkString(1).s);
      chars = unicode ? Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) => (bytes[i * 2] << 8) | bytes[i * 2 + 1]) : gbkBytesToUcs2(bytes);
    } else {
      const ch = Ls.optNumber(1, 0) & 0xffff;
      chars = unicode || ch < 128 ? [ch] : gbkBytesToUcs2(new Uint8Array([ch >>> 8, ch & 255]));
    }
    let width = 0, height = 0;
    for (const ch of chars) {
      if (!ch) break;
      const glyph = gb16Glyph(ch);
      width = (width + glyph.width) & 0xffff;
      height = Math.max(height, glyph.height);
    }
    Ls.pushInteger(width); Ls.pushInteger(height);
    return 2;
  });

  const com = makeCom(rt);
  reg("_com", com);
  reg("TestCom", com);

  const sys = makeGetSysInfo(rt);
  reg("GetSysInfo", sys);
  const dt = makeGetDatetime(rt);
  reg("GetDatetime", dt);

  const tStart = makeTimerStart(rt);
  const tStop = makeTimerStop(rt);
  reg("TimerStart", tStart);
  reg("_timerStart", tStart);
  reg("TimerStop", tStop);
  reg("_timerStop", tStop);

  const drawText = makeDrawText(rt);
  reg("_drawText", drawText);
  reg("DrawText", drawText);
  reg("_drawTextEx", makeDrawTextEx(rt));
  const drawRect = makeDrawRect(rt);
  reg("_drawRect", drawRect);
  reg("DrawRect", drawRect);
  const clear = makeClear(rt);
  reg("_clearScr", clear);
  reg("ClearScreen", clear);
  const dispUp = makeDispUp(rt);
  reg("_dispUp", dispUp);
  const dispUpEx = makeDispUpEx(rt);
  reg("_dispUpEx", dispUpEx);
  reg("DispUpEx", dispUpEx);
  const eff = makeEff(rt);
  reg("_effSetCon", eff);
  reg("EffSetCon", eff);
  const line = makeLine(rt);
  reg("_drawLine", line);
  reg("DrawLine", line);
  const point = makePoint(rt);
  reg("_drawPoint", point);
  reg("DrawPoint", point);

  reg("BitmapLoad", makeBitmapLoad(rt));
  reg("_bmpInfo", makeBitmapInfo(rt));
  reg("BitmapShow", makeBitmapShow(rt));
  reg("BitmapNew", makeBitmapNew(rt));
  reg("BitmapDraw", makeBitmapDraw(rt));
  reg('BmGetScr', Ls => {
    const i = Ls.optNumber(1, 0) & 0xffff;
    if (i >= BITMAPMAX) throw new LuaRuntimeError(`BmGetScr:index ${i} invalid!`);
    rt.bitmaps[i] = { w: rt.screenW, h: rt.screenH, loaded: true, name: '', pixels: rt.screen.pixels.slice() };
    return 0;
  });
  reg("SpriteSet", makeSpriteSet(rt));
  reg("SpriteDraw", makeSpriteDraw(rt));
  reg('SpriteCheck', Ls => {
    const i = Ls.optNumber(1, 0) & 0xffff, frame = Ls.optNumber(2, 0) & 0xffff;
    const bitmap = rt.bitmaps[i], h = rt.sprites[i]?.h ?? 0;
    if (i >= SPRITEMAX || !bitmap?.pixels || h <= 0) throw new LuaRuntimeError('SpriteCheck: invalid sprite');
    const offset = frame * bitmap.w * h;
    if (offset + bitmap.w * h > bitmap.pixels.length) throw new LuaRuntimeError('SpriteCheck: frame bounds exceeded');
    const rgb = Ls.optNumber(5, 0) >>> 0;
    Ls.pushInteger(rt.screen.bitmapCheck(index => bitmap.pixels![offset + index],
      Ls.optNumber(3, 0) << 16 >> 16, Ls.optNumber(4, 0) << 16 >> 16,
      bitmap.w, h, bitmap.pixels[0], makeRgb565((rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255)));
    return 1;
  });
  reg("TileSet", makeTileSet(rt));
  reg("TileSetRect", makeTileSetRect(rt));
  reg("TileDraw", makeTileDraw(rt));
  reg("GetTile", makeTileCell(rt, false));
  reg("SetTile", makeTileCell(rt, true));
  reg("TileLoad", Ls => {
    const i = Ls.optNumber(1, 0) & 0xffff, tile = rt.tiles[i];
    if (i >= TILEMAX || !tile) throw new LuaRuntimeError("TileLoad: invalid tile");
    const bytes = rt.vfs.readFile(Ls.checkString(2).s);
    if (!bytes || bytes.length !== tile.w * tile.h * 2) throw new LuaRuntimeError("TileLoad: map size mismatch");
    tile.cells = allocatedTileCells(tile.w, tile.h);
    tile.cells.set(pixels565(bytes)); return 0;
  });
  reg("TileShift", Ls => {
    const tile = rt.tiles[Ls.optNumber(1, 0) & 0xffff], mode = Ls.optNumber(2, 0) & 0xffff;
    if (!tile?.cells) throw new LuaRuntimeError("TileShift: missing map");
    const cells = tile.cells, w = tile.w, h = tile.h;
    if (mode === 0) cells.copyWithin(0, w, w * h);
    else if (mode === 1) cells.copyWithin(w, 0, w * (h - 1));
    else if (mode === 2 || mode === 3) for (let y = 0; y < h; y++) {
      const start = y * w;
      if (mode === 2) cells.copyWithin(start, start + 1, start + w);
      else cells.copyWithin(start + 1, start, start + w - 1);
    }
    return 0;
  });

  const save = makeSaveTable(rt);
  const load = makeLoadTable(rt);
  reg("SaveTable", save);
  reg("LoadTable", load);
  // init0.mr may replace SaveTable/LoadTable with Lua wrappers around _store.
  // Both entry points must use the same binary persistence format.
  const store = L.newTable();
  L.setTableFn(store, "store", Ls => {
    Ls.checkTable(1); Ls.checkTable(2);
    Ls.pushString(persistRoot(Ls, Ls.nums[Ls.absindex(1)], Ls.slot(Ls.absindex(2))));
    return 1;
  });
  L.setTableFn(store, "load", Ls => {
    Ls.checkTable(1);
    const root = unpersistRoot(Ls, Ls.nums[Ls.absindex(1)], binToBytes(Ls.checkString(2).s));
    Ls.pushSlot(root); return 1;
  });
  L.setGlobal("_store", TAG_TABLE, store);
  const runFile = makeRunFile(rt);
  reg("RunFile", runFile);
  reg("_runFile", runFile);
  reg('_loadPack', Ls => { Ls.pushString(rt.selectReadPack(Ls.checkString(1).s)); return 1; });
  // Alternate names exported by the same reference C functions.
  for (const [alias, name] of [['_bmpLoad','BitmapLoad'],['_bmpShow','BitmapShow'],['_bmpNew','BitmapNew'],['_bmpDraw','BitmapDraw'],['_bmpGetScr','BmGetScr']]) {
    const fn = L.getGlobal(name); L.setGlobal(alias, fn.tag, fn.num);
  }

  const exitFn = makeExit(rt);
  reg("Exit", exitFn);
  reg("_exit", exitFn);

  reg("_t", typeShort);
  reg("type", typeLong);
  reg("_gc", makeGc(rt));
  reg("_rand", makeRand(rt));
  reg("GetRand", makeRand(rt));
  reg("_mod", modFn);
  reg("mod", modFn);
  reg("_and", andFn);
  reg("_or", orFn);
  reg("_xor", xorFn);
  reg("_not", notFn);

  installFileLib(rt);
  installSysLib(rt, sys, dt);
}

function makeCom(rt: MythroadRuntime): NativeFunction {
  const config = new LegacyConfig(() => rt.appFs.file('dsm.cfg'), bytes => rt.setUserFile('dsm.cfg',bytes));
  return (L) => {
    const a0 = L.optNumber(1, 0) | 0;
    const a1 = L.optNumber(2, 0) | 0;
    let ret = 0;
    switch (a0) {
      case 1:
        ret = rt.clock | 0;
        break;
      case 100:
        ret = rt.profile.memMin;
        break;
      case 101:
        ret = rt.profile.memTop;
        break;
      case 102:
        ret = rt.profile.memLeft;
        break;
      case 200:
        if (rt.shakeOn && rt.canRun()) rt.onVibrate?.(Math.max(0, a1));
        break;
      case 201:
        rt.onVibrate?.(0);
        break;
      case 300:
        rt.soundOn = a1 !== 0;
        break;
      case 301:
        rt.shakeOn = a1 !== 0;
        break;
      case 302:
        // Legacy network-clock probe; browser networking is offline by policy.
        ret = 0;
        break;
      case 400:
        rt.sleeps.push(a1);
        break;
      case 401: {
        ret = rt.screenW;
        rt.screenW = a1;
        break;
      }
      case 403:
        rt.gcThreshold = a1;
        rt.gcCalls++;
        break;
      case 406: {
        ret = rt.screenH;
        rt.screenH = a1;
        break;
      }
      case 407:
        rt.timers.runWithoutPause = a1;
        break;
      case 500: ret = config.load(); break;
      case 501: {
        const bytes = config.get(a1,L.optNumber(3,0)|0);
        if (bytes) L.pushString(bytes); else L.pushNil();
        return 1;
      }
      case 502: {
        const length=L.optNumber(3,0)|0, bytes=binToBytes(L.checkString(4).s);
        ret=length<0||length>bytes.length?MR_FAILED:config.set(a1,bytes.subarray(0,length));break;
      }
      case 503: ret=config.bytes[5];break;
      case 504: ret=config.save();break;
      case 3629:
        if (a1 === 2913) rt.bi |= MR_FLAGS_BI;
        break;
      default:
        return rt.unknownAbi("_com", a0, L);
    }
    L.pushInteger(ret);
    return 1;
  };
}

function makeGetSysInfo(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    L.optNumber(1, MR_FONT_MEDIUM);
    const id = L.pushTable();
    L.setTableNum(id, "vmver", rt.profile.vmver || MR_VERSION);
    L.setTableNum(id, "ScreenW", rt.screenW);
    L.setTableNum(id, "ScreenH", rt.screenH);
    L.setTableNum(id, "scrw", rt.screenW);
    L.setTableNum(id, "scrh", rt.screenH);
    L.setTableNum(id, "ChineseWidth", rt.profile.chw);
    L.setTableNum(id, "ChineseHigh", rt.profile.chh);
    L.setTableNum(id, "chw", rt.profile.chw);
    L.setTableNum(id, "chh", rt.profile.chh);
    L.setTableNum(id, "EnglishWidth", rt.profile.ascw);
    L.setTableNum(id, "EnglishHigh", rt.profile.asch);
    L.setTableNum(id, "ascw", rt.profile.ascw);
    L.setTableNum(id, "asch", rt.profile.asch);
    L.setTableStr(id, "PackName", rt.packName);
    L.setTableStr(id, "packname", rt.packName);
    L.setTableStr(id, "hsman", rt.profile.hsman);
    L.setTableStr(id, "hstype", rt.profile.hstype);
    L.setTableStr(id, "IMEI", rt.profile.IMEI);
    L.setTableStr(id, "IMSI", rt.profile.IMSI);
    L.setTableNum(id, "hsver", rt.profile.hsver);
    return 1;
  };
}

function makeGetDatetime(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const d = rt.profile.datetime;
    const id = L.pushTable();
    L.setTableNum(id, "year", d.year);
    L.setTableNum(id, "mon", d.month);
    L.setTableNum(id, "day", d.day);
    L.setTableNum(id, "hour", d.hour);
    L.setTableNum(id, "min", d.minute);
    L.setTableNum(id, "sec", d.second);
    return 1;
  };
}

function makeTimerStart(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    L.optNumber(1, 0);
    const ms = L.optNumber(2, 0) | 0;
    const name = L.optString(3, "dealtimer");
    rt.timers.start(rt.clock, ms, name, rt.state);
    return 0;
  };
}

function makeTimerStop(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    L.optNumber(1, 0);
    rt.timers.stop();
    return 0;
  };
}

function makeDrawText(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const text = L.optString(1, "");
    const x = L.optNumber(2, 0) | 0;
    const y = L.optNumber(3, 0) | 0;
    const r = L.optNumber(4, 0) | 0;
    const g = L.optNumber(5, 0) | 0;
    const b = L.optNumber(6, 0) | 0;
    const uni = L.optNumber(7, 0) ? 1 : 0;
    const font = L.optNumber(8, MR_FONT_MEDIUM) | 0;
    const bytes = binToBytes(text);
    const chars = uni ? Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) =>
      bytes[i * 2] << 8 | bytes[i * 2 + 1]) : gbkBytesToUcs2(bytes);
    let chx = x;
    for (const ch of chars) {
      if (!ch) break;
      const glyph = gb16Glyph(ch);
      rt.screen.drawGlyph(chx, y, glyph.width, glyph.height, glyph.bits, r, g, b);
      chx += glyph.width;
    }
    rt.gfx.drawText(text, x, y, r, g, b, uni, font);
    return 0;
  };
}

/** mythroad.c MRF_DrawTextEx: rectangle dimensions, wrapping and UCS-2 byte offset. */
function makeDrawTextEx(rt: MythroadRuntime): NativeFunction {
  return L => {
    const bytes = binToBytes(L.optString(1, ""));
    const i16 = (n: number) => (n << 16) >> 16;
    const x = i16(L.optNumber(2, 0)), y = i16(L.optNumber(3, 0));
    // The reference renderer uses x/y as origin, rather than rect.x/rect.y.
    const w = i16(L.optNumber(6, 0)), h = i16(L.optNumber(7, 0));
    const r = L.optNumber(8, 0) & 255, g = L.optNumber(9, 0) & 255, b = L.optNumber(10, 0) & 255;
    const flag = L.optNumber(11, 3) | 0;
    const chars = flag & 1 ? Array.from({ length: bytes.length >> 1 }, (_, i) => bytes[i * 2] << 8 | bytes[i * 2 + 1]) : gbkBytesToUcs2(bytes);
    let cx = x & 0xffff, cy = y & 0xffff, lineHeight = 0, end = 0, i = 0;
    for (; i < chars.length && chars[i]; i++) {
      const ch = chars[i], glyph = gb16Glyph(ch === 10 || ch === 13 ? 32 : ch);
      if (flag & 2) {
        if (cx + glyph.width > x + w || ch === 10) {
          if (cy + lineHeight < y + h) end = i * 2;
          cx = x & 0xffff; cy = (cy + lineHeight + 2) & 0xffff; lineHeight = 0;
          if (cy > y + h) break;
        }
        lineHeight = Math.max(lineHeight, glyph.height);
      } else {
        if (cx > x + w || ch === 10) break;
        if (cx + glyph.width > x + w) end = i * 2;
      }
      if (ch === 10 || ch === 13) continue;
      rt.screen.drawGlyph(cx, cy, Math.max(0, Math.min(glyph.width, x + w - cx)), Math.max(0, Math.min(glyph.height, y + h - cy)), glyph.bits, r, g, b);
      cx = (cx + glyph.width) & 0xffff;
    }
    if (i === chars.length || !chars[i]) {
      if (flag & 2 ? cy + lineHeight < y + h : cx <= x + w) end = i * 2;
    }
    L.pushInteger(end); return 1;
  };
}

function makeDrawRect(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const x = L.optNumber(1, 0) | 0;
    const y = L.optNumber(2, 0) | 0;
    const w = L.optNumber(3, 0) | 0;
    const h = L.optNumber(4, 0) | 0;
    const r = L.optNumber(5, 0) | 0;
    const g = L.optNumber(6, 0) | 0;
    const b = L.optNumber(7, 0) | 0;
    rt.screen.drawRect(x, y, w, h, r, g, b);
    rt.gfx.drawRect(x, y, w, h, r, g, b);
    return 0;
  };
}

function makeClear(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const r = L.optNumber(1, 0) | 0;
    const g = L.optNumber(2, 0) | 0;
    const b = L.optNumber(3, 0) | 0;
    rt.screen.drawRect(0, 0, rt.screenW, rt.screenH, r, g, b);
    rt.gfx.clear(r, g, b);
    return 0;
  };
}

function makeDispUp(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    rt.gfx.flush(
      L.optNumber(1, 0) | 0,
      L.optNumber(2, 0) | 0,
      L.optNumber(3, 0) | 0,
      L.optNumber(4, 0) | 0,
      L.optNumber(5, BITMAPMAX) | 0,
    );
    return 0;
  };
}

function makeDispUpEx(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    if (rt.canRun()) {
      rt.gfx.flush(L.optNumber(1, 0) | 0, L.optNumber(2, 0) | 0, L.optNumber(3, 0) | 0, L.optNumber(4, 0) | 0, BITMAPMAX);
    }
    return 0;
  };
}

function makeEff(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    rt.screen.effSetCon(
      L.optNumber(1, 0), L.optNumber(2, 0), L.optNumber(3, 0), L.optNumber(4, 0),
      L.optNumber(5, 0), L.optNumber(6, 0), L.optNumber(7, 0),
    );
    rt.gfx.effSetCon(
      L.optNumber(1, 0) | 0,
      L.optNumber(2, 0) | 0,
      L.optNumber(3, 0) | 0,
      L.optNumber(4, 0) | 0,
      L.optNumber(5, 0) | 0,
      L.optNumber(6, 0) | 0,
      L.optNumber(7, 0) | 0,
    );
    return 0;
  };
}

function makeLine(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const x1 = L.optNumber(1, 0) | 0;
    const y1 = L.optNumber(2, 0) | 0;
    const x2 = L.optNumber(3, 0) | 0;
    const y2 = L.optNumber(4, 0) | 0;
    const r = L.optNumber(5, 0) | 0;
    const g = L.optNumber(6, 0) | 0;
    const b = L.optNumber(7, 0) | 0;
    rt.screen.drawLine(x1, y1, x2, y2, r, g, b);
    rt.gfx.drawLine(x1, y1, x2, y2, r, g, b);
    return 0;
  };
}

function makePoint(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const x = L.optNumber(1, 0) | 0;
    const y = L.optNumber(2, 0) | 0;
    const r = L.optNumber(3, 0) | 0;
    const g = L.optNumber(4, 0) | 0;
    const b = L.optNumber(5, 0) | 0;
    rt.screen.drawPoint565(x, y, makeRgb565(r, g, b));
    rt.gfx.drawPoint(x, y, r, g, b);
    return 0;
  };
}

function makeExit(rt: MythroadRuntime): NativeFunction {
  return () => rt.exitGuest();
}

function typeShort(L: LuaState): number {
  const i = L.checkAny(1);
  L.pushString(SHORT_TYPENAMES[L.tags[i]!] ?? "no value");
  return 1;
}

function typeLong(L: LuaState): number {
  const i = L.checkAny(1);
  const names = ["nil", "boolean", "object", "number", "string", "table", "function", "object", "thread"];
  L.pushString(names[L.tags[i]!] ?? "no value");
  return 1;
}

function makeGc(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    rt.gcThreshold = L.optNumber(1, 0) | 0;
    rt.gcCalls++;
    return 0;
  };
}

function makeRand(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const n = L.optNumber(1, 0) | 0;
    if (n === 0) throw new LuaRuntimeError("_rand modulo 0");
    rt.randSeed = lcgNext(rt.randSeed);
    L.pushInteger((rt.randSeed >>> 0) % n);
    return 1;
  };
}

function modFn(L: LuaState): number {
  const n = L.optNumber(1, 0) | 0;
  const m = L.optNumber(2, 0) | 0;
  if (m === 0) throw new LuaRuntimeError("_mod modulo 0");
  L.pushInteger(n % m);
  return 1;
}
function andFn(L: LuaState): number {
  L.pushInteger((L.optNumber(1, 0) | 0) & (L.optNumber(2, 0) | 0));
  return 1;
}
function orFn(L: LuaState): number {
  L.pushInteger((L.optNumber(1, 0) | 0) | (L.optNumber(2, 0) | 0));
  return 1;
}
function xorFn(L: LuaState): number {
  L.pushInteger((L.optNumber(1, 0) | 0) ^ (L.optNumber(2, 0) | 0));
  return 1;
}
function notFn(L: LuaState): number {
  L.pushInteger(L.optNumber(1, 0) | 0 ? 0 : 1);
  return 1;
}

function installFileLib(rt: MythroadRuntime): void {
  const L = rt.lua.L;
  const fileId = L.newTable();
  L.setTableFn(fileId, "open", (Ls) => fileOpen(rt, Ls));
  L.setTableFn(fileId, "close", (Ls) => fileClose(rt, Ls));
  L.setTableFn(fileId, "state", (Ls) => fileState(rt, Ls));
  L.setTableFn(fileId, "readAll", (Ls) => fileReadAll(rt, Ls));
  L.setGlobal("file", TAG_TABLE, fileId);
}

function fdOf(L: LuaState): number {
  const i = L.checkArg(1);
  if (L.tags[i] === TAG_NUMBER) return L.nums[i]!;
  if (L.tags[i] === TAG_TABLE) {
    const t = L.tables[L.nums[i]!]!;
    const v = t.getStr(L.internStr("_fd"));
    if (v.tag !== TAG_NUMBER) throw new VfsError("file handle missing _fd");
    return v.num;
  }
  throw new NativeAbiError("argument #1 must be a file handle");
}

function pushHandle(rt: MythroadRuntime, L: LuaState, fd: number): void {
  const id = L.pushTable();
  L.setTableNum(id, "_fd", fd);
  L.setTableFn(id, "read", (Ls) => fileRead(rt, Ls));
  L.setTableFn(id, "seek", (Ls) => fileSeek(rt, Ls));
  L.setTableFn(id, "write", (Ls) => fileWrite(rt, Ls));
  L.setTableFn(id, "close", (Ls) => fileClose(rt, Ls));
}

function fileOpen(rt: MythroadRuntime, L: LuaState): number {
  const name = L.checkString(1).s;
  const mode = L.optNumber(2, MR_FILE_RDONLY) | 0;
  const fd = rt.vfs.open(name, mode);
  if (fd === 0) {
    L.pushNil();
    L.pushString(`file err: ${name}: ${rt.vfs.lastErrno}`);
    L.pushInteger(rt.vfs.lastErrno);
    return 3;
  }
  pushHandle(rt, L, fd);
  return 1;
}

function fileClose(rt: MythroadRuntime, L: LuaState): number {
  const fd = fdOf(L);
  const ok = rt.vfs.close(fd) === 0;
  if (ok) {
    L.pushBoolean(true);
    return 1;
  }
  L.pushNil();
  L.pushString(`file err:${rt.vfs.lastErrno}`);
  L.pushInteger(rt.vfs.lastErrno);
  return 3;
}

function fileState(rt: MythroadRuntime, L: LuaState): number {
  const i = L.absindex(1);
  if (i >= L.top) {
    L.pushInteger(MR_FILE_STATE_NIL);
    return 1;
  }
  try {
    const fd = fdOf(L);
    L.pushInteger(rt.vfs.fdOpen[fd] ? MR_FILE_STATE_OPEN : MR_FILE_STATE_CLOSED);
  } catch {
    L.pushInteger(MR_FILE_STATE_NIL);
  }
  return 1;
}

function fileReadAll(rt: MythroadRuntime, L: LuaState): number {
  const name = L.checkString(1).s;
  const data = rt.vfs.readFile(name);
  if (!data) return 0;
  L.pushString(data);
  return 1;
}

function fileRead(rt: MythroadRuntime, L: LuaState): number {
  const fd = fdOf(L);
  const n = L.optNumber(2, 0x7fffffff) | 0;
  L.pushString(rt.vfs.read(fd, n));
  return 1;
}

function fileSeek(rt: MythroadRuntime, L: LuaState): number {
  const fd = fdOf(L);
  const whence = L.optNumber(2, MR_SEEK_SET) | 0;
  const offset = L.optNumber(3, 0) | 0;
  const op = rt.vfs.seek(fd, offset, whence);
  if (op !== 0) {
    L.pushNil();
    L.pushString(`file err:${rt.vfs.lastErrno}`);
    L.pushInteger(rt.vfs.lastErrno);
    return 3;
  }
  L.pushInteger(offset);
  return 1;
}

function fileWrite(rt: MythroadRuntime, L: LuaState): number {
  const fd = fdOf(L);
  const s = L.checkString(2).s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  rt.vfs.write(fd, bytes);
  L.pushBoolean(true);
  return 1;
}

function installSysLib(rt: MythroadRuntime, sysInfo: NativeFunction, dt: NativeFunction): void {
  const L = rt.lua.L;
  const id = L.newTable();
  L.setTableFn(id, "getInfo", sysInfo);
  L.setTableFn(id, "datetime", dt);
  L.setTableFn(id, "getuptime", (Ls) => {
    Ls.pushInteger(rt.clock | 0);
    return 1;
  });
  L.setTableFn(id, "getFileLen", (Ls) => {
    Ls.pushInteger(rt.vfs.size(Ls.checkString(1).s));
    return 1;
  });
  L.setTableFn(id, "getfilelen", (Ls) => {
    Ls.pushInteger(rt.vfs.size(Ls.checkString(1).s));
    return 1;
  });
  L.setTableFn(id, "getFileInfo", (Ls) => {
    const name = Ls.checkString(1).s;
    Ls.pushInteger(rt.appFs.info(name) ?? rt.vfs.info(name));
    return 1;
  });
  L.setTableFn(id, "getfileinfo", (Ls) => {
    const name = Ls.checkString(1).s;
    Ls.pushInteger(rt.appFs.info(name) ?? rt.vfs.info(name));
    return 1;
  });
  const remove: NativeFunction = Ls => {
    const name = Ls.checkString(1).s;
    const ram = rt.vfs.removeRam(name), external = rt.appFs.remove(name) === MR_SUCCESS;
    if (ram || external) { Ls.pushBoolean(true); return 1; }
    Ls.pushNil(); Ls.pushString(`file err: ${name}: 2`); Ls.pushInteger(2); return 3;
  };
  L.setTableFn(id, 'rm', remove); L.setTableFn(id, 'remove', remove);
  for (const [name, operation] of [['mkDir', 'mkdir'], ['rmDir', 'rmdir']] as const) {
    const fn: NativeFunction = Ls => {
      const path = Ls.checkString(1).s;
      if (rt.appFs[operation](path) === MR_SUCCESS) { Ls.pushBoolean(true); return 1; }
      Ls.pushNil(); Ls.pushString(`file err: ${path}: 2`); Ls.pushInteger(2); return 3;
    };
    L.setTableFn(id, name, fn); L.setTableFn(id, operation, fn);
  }
  const searches = new Map<number, string[]>();
  let nextSearch = 1;
  const pushName = (Ls: LuaState, name: string) => Ls.pushString(ucs2ToGbk(Array.from(name, c => c.charCodeAt(0))));
  const findStart: NativeFunction = Ls => {
    const names = rt.appFs.list(Ls.checkString(1).s, [rt.packName]);
    if (!names) { Ls.pushInteger(MR_FAILED); Ls.pushString(''); return 2; }
    const handle = nextSearch++; searches.set(handle, names);
    Ls.pushInteger(handle); pushName(Ls, names.shift() ?? ''); return 2;
  };
  const findNext: NativeFunction = Ls => {
    const name = searches.get(Ls.optNumber(1, 0))?.shift();
    if (name === undefined) Ls.pushNil(); else pushName(Ls, name);
    return 1;
  };
  const findStop: NativeFunction = Ls => { Ls.pushInteger(searches.delete(Ls.optNumber(1, 0)) ? MR_SUCCESS : MR_FAILED); return 1; };
  for (const [name, fn] of [['findStart', findStart], ['findNext', findNext], ['findStop', findStop]] as const) {
    L.setTableFn(id, name, fn); L.setTableFn(id, name.toLowerCase(), fn);
  }
  L.setGlobal("sys", TAG_TABLE, id);
}

function makeSaveTable(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const filename = L.optString(3, "");
    L.settop(2);
    L.checkTable(1);
    const permsId = L.nums[L.absindex(1)]!;
    const root = L.slot(L.absindex(2));
    const fd = rt.vfs.open(filename, MR_FILE_WRONLY | MR_FILE_CREATE);
    if (fd === 0) return 0;
    const bytes = persistRoot(L, permsId, root);
    rt.vfs.write(fd, bytes);
    rt.vfs.close(fd);
    L.settop(0);
    L.pushInteger(MR_SUCCESS);
    return 1;
  };
}

function makeLoadTable(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const filename = L.optString(2, "");
    L.settop(2);
    L.settop(1);
    const permsId = L.nums[L.absindex(1)]!;
    L.checkTable(1);
    const fd = rt.vfs.open(filename, MR_FILE_RDONLY);
    if (fd === 0) {
      L.settop(1);
      return 1;
    }
    const data = rt.vfs.read(fd, 0x7fffffff);
    rt.vfs.close(fd);
    const obj = unpersistRoot(L, permsId, data);
    L.settop(0);
    L.pushSlot(obj);
    return 1;
  };
}

function makeRunFile(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const pack = L.optString(1, "");
    const file = L.optString(2, "");
    const param = L.optString(3, "");
    rt.requestRunFile(pack, file, param);
    return 0;
  };
}

function makeBitmapLoad(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    const filename = L.optString(2, "");
    const x = L.optNumber(3, 0) | 0;
    const y = L.optNumber(4, 0) | 0;
    const w = L.optNumber(5, 0) | 0;
    const h = L.optNumber(6, 0) | 0;
    const maxw = L.optNumber(7, 0) | 0;
    if (!(rt.bi & MR_FLAGS_BI)) throw new LuaRuntimeError(`BitmapLoad:cannot read File "${filename}"!`);
    if (i > BITMAPMAX) throw new LuaRuntimeError(`BitmapLoad:index ${i} invalid!`);
    if (filename.charCodeAt(0) === 42) { delete rt.bitmaps[i]; return 0; }
    const bytes = rt.vfs.readFile(filename);
    if (!bytes) throw new LuaRuntimeError(`BitmapLoad ${i}:cannot read "${filename}"!`);
    const source = pixels565(bytes), stride = maxw || w;
    const pixels = checkedPixels(w, h);
    // MRF_BitmapLoad retains the raw file for whole-image loads, even when
    // its declared height exceeds the available rows. Keep those bytes only;
    // bitmap readers already bound accesses with a zero fallback.
    const wholeImage = x === 0 && y === 0 && w === maxw;
    if (!wholeImage && (x < 0 || y < 0 || x + w > stride || (y + h - 1) * stride + x + w > source.length)) throw new LuaRuntimeError("BitmapLoad: image bounds exceed resource");
    if (!wholeImage) for (let row = 0; row < h; row++) pixels.set(source.subarray((y + row) * stride + x, (y + row) * stride + x + w), row * w);
    rt.bitmaps[i] = { w, h, loaded: true, name: filename, pixels: wholeImage ? source : pixels };
    rt.gfx.image({ op: "image", sub: "load", i, filename, x, y, w, h, maxw });
    return 0;
  };
}

function makeBitmapShow(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    const x = L.optNumber(2, 0) | 0;
    const y = L.optNumber(3, 0) | 0;
    const rop = L.optNumber(4, DRAW_BM_COPY) | 0;
    const sx = L.optNumber(5, 0) | 0;
    const sy = L.optNumber(6, 0) | 0;
    const slot = rt.bitmaps[i];
    const w = L.absindex(7) < L.top && L.optNumber(7, -1) !== -1 ? L.optNumber(7, -1) | 0 : (slot?.w ?? -1);
    const h = L.absindex(8) < L.top && L.optNumber(8, -1) !== -1 ? L.optNumber(8, -1) | 0 : (slot?.h ?? -1);
    if (slot?.pixels) rt.screen.drawBitmapRop(index => slot.pixels![index] ?? 0, x, y, w, h, rop, slot.pixels[0], sx, sy, slot.w);
    rt.gfx.image({ op: "image", sub: "show", i, x, y, w, h, rop, sx, sy });
    return 0;
  };
}

function makeBitmapNew(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    const w = L.optNumber(2, 0) | 0;
    const h = L.optNumber(3, 0) | 0;
    if (i > BITMAPMAX) throw new LuaRuntimeError(`BitmapNew:index ${i} invalid!`);
    const old = rt.bitmaps[i]?.pixels;
    rt.bitmaps[i] = { w, h, loaded: true, name: "", pixels: old?.length === w * h ? old : checkedPixels(w, h) };
    rt.gfx.image({ op: "image", sub: "new", i, w, h });
    return 0;
  };
}

function makeBitmapDraw(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const di = L.optNumber(1, 0) | 0;
    const dx = L.optNumber(2, 0) | 0;
    const dy = L.optNumber(3, 0) | 0;
    const si = L.optNumber(4, 0) | 0;
    if (si > BITMAPMAX || di > BITMAPMAX) throw new LuaRuntimeError(`BitmapDraw:index ${di} or ${si} invalid!`);
    const src = rt.bitmaps[si], dst = rt.bitmaps[di];
    if (src?.pixels && dst?.pixels) rt.screen.drawBitmapEx(
      (x, y) => src.pixels![y * src.w + x] ?? 0, L.optNumber(5, 0), L.optNumber(6, 0),
      (x, y, color) => { dst.pixels![y * dst.w + x] = color; }, dst.w, dst.h, dx, dy,
      L.optNumber(7, 0), L.optNumber(8, 0), L.optNumber(9, 0), L.optNumber(10, 0), L.optNumber(11, 0), L.optNumber(12, 0),
      L.optNumber(13, DRAW_BM_COPY), src.pixels[0]);
    rt.gfx.image({
      op: "image",
      sub: "draw",
      i: di,
      di,
      si,
      x: dx,
      y: dy,
      sx: L.optNumber(5, 0) | 0,
      sy: L.optNumber(6, 0) | 0,
      w: L.optNumber(7, 0) | 0,
      h: L.optNumber(8, 0) | 0,
      rop: L.optNumber(13, DRAW_BM_COPY) | 0,
    });
    return 0;
  };
}

function makeSpriteSet(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    const h = L.optNumber(2, 0) | 0;
    if (i >= SPRITEMAX) throw new LuaRuntimeError(`SpriteSet:index ${i} invalid!`);
    rt.sprites[i] = { h };
    return 0;
  };
}

function makeSpriteDraw(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    const spriteindex = L.optNumber(2, 0) | 0;
    const x = L.optNumber(3, 0) | 0;
    const y = L.optNumber(4, 0) | 0;
    const mod = L.optNumber(5, DRAW_BM_TRANSPARENT) | 0;
    const bitmap = rt.bitmaps[i], height = rt.sprites[i]?.h ?? 0;
    if (bitmap?.pixels && height > 0) {
      const offset = (spriteindex & MR_SPRITE_INDEX_MASK) * bitmap.w * height;
      const rop = (spriteindex & ~MR_SPRITE_INDEX_MASK) | mod;
      rt.screen.drawBitmapRop(index => bitmap.pixels![offset + index] ?? 0, x, y, bitmap.w, height, rop, bitmap.pixels[0], 0, 0, bitmap.w);
    }
    rt.gfx.sprite({ op: "sprite", i, spriteindex, x, y, mod });
    return 0;
  };
}

function makeTileSet(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    if (i >= TILEMAX) throw new LuaRuntimeError("TileSet:tile index out of rang!");
    const x = L.optNumber(2, 0) | 0;
    const y = L.optNumber(3, 0) | 0;
    const w = L.optNumber(4, 0) | 0;
    const h = L.optNumber(5, 0) | 0;
    const tileh = L.optNumber(6, 0) | 0;
    const old = rt.tiles[i];
    const cells = old?.cells && old.w * old.h === w * h ? old.cells : allocatedTileCells(w, h);
    rt.tiles[i] = { x, y, w, h, tileh, x1: old?.x1 ?? 0, y1: old?.y1 ?? 0, x2: old?.x2 ?? rt.screenW, y2: old?.y2 ?? rt.screenH, cells };
    rt.gfx.tile({ op: "tile", sub: "set", i, x, y, w, h, tileh });
    return 0;
  };
}

function makeTileSetRect(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    if (i >= TILEMAX) throw new LuaRuntimeError("TileSet:tile index out of rang!");
    const x1 = L.optNumber(2, 0) | 0;
    const y1 = L.optNumber(3, 0) | 0;
    const x2 = L.optNumber(4, 0) | 0;
    const y2 = L.optNumber(5, 0) | 0;
    const t = rt.tiles[i] ?? { x: 0, y: 0, w: 0, h: 0, tileh: 0, x1, y1, x2, y2 };
    t.x1 = x1;
    t.y1 = y1;
    t.x2 = x2;
    t.y2 = y2;
    rt.tiles[i] = t;
    rt.gfx.tile({ op: "tile", sub: "rect", i, x1, y1, x2, y2 });
    return 0;
  };
}

function makeTileDraw(rt: MythroadRuntime): NativeFunction {
  return (L) => {
    const i = L.optNumber(1, 0) | 0;
    if (i >= TILEMAX) throw new LuaRuntimeError("TileDraw:tile index out of rang!");
    const t: import("./graphics.ts").TileSlot = rt.tiles[i] ?? { x: 0, y: 0, w: 0, h: 0, tileh: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
    const bitmap = rt.bitmaps[i];
    if (bitmap?.pixels && t.cells && bitmap.w > 0 && t.tileh > 0) {
      const xStart = Math.max(0, Math.floor(-t.x / bitmap.w)), yStart = Math.max(0, Math.floor(-t.y / t.tileh));
      const xEnd = Math.min(t.w, Math.ceil((rt.screenW - t.x) / bitmap.w)), yEnd = Math.min(t.h, Math.ceil((rt.screenH - t.y) / t.tileh));
      for (let row = yStart; row < yEnd; row++) for (let col = xStart; col < xEnd; col++) {
        const cell = t.cells[row * t.w + col], index = cell & MR_SPRITE_INDEX_MASK;
        const x = t.x + col * bitmap.w, y = t.y + row * t.tileh;
        if (index === MR_SPRITE_INDEX_MASK || x + bitmap.w < t.x1 || x >= t.x2 || y + t.tileh < t.y1 || y >= t.y2) continue;
        const offset = index * bitmap.w * t.tileh;
        const rop = (cell & 0xfc00) | (cell & MR_SPRITE_TRANSPARENT ? DRAW_BM_TRANSPARENT : DRAW_BM_COPY);
        rt.screen.drawBitmapRop(n => bitmap.pixels![offset + n] ?? 0, x, y, bitmap.w, t.tileh, rop, bitmap.pixels[0], 0, 0, bitmap.w);
      }
    }
    rt.gfx.tile({ op: "tile", sub: "draw", i, x: t.x, y: t.y, w: t.w, h: t.h, tileh: t.tileh });
    return 0;
  };
}

function checkedPixels(w: number, h: number): Uint16Array {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0 || w * h > 16 * 1024 * 1024) throw new LuaRuntimeError('Invalid bitmap/map dimensions');
  return new Uint16Array(w * h);
}
function pixels565(bytes: Uint8Array): Uint16Array {
  const pixels = new Uint16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < pixels.length; i++) pixels[i] = bytes[i * 2] | bytes[i * 2 + 1] << 8;
  return pixels;
}
/** mr_malloc rounds map allocations to 8 bytes (rxgj mem.c realLGmemSize). */
function allocatedTileCells(w: number, h: number): Uint16Array {
  const logical = checkedPixels(w, h);
  return new Uint16Array(Math.ceil(logical.byteLength / 8) * 4);
}
function makeTileCell(rt: MythroadRuntime, write: boolean): NativeFunction {
  return L => {
    const i = L.optNumber(1, 0) & 0xffff, x = L.optNumber(2, 0) & 0xffff, y = L.optNumber(3, 0) & 0xffff;
    const tile = rt.tiles[i];
    if (i >= TILEMAX || !tile?.cells || x > tile.w || y > tile.h || y * tile.w + x >= tile.cells.length) throw new LuaRuntimeError('Tile cell out of bounds');
    if (write) { tile.cells[y * tile.w + x] = L.optNumber(4, 0) & 0xffff; return 0; }
    L.pushInteger((tile.cells[y * tile.w + x] << 16) >> 16); return 1;
  };
}
