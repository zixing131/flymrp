import { deflateSync } from "node:zlib";

/**
 * 零依赖 PNG 编码器与 PWA 图标绘制。
 * 图标为 64x64 像素网格程序化绘制的像素风游戏手柄，最近邻放大到目标尺寸，
 * 构建过程可复现，无需任何图片素材或第三方库。
 */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 编码 RGBA 像素数据为 PNG Buffer（8bit RGBA，逐行 filter 0）。 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 图标绘制（64x64 设计网格） ----

function inRoundedRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5;
}

function inCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** 计算 64 网格上 (gx, gy) 像素颜色（中心采样）。 */
function pixelAt(gx: number, gy: number): [number, number, number] {
  const x = gx + 0.5;
  const y = gy + 0.5;
  const t = gy / 63;
  let r = lerp(0x26, 0x13, t); // 背景渐变 上 #262A40 → 下 #131420
  let g = lerp(0x2a, 0x14, t);
  let b = lerp(0x40, 0x20, t);
  if (inRoundedRect(x, y, 14, 25, 50, 39, 5)) { // 手柄机身
    r = 0x3a; g = 0x3f; b = 0x5c;
  }
  if (inRoundedRect(x, y, 16, 26, 48, 30, 4)) { // 机身顶部高光
    r = 0x4a; g = 0x50; b = 0x72;
  }
  const dpad = (Math.abs(x - 24) <= 3.5 && Math.abs(y - 32) <= 8.5) || (Math.abs(y - 32) <= 3.5 && Math.abs(x - 24) <= 8.5);
  if (dpad) { r = 0xc9; g = 0xcd; b = 0xe8; } // 方向键
  if (Math.abs(x - 24) <= 2.5 && Math.abs(y - 32) <= 2.5) { r = 0x99; g = 0x9e; b = 0xbf; } // 十字中心
  if (inCircle(x, y, 40, 29, 3.4)) { r = 0xff; g = 0x6b; b = 0x6b; } // A 键
  if (inCircle(x, y, 46, 35, 3.4)) { r = 0x4e; g = 0xc9; b = 0xb0; } // B 键
  return [r, g, b];
}

/**
 * 生成应用图标 PNG。
 * @param size 输出边长（像素）
 * @param maskable true 生成 maskable 满幅图标；false 生成带圆角的普通图标
 */
export function renderIcon(size: number, maskable: boolean): Buffer {
  const px = new Uint8Array(size * size * 4);
  const S = 64;
  const corner = 10.5; // 64 网格上的圆角半径
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x * S) / size);
      const gy = Math.floor((y * S) / size);
      const [r, g, b] = pixelAt(gx, gy);
      const i = (y * size + x) * 4;
      let alpha = 255;
      if (!maskable && !inRoundedRect(x + 0.5, y + 0.5, 0, 0, size, size, corner * (size / S))) alpha = 0;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = alpha;
    }
  }
  return encodePng(size, size, px);
}
