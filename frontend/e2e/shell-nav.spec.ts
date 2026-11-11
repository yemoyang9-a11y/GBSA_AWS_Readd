import { expect, test } from '@playwright/test';
import { installMockApi } from './support/mockApi';

const SAFE_BOTTOM = 34;
const MENU = ['홈', '검색', '서재', 'MY'] as const;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  await installMockApi(page);
});

test('NFR-USE: 하단 메뉴 4개가 각각 44px 이상이다', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  await expect(nav).toBeVisible();
  for (const name of MENU) {
    const box = await nav.getByRole('link', { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.height, `${name} 높이`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} 폭`).toBeGreaterThanOrEqual(44);
  }
});

test('NFR-USE: 하단 메뉴가 아래 안전 영역을 침범하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: `:root { --safe-bottom: ${SAFE_BOTTOM}px; }` });
  const { height } = page.viewportSize()!;
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  for (const name of MENU) {
    const box = await nav.getByRole('link', { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y + box!.height, `${name} 아래`).toBeLessThanOrEqual(height - SAFE_BOTTOM + 0.5);
  }
  const navBox = await nav.boundingBox();
  expect(navBox!.y + navBox!.height, '메뉴 바탕은 화면 끝까지').toBeGreaterThanOrEqual(height - 0.5);
});

test('NFR-USE: 화면을 끝까지 내리면 본문 마지막 요소가 하단 메뉴에 가려지지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: `:root { --safe-bottom: ${SAFE_BOTTOM}px; }` });
  await expect(page.getByRole('heading', { level: 1, name: '홈' })).toBeVisible();
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const filler = document.createElement('div');
    filler.style.height = '2000px';
    const last = document.createElement('p');
    last.dataset.testid = 'last-item';
    last.textContent = '마지막 항목';
    main.append(filler, last);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const last = await page.getByTestId('last-item').boundingBox();
  const nav = await page.getByRole('navigation', { name: '주 메뉴' }).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y + 0.5);
});

test('메뉴를 누르면 해당 주소로 간다', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '주 메뉴' });

  await nav.getByRole('link', { name: '서재' }).tap();
  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page.getByRole('heading', { level: 1, name: '내 서재' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '서재' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: '검색' }).tap();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('heading', { level: 1, name: '검색' })).toBeVisible();

  await nav.getByRole('link', { name: 'MY' }).tap();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MY' })).toBeVisible();

  await nav.getByRole('link', { name: '홈' }).tap();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: '홈' })).toBeVisible();
});
