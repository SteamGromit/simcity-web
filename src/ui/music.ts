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
