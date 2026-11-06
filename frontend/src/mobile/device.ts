const MOBILE_SHORT_SIDE_MAX = 600;

export function isMobileDevice(screen: { width: number; height: number }): boolean {
  const shortSide = Math.min(screen.width, screen.height);
  return shortSide > 0 && shortSide < MOBILE_SHORT_SIDE_MAX;
}
