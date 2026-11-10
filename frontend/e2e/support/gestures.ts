import type { Page } from '@playwright/test';

export interface SwipeOptions {
  fromX: number;
  toX: number;
  y: number;
  toY?: number;
  durationMs: number;
  steps?: number;
}

export async function swipe(page: Page, opts: SwipeOptions): Promise<void> {
  const steps = opts.steps ?? 8;
  await page.evaluate(
    async ({ fromX, toX, y, toY, durationMs, steps }) => {
      const endY = toY ?? y;
      const target = document.elementFromPoint(fromX, y) ?? document.body;
      const fire = (type: string, x: number, py: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: py,
          })
        );
      const t0 = performance.now();
      fire('pointerdown', fromX, y);
      let progress = 0;
      while (progress < 1) {
        await new Promise((resolve) => setTimeout(resolve, durationMs / steps));
        progress = Math.min(1, (performance.now() - t0) / durationMs);
        fire('pointermove', fromX + (toX - fromX) * progress, y + (endY - y) * progress);
      }
      fire('pointerup', toX, endY);
    },
    { ...opts, toY: opts.toY ?? opts.y, steps }
  );
}
