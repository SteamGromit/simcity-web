/**
 * Where a flyout goes. Pure geometry, no DOM — the toolbar hands it three
 * rectangles and gets a viewport position back.
 *
 * It exists apart from the toolbar because this is the part that went wrong:
 * the density and power-plant flyouts used to be positioned inside the
 * toolbar's own coordinate space, which on a phone is a drawer that slides
 * off-screen the moment a tool is armed — taking the choices with it.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Which side of the anchor it ended up on; handy for a pointer or a test. */
  side: 'right' | 'left';
}

/**
 * Beside the anchor if there is room, flipped to its other side if not, and
 * always pulled back inside the viewport rather than hanging off an edge —
 * the toolbar can be dragged anywhere, and a narrow screen may have no room
 * on either side.
 */
export function flyoutPosition(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): Placement {
  const rightOf = anchor.left + anchor.width + gap;
  const leftOf = anchor.left - size.width - gap;
  let side: 'right' | 'left' = 'right';
  let left = rightOf;
  if (rightOf + size.width > viewport.width - margin && leftOf >= margin) {
    side = 'left';
    left = leftOf;
  }
  // whatever we chose, keep it on screen; a flyout wider than the viewport
  // pins to the left margin rather than centring on nothing
  const maxLeft = Math.max(margin, viewport.width - size.width - margin);
  left = Math.max(margin, Math.min(left, maxLeft));

  const maxTop = Math.max(margin, viewport.height - size.height - margin);
  const top = Math.max(margin, Math.min(anchor.top, maxTop));
  return { left: Math.round(left), top: Math.round(top), side };
}

/**
 * Whether the compact layout's tool drawer should slide away now.
 *
 * It should once a tool is armed — that is the point of the drawer — but not
 * while a flyout is still open, because the player has not finished choosing.
 * Closing then is what made density and plant type unpickable by touch.
 */
export function shouldCloseDrawer(activeTool: unknown, flyoutOpen: boolean): boolean {
  return activeTool !== null && activeTool !== undefined && !flyoutOpen;
}
