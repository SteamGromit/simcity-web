import { ToolId } from '../sim/types';

/** A synthesized cue — no audio assets, everything is generated. */
export interface SoundSpec {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  freq: number; // Hz at note start (ignored for noise)
  freqEnd?: number; // sweep target
  dur: number; // seconds
  vol: number; // 0..1
}

const TOOL_SOUNDS: Record<ToolId, SoundSpec> = {
  road: { wave: 'triangle', freq: 130, freqEnd: 80, dur: 0.07, vol: 0.5 },
  zoneR: { wave: 'sine', freq: 620, freqEnd: 560, dur: 0.05, vol: 0.35 },
  zoneC: { wave: 'sine', freq: 740, freqEnd: 680, dur: 0.05, vol: 0.35 },
  zoneI: { wave: 'sine', freq: 500, freqEnd: 440, dur: 0.05, vol: 0.35 },
  plant: { wave: 'triangle', freq: 70, freqEnd: 40, dur: 0.35, vol: 0.7 },
  line: { wave: 'sawtooth', freq: 900, freqEnd: 1400, dur: 0.06, vol: 0.2 },
  park: { wave: 'sine', freq: 700, freqEnd: 950, dur: 0.1, vol: 0.35 },
  fire: { wave: 'triangle', freq: 320, freqEnd: 220, dur: 0.14, vol: 0.5 },
  police: { wave: 'triangle', freq: 290, freqEnd: 200, dur: 0.14, vol: 0.5 },
  school: { wave: 'triangle', freq: 350, freqEnd: 250, dur: 0.14, vol: 0.5 },
  hospital: { wave: 'triangle', freq: 260, freqEnd: 180, dur: 0.14, vol: 0.5 },
  terraWater: { wave: 'noise', freq: 0, dur: 0.18, vol: 0.35 },
  terraForest: { wave: 'noise', freq: 0, dur: 0.13, vol: 0.25 },
  terraGrass: { wave: 'noise', freq: 0, dur: 0.1, vol: 0.2 },
  bulldoze: { wave: 'noise', freq: 0, dur: 0.14, vol: 0.45 },
};

export const UI_SOUNDS = {
  /** Rejected action (no funds, bad terrain). */
  error: { wave: 'square', freq: 150, freqEnd: 110, dur: 0.15, vol: 0.25 } as SoundSpec,
  /** Confirmation chime (saved, loaded). */
  info: { wave: 'sine', freq: 880, freqEnd: 1320, dur: 0.15, vol: 0.3 } as SoundSpec,
  /** Something bad happened in the city (fire notice). */
  alarm: { wave: 'square', freq: 620, freqEnd: 420, dur: 0.35, vol: 0.3 } as SoundSpec,
  /** Tool selected in the toolbar. */
  select: { wave: 'sine', freq: 420, dur: 0.03, vol: 0.2 } as SoundSpec,
};

export function soundFor(tool: ToolId): SoundSpec {
  return TOOL_SOUNDS[tool];
}

/** Ambient city-hum level 0..1 from population (log curve, capped). */
export function ambientLevel(population: number): number {
  if (population <= 0) return 0;
  return Math.min(1, Math.log10(1 + population) / 6);
}

const MUTE_KEY = 'simcity.muted';

/**
 * WebAudio player. The context is created lazily on the first play() so we
 * respect browser autoplay rules (first call always follows a user gesture).
 */
export function createSoundPlayer() {
  let ctx: AudioContext | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let ambientGain: GainNode | null = null;
  let ambientTarget = 0;
  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let lastPlay = 0;

  function ensureCtx(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!ctx) {
      ctx = new AudioContext();
      const len = ctx.sampleRate; // 1s of white noise, reused by every cue
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function startAmbient(c: AudioContext) {
    if (ambientGain || !noiseBuf) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220; // distant rumble, not hiss
    ambientGain = c.createGain();
    ambientGain.gain.value = 0;
    src.connect(filter).connect(ambientGain).connect(c.destination);
    src.start();
  }

  function applyAmbient() {
    if (!ctx || !ambientGain) return;
    const level = muted ? 0 : ambientTarget * 0.045;
    ambientGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute(): boolean {
      muted = !muted;
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      applyAmbient();
      return muted;
    },
    /** Play a cue; calls within `throttleMs` of the last are dropped. */
    play(spec: SoundSpec, throttleMs = 0) {
      if (muted) return;
      const now = performance.now();
      if (throttleMs > 0 && now - lastPlay < throttleMs) return;
      const c = ensureCtx();
      if (!c) return;
      lastPlay = now;
      startAmbient(c);
      applyAmbient();

      const gain = c.createGain();
      gain.gain.setValueAtTime(spec.vol * 0.25, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + spec.dur);
      gain.connect(c.destination);

      if (spec.wave === 'noise') {
        const src = c.createBufferSource();
        src.buffer = noiseBuf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        src.connect(filter).connect(gain);
        src.start(c.currentTime, Math.random(), spec.dur);
      } else {
        const osc = c.createOscillator();
        osc.type = spec.wave;
        osc.frequency.setValueAtTime(spec.freq, c.currentTime);
        if (spec.freqEnd) {
          osc.frequency.exponentialRampToValueAtTime(spec.freqEnd, c.currentTime + spec.dur);
        }
        osc.connect(gain);
        osc.start();
        osc.stop(c.currentTime + spec.dur);
      }
    },
    /** Feed the current population; the hum follows it slowly. */
    setAmbient(level: number) {
      ambientTarget = level;
      applyAmbient();
    },
  };
}
