# Synthetic IMA ADPCM fixtures

Generated for decoder regression; these files contain synthesized tones, no game audio.

- Mono: FFmpeg `sine=frequency=440:sample_rate=8000:duration=0.03`, `adpcm_ima_wav`, block size 256.
- Stereo: FFmpeg `aevalsrc=0.2*sin(2*PI*440*t)|0.1*sin(2*PI*660*t):s=8000:d=0.04`, same codec/block size.
- `.pcm` is FFmpeg's decoded signed little-endian 16-bit output, including final encoder padding. Tests compare valid frames using the WAV `fact` sample count.
