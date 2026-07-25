/**
 * The monthly ledger the charts read.
 *
 * One sample per series per month, newest last, capped at HISTORY_MAX. Series
 * are declared once here — adding a chart means adding a row to HISTORY_SPECS
 * and nothing else, because the sampler, the save reviver, and the charts
 * panel all walk this list.
 *
 * Rates (land value, pollution, crime, education) are stored as whole percent
 * so a chart never has to know they were fractions; counts are counts.
 */

import { capacityFor } from './tiers';
import { CityState, Zone } from './types';

/** How many of each kind of thing happened during the month being closed. */
export interface MonthEvents {
  fires: number;
  crimes: number;
  accidents: number;
  collapses: number;
}

export const HISTORY_KEYS = [
  'pop',
  'funds',
  'jobs',
  'income',
  'expenses',
  'rLots',
  'cLots',
  'iLots',
  'densLow',
  'densMed',
  'densHigh',
  'landValue',
  'pollution',
  'crime',
  'traffic',
  'eduLevel',
  'fires',
  'crimes',
  'accidents',
  'collapses',
] as const;

export type HistoryKey = (typeof HISTORY_KEYS)[number];

/** Every series, as parallel arrays of monthly samples. */
export type History = Record<HistoryKey, number[]>;

/** How a series is grouped, labelled, and formatted for the charts panel. */
export interface HistorySpec {
  key: HistoryKey;
  group: 'City' | 'Money' | 'Zones & density' | 'Conditions' | 'Incidents';
  label: string;
  /** Suffix or currency mark for the readout; '' for a bare count. */
  unit: '' | '%' | '§';
  /** Meaningful "per 1,000 residents"? Stocks are, rates are not. */
  perCapita: boolean;
}

export const HISTORY_SPECS: readonly HistorySpec[] = [
  { key: 'pop', group: 'City', label: 'Population', unit: '', perCapita: false },
  { key: 'jobs', group: 'City', label: 'Jobs', unit: '', perCapita: true },
  { key: 'eduLevel', group: 'City', label: 'Education', unit: '%', perCapita: false },

  { key: 'funds', group: 'Money', label: 'Funds', unit: '§', perCapita: false },
  { key: 'income', group: 'Money', label: 'Monthly income', unit: '§', perCapita: true },
  { key: 'expenses', group: 'Money', label: 'Monthly expenses', unit: '§', perCapita: true },

  { key: 'rLots', group: 'Zones & density', label: 'Residential lots', unit: '', perCapita: true },
  { key: 'cLots', group: 'Zones & density', label: 'Commercial lots', unit: '', perCapita: true },
  { key: 'iLots', group: 'Zones & density', label: 'Industrial lots', unit: '', perCapita: true },
  { key: 'densLow', group: 'Zones & density', label: 'Low-density lots', unit: '', perCapita: true },
  { key: 'densMed', group: 'Zones & density', label: 'Medium-density lots', unit: '', perCapita: true },
  { key: 'densHigh', group: 'Zones & density', label: 'High-density lots', unit: '', perCapita: true },

  { key: 'landValue', group: 'Conditions', label: 'Land value', unit: '%', perCapita: false },
  { key: 'pollution', group: 'Conditions', label: 'Pollution', unit: '%', perCapita: false },
  { key: 'crime', group: 'Conditions', label: 'Crime', unit: '%', perCapita: false },
  { key: 'traffic', group: 'Conditions', label: 'Traffic per road tile', unit: '', perCapita: false },

  { key: 'fires', group: 'Incidents', label: 'Fires started', unit: '', perCapita: true },
  { key: 'crimes', group: 'Incidents', label: 'Crimes reported', unit: '', perCapita: true },
  { key: 'accidents', group: 'Incidents', label: 'Traffic accidents', unit: '', perCapita: true },
  { key: 'collapses', group: 'Incidents', label: 'Building collapses', unit: '', perCapita: true },
];

export function emptyHistory(): History {
  return Object.fromEntries(HISTORY_KEYS.map((k) => [k, [] as number[]])) as History;
}

export function noMonthEvents(): MonthEvents {
  return { fires: 0, crimes: 0, accidents: 0, collapses: 0 };
}

const isRCI = (z: Zone): boolean =>
  z === Zone.Residential || z === Zone.Commercial || z === Zone.Industrial;

/** This month's value for every series. Pure: it reads the city, nothing else. */
export function sampleHistory(city: CityState, events: MonthEvents): Record<HistoryKey, number> {
  let rLots = 0;
  let cLots = 0;
  let iLots = 0;
  const dens = [0, 0, 0, 0];
  let lvSum = 0;
  let polSum = 0;
  let crimeSum = 0;
  let lots = 0;
  let trafficSum = 0;
  let roadTiles = 0;
  let jobs = 0;

  for (const t of city.tiles) {
    if (t.zone === Zone.Road && !t.median) {
      roadTiles++;
      trafficSum += t.traffic;
    }
    if (!isRCI(t.zone) || t.stage === 0 || t.abandoned) continue;
    lots++;
    dens[t.density]++;
    if (t.zone === Zone.Residential) rLots++;
    else if (t.zone === Zone.Commercial) cLots++;
    else iLots++;
    if (t.zone !== Zone.Residential) jobs += capacityFor(t.zone, t.tier, t.stage);
    lvSum += t.landValue;
    polSum += t.pollution;
    crimeSum += t.crime;
  }

  const avg = (sum: number, n: number) => (n === 0 ? 0 : sum / n);
  const b = city.lastBudget;
  return {
    pop: city.population,
    funds: city.funds,
    jobs,
    income: b.rIncome + b.cIncome + b.iIncome,
    expenses: b.expenses,
    rLots,
    cLots,
    iLots,
    densLow: dens[1],
    densMed: dens[2],
    densHigh: dens[3],
    landValue: Math.round(avg(lvSum, lots) * 100),
    pollution: Math.round(avg(polSum, lots) * 100),
    crime: Math.round(avg(crimeSum, lots) * 100),
    traffic: Math.round(avg(trafficSum, roadTiles) * 10) / 10,
    eduLevel: Math.round(city.eduLevel * 100),
    fires: events.fires,
    crimes: events.crimes,
    accidents: events.accidents,
    collapses: events.collapses,
  };
}

/** Append one month to every series and trim to the cap. */
export function pushHistory(history: History, sample: Record<HistoryKey, number>, cap: number): void {
  for (const key of HISTORY_KEYS) {
    const series = history[key];
    series.push(sample[key]);
    if (series.length > cap) series.splice(0, series.length - cap);
  }
}
