export type SwipeDecision = 'next' | 'prev' | 'cancel';

export const COMMIT_RATIO = 0.25;
export const FLICK_VELOCITY = 0.5;
export const FLICK_MIN_DISTANCE = 24;

// FR-PRG-003 🚦
export function decideSwipe(i: {
  dx: number;
  dy: number;
  velocityX: number;
  width: number;
  hasPrev: boolean;
  hasNext: boolean;
}): SwipeDecision {
  if (Math.abs(i.dy) >= Math.abs(i.dx)) return 'cancel';
  const far = Math.abs(i.dx) >= i.width * COMMIT_RATIO;
  const flick =
    Math.abs(i.velocityX) >= FLICK_VELOCITY &&
    Math.abs(i.dx) >= FLICK_MIN_DISTANCE &&
    Math.sign(i.velocityX) === Math.sign(i.dx);
  if (!far && !flick) return 'cancel';
  if (i.dx < 0) return i.hasNext ? 'next' : 'cancel';
  return i.hasPrev ? 'prev' : 'cancel';
}
