import { expect, test, type Page } from '@playwright/test';
import { installMockApi } from './support/mockApi';

interface Sample {
  path: string;
  top: number | null;
  bottom: number | null;
  running: number;
}

async function clickAndSample(page: Page, linkSelector: string, fixedSelector: string): Promise<Sample[]> {
  return page.evaluate(
    async ([linkSel, fixedSel]) => {
      (document.querySelector(linkSel) as HTMLElement).click();
      const out: { path: string; top: number | null; bottom: number | null; running: number }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 500) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const fixed = fixedSel.startsWith('text=')
          ? Array.from(document.querySelectorAll('button')).find((b) => b.textContent === fixedSel.slice(5))
          : document.querySelector(fixedSel);
        const box = fixed?.getBoundingClientRect();
        const fade = document.querySelector('[data-testid="route-fade"]');
        out.push({
          path: location.pathname,
          top: box ? box.top : null,
          bottom: box ? box.bottom : null,
          running: fade ? fade.getAnimations().length : 0,
        });
      }
      return out;
    },
    [linkSelector, fixedSelector]
  );
}

async function settledFade(page: Page) {
  return page.getByTestId('route-fade').evaluate((el) => {
    const style = getComputedStyle(el);
    return { transform: style.transform, opacity: style.opacity, running: el.getAnimations().length };
  });
}

test.describe('모바일 화면 전환', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  test('NFR-USE: 메뉴를 바꾸는 동안 하단 메뉴가 제자리에 있고 페이드가 돌았다가 끝나면 아무것도 남지 않는다', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav).toBeVisible();
    const start = (await nav.boundingBox())!;

    const samples = await clickAndSample(page, 'nav[aria-label="주 메뉴"] a[href="/shelf"]', 'nav[aria-label="주 메뉴"]');

    const onShelf = samples.filter((s) => s.path === '/shelf');
    expect(onShelf.length).toBeGreaterThan(0);
    expect(onShelf.some((s) => s.running > 0)).toBe(true);
    for (const s of onShelf) expect(s.top).toBeCloseTo(start.y, 0);
    await expect.poll(() => settledFade(page)).toEqual({ transform: 'none', opacity: '1', running: 0 });
  });

  test('NFR-USE: 작품 페이지로 넘어가는 동안 화면 아래 고정 읽기 버튼이 흔들리지 않는다', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    await expect(page.getByRole('region', { name: '신작' })).toBeVisible();

    const samples = await clickAndSample(page, 'section[aria-labelledby] a[aria-label="탁류"]', 'text=이어서 읽기');
    await expect(page.getByRole('button', { name: '이어서 읽기' })).toBeVisible();
    await expect.poll(() => settledFade(page)).toEqual({ transform: 'none', opacity: '1', running: 0 });
    const final = (await page.getByRole('button', { name: '이어서 읽기' }).boundingBox())!;

    const withButton = samples.filter((s) => s.path.startsWith('/books/') && s.bottom !== null);
    expect(withButton.some((s) => s.running > 0)).toBe(true);
    for (const s of withButton) expect(s.bottom).toBeCloseTo(final.y + final.height, 0);
  });
});

test('NFR-USE: 움직임 줄이기 설정이면 화면이 바뀌어도 페이드가 돌지 않는다', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMockApi(page);
  await page.goto('/');
  const link =
    testInfo.project.name === 'desktop'
      ? 'header nav[aria-label="주 메뉴"] a[href="/shelf"]'
      : 'nav[aria-label="주 메뉴"] a[href="/shelf"]';
  await expect(page.locator(link)).toBeVisible();

  const samples = await clickAndSample(page, link, 'nav[aria-label="주 메뉴"]');

  const onShelf = samples.filter((s) => s.path === '/shelf');
  expect(onShelf.length).toBeGreaterThan(0);
  expect(onShelf.every((s) => s.running === 0)).toBe(true);
});

test('NFR-USE: PC에서 메뉴를 바꾸는 동안 위 줄 메뉴가 제자리에 있고 페이드가 돈다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 프로젝트에서만');
  await installMockApi(page);
  await page.goto('/');
  const header = page.locator('header');
  await expect(header).toBeVisible();
  const start = (await header.boundingBox())!;

  const samples = await clickAndSample(page, 'header nav[aria-label="주 메뉴"] a[href="/shelf"]', 'header');

  const onShelf = samples.filter((s) => s.path === '/shelf');
  expect(onShelf.some((s) => s.running > 0)).toBe(true);
  for (const s of onShelf) expect(s.top).toBeCloseTo(start.y, 0);
  await expect.poll(() => settledFade(page)).toEqual({ transform: 'none', opacity: '1', running: 0 });
});
