import { idx } from '../sim/grid';
import { CityState } from '../sim/types';
import { ELEV_PX, isoToScreen } from './iso';

/** One airborne chunk of tornado debris. Grid-space position with a
 * screen-px height, so flights survive camera rotation. */
interface Debris {
  gx: number;
  gy: number;
  h: number; // height above ground, screen px
  vx: number; // grid units / s
  vy: number;
  vh: number; // px / s
  spin: number;
  age: number;
  ttl: number;
  size: number;
  shade: number; // 0..1 grey-brown ramp
}

const MAX_DEBRIS = 90;

/**
 * Ephemeral disaster spectacle: tornado debris and dust, storm light,
 * hurricane wind streaks. Reads sim state, never writes it; all state is
 * transient and simply rebuilds after a save/load. Always on — disaster
 * cues ignore the weather-fx toggle.
 */
export class DisasterFx {
  private debris: Debris[] = [];
  private lastTime = 0;

  step(city: CityState, now: number, timeScale = 1): void {
    const dt =
      Math.min(0.1, this.lastTime === 0 ? 0.016 : (now - this.lastTime) / 1000) * timeScale;
    this.lastTime = now;

    const tor = city.disasters.tornado;
    if (tor && dt > 0) {
      // fling a few chunks per frame from the funnel base
      for (let n = 0; n < 3 && this.debris.length < MAX_DEBRIS; n++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.2;
        this.debris.push({
          gx: tor.x + 0.5,
          gy: tor.y + 0.5,
          h: 4 + Math.random() * 30,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          vh: 30 + Math.random() * 50,
          spin: Math.random() * Math.PI * 2,
          age: 0,
          ttl: 0.8 + Math.random() * 1.4,
          size: 2 + Math.random() * 3,
          shade: Math.random(),
        });
      }
    }

    for (const d of this.debris) {
      d.age += dt;
      d.gx += d.vx * dt;
      d.gy += d.vy * dt;
      d.h += d.vh * dt;
      d.vh -= 110 * dt; // gravity wins; chunks arc over and drop
      d.spin += dt * 9;
    }
    this.debris = this.debris.filter((d) => d.age < d.ttl && d.h > -2);
  }

  /** World-space: airborne debris and the funnel's ground dust ring.
   * Call with the camera transform active, right after the funnel. */
  drawWorld(ctx: CanvasRenderingContext2D, city: CityState, now: number): void {
    const tor = city.disasters.tornado;
    if (tor) {
      const base = isoToScreen(tor.x + 0.5, tor.y + 0.5);
      const by = base.sy - city.tiles[idx(tor.x, tor.y)].elevation * ELEV_PX;
      for (let k = 0; k < 3; k++) {
        const r = 10 + k * 5 + Math.sin(now / 130 + k * 2.4) * 2;
        ctx.strokeStyle = `rgba(150, 138, 120, ${0.35 - k * 0.09})`;
        ctx.lineWidth = 2.5 - k * 0.6;
        ctx.beginPath();
        ctx.ellipse(base.sx, by, r, r * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const d of this.debris) {
      const p = isoToScreen(d.gx, d.gy);
      ctx.save();
      ctx.translate(p.sx, p.sy - d.h);
      ctx.rotate(d.spin);
      ctx.fillStyle = `hsl(${20 + d.shade * 20} 18% ${40 + d.shade * 35}%)`;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    }
  }

  /** Screen-space washes and streaks; manages its own transform. */
  drawScreen(ctx: CanvasRenderingContext2D, city: CityState, now: number): void {
    const active = city.disasters.tornado !== null || city.disasters.hurricaneTicks > 0;
    if (!active) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (city.disasters.tornado) {
      // ugly green-grey storm light while the funnel is down
      ctx.fillStyle = 'rgba(38, 42, 30, 0.20)';
      ctx.fillRect(0, 0, w, h);
    }
    if (city.disasters.hurricaneTicks > 0) {
      // near-horizontal wind streaks over the driving rain
      ctx.strokeStyle = 'rgba(210, 225, 240, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const shift = (now / 1.2) % 160;
      for (let row = 0; row < h; row += 46) {
        for (let x = ((row * 37) % 91) - 160; x < w; x += 160) {
          const y = row + ((now / 6) % 46);
          ctx.moveTo(x + shift, y);
          ctx.lineTo(x + shift + 34, y + 4);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
