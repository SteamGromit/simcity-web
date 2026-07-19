import { CityState } from './types';

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'snow'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export interface Weather {
  kind: WeatherKind;
}

export function defaultWeather(): Weather {
  return { kind: 'clear' };
}

/** Dec–Feb by the sim calendar (month 0 = Jan 2000). */
export function isWinter(month: number): boolean {
  const m = month % 12;
  return m === 11 || m === 0 || m === 1;
}

/**
 * Monthly weather roll: mostly clear, sometimes overcast, sometimes
 * precipitation — which falls as snow in winter and rain otherwise.
 */
export function updateWeatherMonthly(city: CityState, rand: () => number): void {
  const roll = rand();
  if (roll < 0.55) city.weather.kind = 'clear';
  else if (roll < 0.8) city.weather.kind = 'cloudy';
  else city.weather.kind = isWinter(city.month) ? 'snow' : 'rain';
}
