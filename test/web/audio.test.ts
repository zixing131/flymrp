import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const synth = vi.hoisted(() => ({ reset: vi.fn(), stopMIDI: vi.fn(), setMasterVol: vi.fn(), send: vi.fn(), getAudioContext: vi.fn() }));
vi.mock("webaudio-tinysynth", () => ({ default: class { constructor() { return synth; } } }));
import { BrowserAudio } from "../../web/audio.ts";
import { MR_SOUND_MIDI, MR_SOUND_MP3, MR_SOUND_WAV } from "../../src/mythroad/index.ts";
const midi = new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,12,0,144,60,80,96,128,60,0,0,255,47,0]);
describe("browser audio lifecycle", () => {
  let pending: ((value: AudioBuffer) => void)[], starts: ReturnType<typeof vi.fn>, gain: { value: number };
  beforeEach(() => {
    vi.useFakeTimers(); pending = []; starts = vi.fn(); gain = { value: 1 };
    const context = { state: "running", currentTime: 0, destination: {},
      decodeAudioData: () => new Promise<AudioBuffer>(resolve => pending.push(resolve)),
      createBuffer: (channels: number, length: number, rate: number) => { const data = Array.from({length:channels},()=>new Float32Array(length)); return {duration:length/rate,getChannelData:(i:number)=>data[i]}; },
      createGain: () => ({ gain, connect: vi.fn(), disconnect: vi.fn() }),
      createBufferSource: () => ({ connect: vi.fn(), disconnect: vi.fn(), start: starts, stop: vi.fn() }) };
    synth.getAudioContext.mockReturnValue(context);
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } }, setInterval, clearInterval, setTimeout, clearTimeout });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("plays IMA ADPCM without native decoding, preserving seek and stop", () => {
    const audio = new BrowserAudio();
    audio.play(MR_SOUND_WAV, readFileSync('test/fixtures/audio/ima-mono.wav'), 1, 10);
    expect(audio.lastError).toBeNull(); expect(pending).toHaveLength(0);
    expect(starts).toHaveBeenCalledWith(0, .01); audio.stopAll();
  });
  it("does not resurrect sound when a stopped decode finishes", async () => {
    const audio = new BrowserAudio(); audio.play(MR_SOUND_MP3, new Uint8Array([1]), 0); audio.stopAll();
    pending[0]({} as AudioBuffer); await Promise.resolve(); expect(starts).not.toHaveBeenCalled();
  });
  it("only plays the newest decode of the same sound type", async () => {
    const audio = new BrowserAudio(); audio.play(MR_SOUND_MP3, new Uint8Array([1]), 0); audio.play(MR_SOUND_MP3, new Uint8Array([2]), 0);
    pending[1]({duration: 2} as AudioBuffer); await Promise.resolve(); pending[0]({} as AudioBuffer); await Promise.resolve();
    expect(starts).toHaveBeenCalledTimes(1); audio.stopAll();
  });
  it("resumes decoded audio at the requested position", async () => {
    const audio = new BrowserAudio(); audio.play(MR_SOUND_MP3, new Uint8Array([1]), 0, 1250);
    pending[0]({duration: 2} as AudioBuffer); await Promise.resolve();
    expect(starts).toHaveBeenCalledWith(0, 1.25); audio.stopAll();
  });
  it("defaults to GM, schedules a note and cancels MIDI timers on stop", () => {
    const audio = new BrowserAudio(); expect(audio.midiPlayer).toBe("tinysynth"); audio.play(MR_SOUND_MIDI, midi, 1);
    expect(synth.send).toHaveBeenCalledWith([144,60,80], .05); audio.stopAll();
    expect(synth.stopMIDI).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    audio.setMidiPlayer("simple"); expect(vi.getTimerCount()).toBe(0);
  });
  it("applies live volume and mute to both sampled audio and MIDI without restarting music", () => {
    const audio = new BrowserAudio(); audio.play(MR_SOUND_MIDI, midi, 1);
    audio.setVolume(.4); expect(gain.value).toBe(.4); expect(synth.setMasterVol).toHaveBeenLastCalledWith(.35 * .4);
    audio.setMuted(true); expect(gain.value).toBe(0); expect(synth.setMasterVol).toHaveBeenLastCalledWith(0);
    audio.setVolume(.6); expect(gain.value).toBe(0);
    audio.setMuted(false); expect(gain.value).toBe(.6); expect(synth.setMasterVol).toHaveBeenLastCalledWith(.35 * .6);
    expect(synth.reset).toHaveBeenCalledTimes(1); audio.stopAll();
  });
});
