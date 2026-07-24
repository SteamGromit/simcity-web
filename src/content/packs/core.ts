/**
 * The game's own content. It loads through exactly the same validate →
 * register path an untrusted pack would, so the pipeline is exercised on
 * every boot rather than only when someone finally writes a mod.
 *
 * Slots are pinned to the historic Zone numbers and must never change:
 * saves store them. Ordinance and skin ids are likewise pinned, because
 * saves store ordinance ids and localStorage stores the skin id.
 */

import { BUS_TRAFFIC_SHARE, SERVICE_RADII, Zone, mapScaled } from '../../sim/types';
import type { Pack } from '../types';

export const CORE_PACK: Pack = {
  id: 'core',
  name: 'SimCity Web',
  version: '1.0.0',

  buildings: [
    { id: 'core:road', slot: Zone.Road, name: 'Road', tool: 'road', cost: 10, upkeep: 1 },
    { id: 'core:power_line', slot: Zone.PowerLine, name: 'Power Line', tool: 'line', cost: 5, upkeep: 0.2 },
    { id: 'core:park', slot: Zone.Park, name: 'Park', tool: 'park', cost: 50, upkeep: 2 },
    { id: 'core:water_pump', slot: Zone.WaterPump, name: 'Water Pump', tool: 'pump', cost: 300, upkeep: 25 },
    { id: 'core:water_pipe', slot: Zone.WaterPipe, name: 'Water Pipe', tool: 'pipe', cost: 5, upkeep: 0.2 },

    {
      id: 'core:fire_station',
      slot: Zone.FireStation,
      name: 'Fire Station',
      tool: 'fire',
      cost: 500,
      upkeep: 50,
      service: { kind: 'fire', radius: SERVICE_RADII.fire },
    },
    {
      id: 'core:police_station',
      slot: Zone.PoliceStation,
      name: 'Police Station',
      tool: 'police',
      cost: 500,
      upkeep: 50,
      service: { kind: 'police', radius: SERVICE_RADII.police },
    },
    {
      id: 'core:school',
      slot: Zone.School,
      name: 'School',
      tool: 'school',
      cost: 400,
      upkeep: 40,
      service: { kind: 'school', radius: SERVICE_RADII.school },
    },
    {
      id: 'core:hospital',
      slot: Zone.Hospital,
      name: 'Hospital',
      tool: 'hospital',
      cost: 600,
      upkeep: 60,
      service: { kind: 'health', radius: SERVICE_RADII.health },
    },
    {
      id: 'core:bus_stop',
      slot: Zone.BusStop,
      name: 'Bus Stop',
      tool: 'bus',
      cost: 150,
      upkeep: 15,
      service: { kind: 'bus', radius: SERVICE_RADII.bus, share: BUS_TRAFFIC_SHARE },
    },

    {
      id: 'core:coal_plant',
      slot: Zone.PowerPlant,
      name: 'Coal Plant',
      tool: 'plant',
      cost: 3000,
      upkeep: 150,
      power: { capacity: 240, pollution: 1.0 },
    },
    {
      id: 'core:wind_turbine',
      slot: Zone.WindTurbine,
      name: 'Wind Turbine',
      tool: 'wind',
      cost: 1200,
      upkeep: 15,
      power: { capacity: 50, pollution: 0 },
      unlock: { expr: 'population >= 2000', label: 'pop 2,000' },
    },
    {
      id: 'core:solar_farm',
      slot: Zone.SolarPlant,
      name: 'Solar Farm',
      tool: 'solar',
      cost: 2500,
      upkeep: 20,
      power: { capacity: 100, pollution: 0 },
      unlock: { expr: 'population >= 5000', label: 'pop 5,000' },
    },
    {
      id: 'core:hydro_plant',
      slot: Zone.HydroPlant,
      name: 'Hydro Plant',
      tool: 'hydro',
      cost: 5000,
      upkeep: 60,
      power: { capacity: 280, pollution: 0 },
      unlock: { expr: 'population >= 10000', label: 'pop 10,000' },
      siting: { needsWater: true },
    },
    {
      id: 'core:nuclear_plant',
      slot: Zone.NuclearPlant,
      name: 'Nuclear Plant',
      tool: 'nuclear',
      cost: 12000,
      upkeep: 300,
      power: { capacity: 700, pollution: 0.15 },
      unlock: { expr: 'population >= 25000', label: 'pop 25,000' },
    },

    {
      id: 'core:streetcar_stop',
      slot: Zone.StreetcarStop,
      name: 'Streetcar Stop',
      tool: 'streetcar',
      cost: 400,
      upkeep: 25,
      transit: { radius: mapScaled(6.5), share: 0.4 },
      unlock: { expr: 'population >= 5000', label: 'pop 5,000' },
    },
    {
      id: 'core:monorail_station',
      slot: Zone.MonorailStation,
      name: 'Monorail Station',
      tool: 'monorail',
      cost: 900,
      upkeep: 60,
      transit: { radius: mapScaled(8.5), share: 0.3 },
      unlock: { expr: 'population >= 15000', label: 'pop 15,000' },
    },
    {
      id: 'core:subway_station',
      slot: Zone.SubwayStation,
      name: 'Subway Station',
      tool: 'subway',
      cost: 1500,
      upkeep: 100,
      transit: { radius: mapScaled(10.5), share: 0.22 },
      unlock: { expr: 'population >= 30000', label: 'pop 30,000' },
    },
    {
      id: 'core:rail_terminal',
      slot: Zone.RailTerminal,
      name: 'Rail Terminal',
      tool: 'rail',
      cost: 2500,
      upkeep: 150,
      transit: { radius: mapScaled(13), share: 0.15 },
      unlock: { expr: 'population >= 50000', label: 'pop 50,000' },
    },

    // --- refuse: collection radius plus somewhere for it all to go ---
    {
      id: 'core:landfill',
      slot: Zone.Landfill,
      name: 'Landfill',
      tool: 'landfill',
      cost: 800,
      upkeep: 40,
      service: { kind: 'garbage', radius: SERVICE_RADII.landfill },
      // a working tip is a genuinely unpleasant neighbour
      waste: { capacity: 900, pollution: 0.8 },
    },
    {
      id: 'core:incinerator',
      slot: Zone.Incinerator,
      name: 'Incinerator',
      tool: 'incinerator',
      cost: 2500,
      upkeep: 140,
      service: { kind: 'garbage', radius: SERVICE_RADII.incinerator },
      // cleaner ground, but it goes up the stack instead
      waste: { capacity: 2200, pollution: 0.5 },
      unlock: { expr: 'population >= 8000', label: 'pop 8,000' },
    },
    {
      id: 'core:recycling_centre',
      slot: Zone.RecyclingCentre,
      name: 'Recycling Centre',
      tool: 'recycling',
      cost: 3000,
      upkeep: 120,
      service: { kind: 'garbage', radius: SERVICE_RADII.recycling },
      // modest to bury, but it takes a quarter of the stream out entirely
      waste: { capacity: 700, divert: 0.25, pollution: 0.1 },
      unlock: {
        expr: 'population >= 20000 && eduLevel > 0.5',
        label: 'pop 20,000 and an educated city',
      },
    },
  ],

  // ids pinned: saves store these strings as the keys of city.ordinances
  ordinances: [
    {
      id: 'cleanAir',
      label: 'Clean Air Act',
      blurb: 'Scrubbers and emission checks: industry and traffic pollute 30% less.',
      cost: 100,
      effects: { 'pollution.industry': 0.7, 'pollution.traffic': 0.7 },
    },
    {
      id: 'freeBus',
      label: 'Free Bus Service',
      blurb: 'Fare-free transit: bus-served commutes put only a quarter of the cars on the road.',
      cost: 150,
      effects: { 'transit.share': 0.5 },
    },
    {
      id: 'fireCode',
      label: 'Fire Safety Code',
      blurb: 'Inspections and sprinklers: buildings are half as likely to catch fire.',
      cost: 80,
      effects: { 'fire.ignition': 0.5 },
    },
    {
      id: 'eduGrant',
      label: 'Education Grant',
      blurb: 'Extra school funding: school coverage counts 25% stronger across its reach.',
      cost: 120,
      effects: { 'coverage.school': 1.25 },
    },
    {
      id: 'recycling',
      label: 'Recycling Program',
      blurb: 'Kerbside sorting and deposit returns: the city throws out a quarter less.',
      cost: 150,
      effects: { 'garbage.production': 0.75 },
    },
    {
      id: 'healthDrive',
      label: 'Public Health Campaign',
      blurb: 'Vaccination drives and free clinics: pandemics strike half as often and hit half as hard.',
      cost: 200,
      effects: { 'disaster.pandemicOdds': 0.5, 'disaster.pandemicToll': 0.5 },
    },
  ],

  // ids pinned: localStorage stores the active skin id
  skins: [
    {
      id: 'classic',
      label: 'Classic',
      blurb: 'The standard look.',
      hue: { mode: 'identity' },
      sat: {},
      light: {},
      outline: 0,
      heightScale: 1,
      grassSat: 1,
      roadFill: '#3a3d42',
    },
    {
      id: 'springfield',
      label: 'Springfield',
      blurb: 'Saturday-morning cartoon: bold outlines, loud colors, squat little buildings.',
      hue: { mode: 'identity' },
      sat: { mul: 1.6, add: 10 },
      light: { mul: 1.05, add: 6 },
      outline: 1.6,
      heightScale: 0.9,
      grassSat: 1.35,
      roadFill: '#4a4450',
    },
    {
      id: 'nyc',
      label: 'NYC',
      blurb: 'Brownstone and brick: muted tones, taller silhouettes, asphalt grey.',
      hue: { mode: 'wrap', base: 15, span: 40 },
      sat: { mul: 0.55, add: 8 },
      light: { mul: 0.92 },
      outline: 0,
      heightScale: 1.2,
      grassSat: 0.7,
      roadFill: '#33353a',
    },
  ],
};
