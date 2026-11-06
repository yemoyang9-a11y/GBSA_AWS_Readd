import type { Page } from '@playwright/test';

export async function installFakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    let keyboard = 0;
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight - keyboard },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport });
    (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px: number) => {
      keyboard = px;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
}

export async function showKeyboard(page: Page, px: number): Promise<void> {
  await page.evaluate((px) => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(px), px);
}

export async function hideKeyboard(page: Page): Promise<void> {
  await showKeyboard(page, 0);
}
