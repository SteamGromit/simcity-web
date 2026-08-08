import { describe, expect, test } from 'vitest';
import { flyoutPosition, shouldCloseDrawer, type Box } from '../src/ui/flyout';

/** A phone-ish viewport and the compact drawer's button geometry. */
const PHONE = { width: 420, height: 800 };
const DESKTOP = { width: 1500, height: 900 };
const FLYOUT = { width: 156, height: 150 };
const button = (left: number, top: number): Box => ({ left, top, width: 130, height: 26 });

describe('flyoutPosition', () => {
  test('sits just to the right of its button when there is room', () => {
    const at = flyoutPosition(button(17, 199), FLYOUT, PHONE);
    expect(at.side).toBe('right');
    expect(at.left).toBe(17 + 130 + 6);
    expect(at.top).toBe(199);
  });

  test('flips to the left when the right would run off the screen', () => {
    // a toolbar dragged to the right edge of a desktop window
    const at = flyoutPosition(button(1340, 200), FLYOUT, DESKTOP);
    expect(at.side).toBe('left');
    expect(at.left).toBe(1340 - 156 - 6);
  });

  test('never hangs off the right edge', () => {
    for (const x of [0, 100, 300, 419, 1000]) {
      const at = flyoutPosition(button(x, 100), FLYOUT, PHONE);
      expect(at.left + FLYOUT.width).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test('never hangs off the left edge', () => {
    for (const x of [-200, -50, 0, 5]) {
      const at = flyoutPosition(button(x, 100), FLYOUT, PHONE);
      expect(at.left).toBeGreaterThanOrEqual(8);
    }
  });

  test('a button off the bottom pulls the flyout back into view', () => {
    const at = flyoutPosition(button(17, 780), FLYOUT, PHONE);
    expect(at.top + FLYOUT.height).toBeLessThanOrEqual(PHONE.height);
    expect(at.top).toBeGreaterThanOrEqual(8);
  });

  test('a button above the top does too', () => {
    expect(flyoutPosition(button(17, -40), FLYOUT, PHONE).top).toBe(8);
  });

  test('a flyout wider than the screen pins to the margin instead of going negative', () => {
    const at = flyoutPosition(button(10, 10), { width: 900, height: 100 }, PHONE);
    expect(at.left).toBe(8);
  });

  test('a flyout taller than the screen pins to the margin too', () => {
    const at = flyoutPosition(button(10, 400), { width: 100, height: 2000 }, PHONE);
    expect(at.top).toBe(8);
  });

  test('it stays on the right when the left has no room either', () => {
    // narrow viewport, button near the left: flipping would go off-screen,
    // so it keeps the right side and clamps
    const at = flyoutPosition(button(4, 100), FLYOUT, { width: 300, height: 800 });
    expect(at.side).toBe('right');
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.left + FLYOUT.width).toBeLessThanOrEqual(300);
  });

  test('positions are integers, so nothing lands on a half pixel', () => {
    const at = flyoutPosition({ left: 17.4, top: 199.6, width: 130.2, height: 26 }, FLYOUT, PHONE);
    expect(Number.isInteger(at.left)).toBe(true);
    expect(Number.isInteger(at.top)).toBe(true);
  });
});

describe('shouldCloseDrawer', () => {
  test('an armed tool with no flyout open slides the drawer away', () => {
    expect(shouldCloseDrawer('zoneR', false)).toBe(true);
  });

  test('an armed tool with a flyout still open keeps it — the player is mid-choice', () => {
    // this is the bug: closing here took the density options off-screen with
    // the drawer, so a density could not be picked by touch at all
    expect(shouldCloseDrawer('zoneR', true)).toBe(false);
  });

  test('clearing the tool leaves the drawer alone', () => {
    expect(shouldCloseDrawer(null, false)).toBe(false);
    expect(shouldCloseDrawer(undefined, false)).toBe(false);
  });

  test('opening a bundle flyout arms nothing, so the drawer stays', () => {
    expect(shouldCloseDrawer(null, true)).toBe(false);
  });
});
