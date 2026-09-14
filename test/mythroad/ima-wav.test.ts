import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeImaWav } from '../../src/mythroad/ima-wav.ts';
for (const name of ['mono', 'stereo']) it(`decodes ${name} IMA blocks exactly like FFmpeg`, () => {
  const bytes = readFileSync(`test/fixtures/audio/ima-${name}.wav`);
  const pcm = readFileSync(`test/fixtures/audio/ima-${name}.pcm`);
  const decoded = decodeImaWav(bytes)!;
  expect(decoded.sampleRate).toBe(8000);
  expect(decoded.channels.length).toBe(name === 'mono' ? 1 : 2);
  // Honor the WAV fact count; FFmpeg also emits encoder padding.
  expect(decoded.channels[0].length).toBe(name === 'mono' ? 240 : 320);
  expect(decoded.channels[0].length * decoded.channels.length * 2).toBeLessThanOrEqual(pcm.length);
  for (let i = 0; i < decoded.channels[0].length; i++) {
    for (let ch = 0; ch < decoded.channels.length; ch++) {
      expect(decoded.channels[ch][i] * 32768).toBe(pcm.readInt16LE((i * decoded.channels.length + ch) * 2));
    }
  }
});
it('rejects truncated blocks and invalid predictor indices, and distinguishes other codecs', () => {
  expect(decodeImaWav(new Uint8Array([1, 2]))).toBeNull();
  const bytes = readFileSync('test/fixtures/audio/ima-mono.wav');
  expect(() => decodeImaWav(bytes.subarray(0, bytes.length - 1))).toThrow('Truncated');
  const data = bytes.indexOf(Buffer.from('data')) + 8;
  bytes[data + 2] = 89;
  expect(() => decodeImaWav(bytes)).toThrow('step index');
});
