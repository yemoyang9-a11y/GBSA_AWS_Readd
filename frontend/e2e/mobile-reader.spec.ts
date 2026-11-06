import { devices, expect, test } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';

const READ_URL = `/books/${BOOK_ID}/read`;

test('G15: 휴대폰이면 모바일 읽기 화면, 데스크톱이면 PC 읽기 화면', async ({ page }, testInfo) => {
  await installMockApi(page);
  await page.goto(READ_URL);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  const mobile = page.getByTestId('mobile-reader');
  if (testInfo.project.name === 'desktop') await expect(mobile).toHaveCount(0);
  else await expect(mobile).toBeVisible();
});

test.describe('모바일 전용', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  test('Review Focus 3: 페이지 입력 글자는 16px 이상', async ({ page }) => {
    await installMockApi(page);
    await page.goto(READ_URL);
    const input = page.getByRole('textbox', { name: '페이지로 이동' });
    await expect(input).toHaveValue('15');
    const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});

test.describe('가로 화면', () => {
  const { defaultBrowserType: _browser, ...landscape } = devices['iPhone 15 Pro Max landscape'];
  test.use(landscape);

  test('G16: 눕혀도 모바일 화면이 유지되고 가로 스크롤이 없다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-pro-max', '가로 화면은 한 번만');
    await installMockApi(page);
    await page.goto(READ_URL);
    await expect(page.getByTestId('mobile-reader')).toBeVisible();
    await expect(page.getByRole('article')).toContainText('15쪽.');
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});
