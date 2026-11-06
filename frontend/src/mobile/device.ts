const MOBILE_SHORT_SIDE_MAX = 600;

export function isMobileDevice(screen: { width: number; height: number }): boolean {
  return Math.min(screen.width, screen.height) < MOBILE_SHORT_SIDE_MAX;
}
