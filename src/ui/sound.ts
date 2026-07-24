import { BuildTool, ToolId } from '../sim/types';

/** A synthesized cue — no audio assets, everything is generated. */
export interface SoundSpec {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  freq: number; // Hz at note start (ignored for noise)
  freqEnd?: number; // sweep target
  dur: number; // seconds
  vol: number; // 0..1
  /** Noise lowpass cutoff (Hz); default 900. Ignored for oscillators. */
  filterHz?: number;
}

export type EventId =
  | 'tornado'
  | 'hurricane'
  | 'pandemic'
  | 'fire-start'
  | 'building-lost'
  | 'brownout';

/** Multi-step event cues, scheduled at ms offsets through play(). */
export const EVENT_SOUNDS: Record<EventId, { at: number; spec: SoundSpec }[]> = {
  tornado: [0, 700, 1400, 2100].flatMap((at) => [
    { at, spec: { wave: 'square', freq: 600, dur: 0.32, vol: 0.5 } as SoundSpec },
    { at: at + 350, spec: { wave: 'square', freq: 450, dur: 0.32, vol: 0.5 } as SoundSpec },
  ]),
  hurricane: [
    { at: 0, spec: { wave: 'noise', freq: 0, dur: 2.0, vol: 0.55, filterHz: 400 } },
    { at: 0, spec: { wave: 'sawtooth', freq: 60, freqEnd: 110, dur: 2.0, vol: 0.3 } },
  ],
  pandemic: [
    { at: 0, spec: { wave: 'sine', freq: 520, dur: 1.2, vol: 0.45 } },
    { at: 900, spec: { wave: 'sine', freq: 392, dur: 1.6, vol: 0.45 } },
  ],
  'fire-start': [
    { at: 0, spec: { wave: 'noise', freq: 0, dur: 0.08, vol: 0.5, filterHz: 1400 } },
    { at: 120, spec: { wave: 'noise', freq: 0, dur: 0.06, vol: 0.4, filterHz: 1400 } },
    { at: 230, spec: { wave: 'noise', freq: 0, dur: 0.1, vol: 0.45, filterHz: 1400 } },
  ],
  'building-lost': [
    { at: 0, spec: { wave: 'noise', freq: 0, dur: 0.5, vol: 0.65, filterHz: 300 } },
    { at: 40, spec: { wave: 'sine', freq: 130, freqEnd: 35, dur: 0.6, vol: 0.55 } },
  ],
  brownout: [{ at: 0, spec: { wave: 'sawtooth', freq: 220, freqEnd: 55, dur: 0.5, vol: 0.4 } }],
};

/** Events that may fire often keep a minimum gap; disasters always play. */
const EVENT_GAP_MS: Partial<Record<EventId, number>> = {
  'fire-start': 4000,
  'building-lost': 4000,
  brownout: 4000,
};

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
  bus: { wave: 'triangle', freq: 380, freqEnd: 300, dur: 0.12, vol: 0.45 },
  pump: { wave: 'triangle', freq: 220, freqEnd: 160, dur: 0.18, vol: 0.5 },
  pipe: { wave: 'sine', freq: 340, freqEnd: 300, dur: 0.05, vol: 0.3 },
  // plant family: same low thunk as coal, pitched apart per source
  solar: { wave: 'triangle', freq: 90, freqEnd: 55, dur: 0.3, vol: 0.65 },
  wind: { wave: 'triangle', freq: 110, freqEnd: 70, dur: 0.25, vol: 0.6 },
  hydro: { wave: 'triangle', freq: 80, freqEnd: 45, dur: 0.32, vol: 0.68 },
  nuclear: { wave: 'triangle', freq: 60, freqEnd: 35, dur: 0.4, vol: 0.75 },
  // refuse family: a dull dumped-load thud, lighter as the tech improves
  landfill: { wave: 'square', freq: 90, freqEnd: 55, dur: 0.22, vol: 0.6 },
  incinerator: { wave: 'square', freq: 120, freqEnd: 70, dur: 0.2, vol: 0.55 },
  recycling: { wave: 'triangle', freq: 240, freqEnd: 180, dur: 0.16, vol: 0.5 },
  // transit family: the bus thunk, pitched up the ladder
  streetcar: { wave: 'triangle', freq: 400, freqEnd: 315, dur: 0.12, vol: 0.45 },
  monorail: { wave: 'triangle', freq: 430, freqEnd: 340, dur: 0.12, vol: 0.45 },
  subway: { wave: 'triangle', freq: 460, freqEnd: 365, dur: 0.12, vol: 0.45 },
  rail: { wave: 'triangle', freq: 490, freqEnd: 390, dur: 0.12, vol: 0.45 },
  terraWater: { wave: 'noise', freq: 0, dur: 0.18, vol: 0.35 },
  terraForest: { wave: 'noise', freq: 0, dur: 0.13, vol: 0.25 },
  terraGrass: { wave: 'noise', freq: 0, dur: 0.1, vol: 0.2 },
  terraRaise: { wave: 'noise', freq: 0, dur: 0.16, vol: 0.3 },
  terraLower: { wave: 'noise', freq: 0, dur: 0.16, vol: 0.3 },
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

/** A mod tool has no bespoke cue of its own; it borrows the generic one. */
export function soundFor(tool: BuildTool): SoundSpec {
  return TOOL_SOUNDS[tool as ToolId] ?? UI_SOUNDS.select;
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
    const level = muted ? 0 : ambientTarget * 0.045 * sfxVolume;
    ambientGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
  }

  const lastEvent: Partial<Record<EventId, number>> = {};
  let sfxVolume = (() => {
    const v = parseFloat(localStorage.getItem('simcity.sfxvol') ?? '1');
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  })();

  return {
    get muted() {
      return muted;
    },
    get sfxVolume() {
      return sfxVolume;
    },
    setSfxVolume(v: number) {
      sfxVolume = Math.max(0, Math.min(1, v));
      localStorage.setItem('simcity.sfxvol', String(sfxVolume));
      applyAmbient();
    },
    /** The lazily created AudioContext; null until the first play(). */
    context(): AudioContext | null {
      return ctx;
    },
    /** Play an event cue's steps; frequent events keep a minimum gap. */
    playEvent(id: EventId) {
      if (muted) return;
      const now = performance.now();
      const gap = EVENT_GAP_MS[id] ?? 0;
      if (gap > 0 && lastEvent[id] !== undefined && now - lastEvent[id]! < gap) return;
      lastEvent[id] = now;
      for (const step of EVENT_SOUNDS[id]) {
        window.setTimeout(() => this.play(step.spec), step.at);
      }
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
      gain.gain.setValueAtTime(Math.max(0.001, spec.vol * 0.25 * sfxVolume), c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + spec.dur);
      gain.connect(c.destination);

      if (spec.wave === 'noise') {
        const src = c.createBufferSource();
        src.buffer = noiseBuf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = spec.filterHz ?? 900;
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
