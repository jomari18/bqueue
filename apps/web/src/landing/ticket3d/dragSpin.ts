/**
 * Click-and-drag spin for the landing ticket. While held, the pointer turns it (sideways on Y, up and down on X);
 * on release it keeps a little momentum, then a damped spring settles it facing front on the nearest whole turn,
 * so "B.Queue" always reads when it rests.
 */
export type Spin = { x: number; y: number; vx: number; vy: number; dragging: boolean };

const RAD_PER_PX = 0.01;
// How much of the last drag step carries on after release, in rad/s per rad moved.
const MOMENTUM = 10;
const STIFFNESS = 25;
const DAMPING = 7;
const TURN = 2 * Math.PI;

export const createSpin = (): Spin => ({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

export function restAngle(angle: number): number {
  return Math.round(angle / TURN) * TURN || 0;
}

/** One pointer move of (dx, dy) pixels while the button is held. */
export function dragBy(s: Spin, dx: number, dy: number): void {
  s.dragging = true;
  s.y += dx * RAD_PER_PX;
  s.x += dy * RAD_PER_PX;
  s.vy = dx * RAD_PER_PX * MOMENTUM;
  s.vx = dy * RAD_PER_PX * MOMENTUM;
}

export function release(s: Spin): void {
  s.dragging = false;
}

/** Advances the spring by dt seconds; a held ticket stays where the pointer put it. */
export function stepSpin(s: Spin, dt: number): void {
  if (s.dragging) return;
  const step = Math.min(dt, 1 / 30);
  s.vy += ((restAngle(s.y) - s.y) * STIFFNESS - s.vy * DAMPING) * step;
  s.vx += ((0 - s.x) * STIFFNESS - s.vx * DAMPING) * step;
  s.y += s.vy * step;
  s.x += s.vx * step;
}
