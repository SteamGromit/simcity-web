/**
 * Soft shadows, one blur per frame.
 *
 * Every mass's cast shadow used to be a hard polygon at a third alpha laid on
 * the ground like a grey card. Now the shadow pass draws all of them, opaque,
 * into one half-resolution buffer; the buffer is composited back over the
 * ground once, blurred (a penumbra) and multiplied (so it darkens the grass
 * texture and the road markings rather than covering them). Where the canvas
 * filter property is missing the buffer is drawn as-is — a hard shadow, never
 * a missing one.
 */

/** The layer's fill. Multiplied, so it darkens toward blue. */
export const SHADOW_INK = 'rgb(58, 66, 108)';
export const SHADOW_ALPHA = 0.62;

/** Penumbra width in screen px at a zoom; clamped so a far view never smears
 * and a close one never goes hard-edged. */
export function shadowBlurPx(zoom: number): number {
  return Math.max(0.8, Math.min(3, 1.6 * zoom));
}

type Factory = (w: number, h: number) => HTMLCanvasElement;
const domFactory: Factory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const hasFilter = (ctx: CanvasRenderingContext2D): boolean =>
  typeof (ctx as { filter?: unknown }).filter === 'string';

export class ShadowLayer {
  private buf: HTMLCanvasElement | null = null;

  constructor(private factory: Factory = domFactory) {}

  /**
   * Size and clear the buffer for a frame of `w`×`h` device pixels, set the
   * camera on it at half scale, and hand back its context for the shadow
   * pass to draw into with the same painters it always used.
   */
  begin(
    main: CanvasRenderingContext2D,
    w: number,
    h: number,
    camera: { x: number; y: number; zoom: number },
    dpr: number,
  ): CanvasRenderingContext2D {
    void main;
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    if (!this.buf || this.buf.width !== bw || this.buf.height !== bh) this.buf = this.factory(bw, bh);
    const c = this.buf.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, bw, bh);
    const s = (camera.zoom * dpr) / 2;
    c.setTransform(s, 0, 0, s, -camera.x * s, -camera.y * s);
    c.fillStyle = SHADOW_INK;
    return c;
  }

  /** Lay the buffer over the frame: blurred where the browser can, multiplied
   * so it darkens what is under it. */
  end(main: CanvasRenderingContext2D, zoom: number): void {
    if (!this.buf) return;
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = 'multiply';
    main.globalAlpha = SHADOW_ALPHA;
    if (hasFilter(main)) main.filter = `blur(${shadowBlurPx(zoom)}px)`;
    main.imageSmoothingEnabled = true;
    main.drawImage(this.buf, 0, 0, main.canvas.width, main.canvas.height);
    if (hasFilter(main)) main.filter = 'none';
    main.restore();
  }
}
