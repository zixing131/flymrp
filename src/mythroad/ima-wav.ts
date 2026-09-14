/** RIFF IMA/DVI ADPCM without depending on the browser's WAV codecs. */
const steps = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const indices = [-1,-1,-1,-1,2,4,6,8];
export type ImaWav = { sampleRate: number; channels: Float32Array[] };

/** Null means another codec; malformed IMA data is an error, never silence. */
export function decodeImaWav(bytes: Uint8Array): ImaWav | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || v.getUint32(0) !== 0x52494646 || v.getUint32(8) !== 0x57415645) return null;
  let fmt = -1, data = -1, size = 0, fact = 0;
  for (let p = 12; p + 8 <= bytes.length;) {
    const id = v.getUint32(p), n = v.getUint32(p + 4, true);
    if (n > bytes.length - p - 8) throw new Error('Truncated WAV chunk');
    if (id === 0x666d7420) fmt = p + 8;
    if (id === 0x64617461) { data = p + 8; size = n; }
    if (id === 0x66616374 && n >= 4) fact = v.getUint32(p + 8, true);
    p += 8 + n + (n & 1);
  }
  if (fmt < 0 || v.getUint32(fmt - 4, true) < 2 || v.getUint16(fmt, true) !== 17) return null;
  if (v.getUint32(fmt - 4, true) < 20 || data < 0) throw new Error('Invalid IMA WAV header');
  const channels = v.getUint16(fmt + 2, true), sampleRate = v.getUint32(fmt + 4, true);
  const block = v.getUint16(fmt + 12, true), samples = v.getUint16(fmt + 18, true);
  if ((channels !== 1 && channels !== 2) || sampleRate < 3000 || sampleRate > 192000 ||
      v.getUint16(fmt + 14, true) !== 4 || block < channels * 4 ||
      (block - channels * 4) % (channels * 4) || samples !== 1 + (block - channels * 4) * 2 / channels) {
    throw new Error('Invalid IMA WAV format');
  }
  const tail = size % block;
  if (tail && (tail < channels * 4 || (tail - channels * 4) % (channels * 4))) throw new Error('Truncated IMA WAV block');
  const capacity = Math.floor(size / block) * samples + (tail ? 1 + (tail - channels * 4) * 2 / channels : 0);
  if (capacity * channels > 32_000_000) throw new Error('Invalid IMA WAV sample count');
  // Some handset encoders retain the pre-padding source count in fact.
  const length = fact ? Math.min(fact, capacity) : capacity, output = Array.from({ length: channels }, () => new Float32Array(length));
  let origin = 0;
  for (let p = data; p < data + size && origin < length; p += block) {
    const end = Math.min(p + block, data + size), count = 1 + (end - p - channels * 4) * 2 / channels;
    for (let ch = 0; ch < channels; ch++) {
      let predictor = v.getInt16(p + ch * 4, true), index = bytes[p + ch * 4 + 2], written = 1;
      if (index > 88) throw new Error('Invalid IMA WAV step index');
      output[ch][origin] = predictor / 32768;
      for (let q = p + channels * 4; q < end; q += channels * 4) {
        for (let j = 0; j < 4; j++) {
          const packed = bytes[q + ch * 4 + j];
          for (const nibble of [packed & 15, packed >>> 4]) {
            const step = steps[index];
            const delta = ((2 * (nibble & 7) + 1) * step) >> 3;
            predictor = Math.max(-32768, Math.min(32767, predictor + ((nibble & 8) ? -delta : delta)));
            index = Math.max(0, Math.min(88, index + indices[nibble & 7]));
            if (origin + written < length) output[ch][origin + written] = predictor / 32768;
            written++;
          }
        }
      }
    }
    origin += count;
  }
  return { sampleRate, channels: output };
}
