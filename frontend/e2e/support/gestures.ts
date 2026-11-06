import type { Page } from '@playwright/test';

export interface SwipeOptions {
  fromX: number;
  toX: number;
  y: number;
  durationMs: number;
  steps?: number;
}

export async function swipe(page: Page, opts: SwipeOptions): Promise<void> {
  const steps = opts.steps ?? 8;
  await page.evaluate(
    async ({ fromX, toX, y, durationMs, steps }) => {
      const target = document.elementFromPoint(fromX, y) ?? document.body;
      const fire = (type: string, x: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          })
        );
      fire('pointerdown', fromX);
      for (let i = 1; i <= steps; i++) {
        await new Promise((resolve) => setTimeout(resolve, durationMs / steps));
        fire('pointermove', fromX + ((toX - fromX) * i) / steps);
      }
      fire('pointerup', toX);
    },
    { ...opts, steps }
  );
}
