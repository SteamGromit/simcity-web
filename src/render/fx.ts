/** Ambient weather visuals (rain/snow/cloud wash) on or off. Sim effects
 * and disaster rain are unaffected — this is eye candy only. */
let weatherFx = true;

export function setWeatherFx(on: boolean): void {
  weatherFx = on;
}

export function getWeatherFx(): boolean {
  return weatherFx;
}
