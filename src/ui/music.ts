import { anyDisasterActive } from '../sim/disasters';
import { CityState, Zone } from '../sim/types';

/** Everything the composer needs to know about the city, musically. */
export interface MusicMood {
  tempo: number; // bpm
  root: number; // Hz
  scale: number[]; // semitone offsets from root
  minor: boolean;
  layers: { pad: boolean; bass: boolean; melody: boolean; percussion: boolean };
  register: -1 | 0 | 1; // octave shift for the melody
  volume: number; // 0..1 music master multiplier
  sparse: boolean; // thin the note density (bad weather)
  bells: boolean; // snow: melody as high sine bells
  duck: boolean; // disaster: drop to a tense drone
}

export const MAJOR_PENTA = [0, 2, 4, 7, 9];
export const MINOR_PENTA = [0, 3, 5, 7, 10];
export const HIJAZ = [0, 1, 4, 5, 7, 8, 11];

type Season = 'winter' | 'spring' | 'summer' | 'autumn';

function seasonOf(month: number): Season {
  const m = month % 12; // 0 = January (months since Jan 2000)
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/** Derive the city's musical mood: locale picks the color, growth the
 * energy, weather the density, disasters the dread. */
export function moodFrom(city: CityState): MusicMood {
  const pop = city.population;
  const layers = {
    melody: true,
    bass: pop >= 500,
    pad: pop >= 5000,
    percussion: pop >= 20000,
  };
  let tempo = pop >= 20000 ? 110 : pop >= 5000 ? 96 : pop >= 500 ? 82 : 70;

  let developed = 0;
  let industrial = 0;
  for (const t of city.tiles) {
    if (t.stage === 0) continue;
    if (t.zone === Zone.Industrial) industrial++;
    if (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial) {
      developed++;
    }
  }
  let minor = developed > 0 && industrial / developed > 0.4;

  const season = seasonOf(city.month);
  let register: -1 | 0 | 1 = 0;
  if (season === 'winter') {
    minor = true;
    register = -1;
    tempo -= 10;
  } else if (season === 'summer') {
    register = 1;
  } else if (season === 'autumn') {
    minor = true;
  }

  const desert = city.biome === 'desert';
  const scale = desert ? HIJAZ : minor ? MINOR_PENTA : MAJOR_PENTA;
  const root = desert ? 146.83 : 110; // D3 vs A2

  let volume = 1;
  let sparse = false;
  let bells = false;
  if (city.weather.kind === 'rain' || city.weather.kind === 'cloudy') {
    sparse = true;
    volume *= 0.7;
  } else if (city.weather.kind === 'snow') {
    sparse = true;
    bells = true;
  }

  return {
    tempo,
    root,
    scale,
    minor,
    layers,
    register,
    volume,
    sparse,
    bells,
    duck: anyDisasterActive(city),
  };
}

/** One scheduled note. Beats are half-beat quantized within a 4-beat bar. */
export interface NoteEvent {
  beat: number;
  freq: number; // ignored for noise
  dur: number; // beats
  wave: OscillatorType | 'noise';
  vol: number;
  layer: 'pad' | 'bass' | 'melody' | 'percussion';
}

/** Melody pitches: two octaves of the scale, lifted by the register. */
function noteTable(mood: MusicMood): number[] {
  const base = 1 + mood.register;
  const out: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const semi of mood.scale) out.push(mood.root * 2 ** (base + oct + semi / 12));
  }
  return out;
}

/**
 * Compose one bar from the mood. Deterministic for a given (mood,
 * barIndex, rand sequence); every 4th bar the melody cadences home.
 */
export function composeBar(mood: MusicMood, barIndex: number, rand: () => number): NoteEvent[] {
  const out: NoteEvent[] = [];
  if (mood.duck) {
    // disasters: a bare fifth droning low — dread, not a tune
    out.push({ beat: 0, freq: mood.root, dur: 4, wave: 'sine', vol: 0.25, layer: 'pad' });
    out.push({
      beat: 0,
      freq: mood.root * 2 ** (7 / 12),
      dur: 4,
      wave: 'sine',
      vol: 0.15,
      layer: 'pad',
    });
    return out;
  }

  if (mood.layers.pad) {
    const third = mood.minor ? 3 : 4;
    for (const semi of [0, third, 7]) {
      out.push({
        beat: 0,
        freq: mood.root * 2 ** (1 + semi / 12),
        dur: 4,
        wave: 'sine',
        vol: 0.16 * mood.volume,
        layer: 'pad',
      });
    }
  }

  if (mood.layers.bass) {
    const wave: NoteEvent['wave'] = mood.minor ? 'sawtooth' : 'triangle';
    out.push({ beat: 0, freq: mood.root, dur: 1.5, wave, vol: 0.4 * mood.volume, layer: 'bass' });
    out.push({
      beat: 2,
      freq: barIndex % 2 === 1 ? mood.root * 2 ** (7 / 12) : mood.root,
      dur: 1.5,
      wave,
      vol: 0.35 * mood.volume,
      layer: 'bass',
    });
  }

  if (mood.layers.melody) {
    const table = noteTable(mood);
    let ix = Math.floor(rand() * table.length);
    const count = mood.sparse ? 2 : 4;
    for (let n = 0; n < count; n++) {
      const swing = rand() < 0.3 ? 0.5 : 0;
      ix = Math.min(table.length - 1, Math.max(0, ix + Math.floor(rand() * 5) - 2));
      if (barIndex % 4 === 3 && n === count - 1) ix = 0; // cadence home
      out.push({
        beat: Math.min(3.5, n * (4 / count) + swing),
        freq: table[ix],
        dur: mood.bells ? 1.5 : 0.9,
        wave: mood.bells ? 'sine' : 'triangle',
        vol: 0.4 * mood.volume,
        layer: 'melody',
      });
    }
  }

  if (mood.layers.percussion && !mood.sparse) {
    for (const b of [0, 2]) {
      out.push({
        beat: b,
        freq: 0,
        dur: 0.12,
        wave: 'noise',
        vol: 0.35 * mood.volume,
        layer: 'percussion',
      });
    }
    for (const b of [1, 3]) {
      out.push({
        beat: b,
        freq: 0,
        dur: 0.05,
        wave: 'noise',
        vol: 0.18 * mood.volume,
        layer: 'percussion',
      });
    }
  }

  return out;
}

const MUSIC_KEY = 'simcity.music';

/**
 * Web Audio bar scheduler. Owns nothing until the sound player's context
 * exists (first user gesture — autoplay-safe). Composes the next bar just
 * before it's due; mood changes land on bar boundaries. Untested, like
 * the render layer.
 */
export function createMusicPlayer(sound: { context(): AudioContext | null; muted: boolean }) {
  let on = localStorage.getItem(MUSIC_KEY) !== '0';
  let mood: MusicMood | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let nextBarAt = 0; // AudioContext time of the next unscheduled bar
  let barIndex = 0;
  let timer: number | null = null;

  let musicVolume = (() => {
    const v = parseFloat(localStorage.getItem('simcity.musicvol') ?? '1');
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  })();

  function ensureGraph(c: AudioContext) {
    if (master) return;
    master = c.createGain();
    master.gain.value = 0.06 * musicVolume;
    master.connect(c.destination);
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function scheduleNote(c: AudioContext, e: NoteEvent, barStart: number, secPerBeat: number) {
    const t = barStart + e.beat * secPerBeat;
    const dur = Math.max(0.05, e.dur * secPerBeat);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, e.vol), t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.connect(master!);
    if (e.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = noiseBuf!;
      const filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = e.dur > 0.1 ? 120 : 4000; // kick vs hat
      src.connect(filter).connect(gain);
      src.start(t, Math.random(), dur);
    } else {
      const osc = c.createOscillator();
      osc.type = e.wave;
      osc.frequency.setValueAtTime(e.freq, t);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** Keep about a bar of music scheduled ahead of the playhead. */
  function pump() {
    const c = sound.context();
    if (!c || !mood) return;
    ensureGraph(c);
    const secPerBeat = 60 / mood.tempo;
    const barLen = 4 * secPerBeat;
    if (nextBarAt < c.currentTime + 0.05) nextBarAt = c.currentTime + 0.05;
    while (nextBarAt < c.currentTime + barLen + 0.3) {
      for (const e of composeBar(mood, barIndex, Math.random)) {
        scheduleNote(c, e, nextBarAt, secPerBeat);
      }
      nextBarAt += barLen;
      barIndex += 1;
    }
  }

  function setRunning(run: boolean) {
    if (run && timer === null) timer = window.setInterval(pump, 250);
    if (!run && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      nextBarAt = 0; // resume cleanly later
    }
    if (master) master.gain.value = run ? 0.06 : 0;
  }

  return {
    get on() {
      return on;
    },
    /** Flip the pref; returns the new state. */
    toggle(): boolean {
      on = !on;
      localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
      setRunning(on && !sound.muted && sound.context() !== null);
      return on;
    },
    /** Refresh the mood from the city; start/stop with mute and pref. */
    update(city: CityState) {
      mood = moodFrom(city);
      setRunning(on && !sound.muted && sound.context() !== null);
    },
    get musicVolume() {
      return musicVolume;
    },
    setMusicVolume(v: number) {
      musicVolume = Math.max(0, Math.min(1, v));
      localStorage.setItem('simcity.musicvol', String(musicVolume));
      const c = sound.context();
      if (master && c) master.gain.setTargetAtTime(0.06 * musicVolume, c.currentTime, 0.2);
    },
  };
}
