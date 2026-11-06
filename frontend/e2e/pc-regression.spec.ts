import { expect, test } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'PC 회귀는 데스크톱에서만');
});

test('P2: PC 읽기 화면이 기준선과 같다', async ({ page }) => {
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('pc-reader.png');
});

test('P2: PC 싸비를 연 화면이 기준선과 같다', async ({ page }) => {
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.getByRole('button', { name: '싸비 열기' }).click();
  await expect(page.getByRole('tablist', { name: '싸비' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('pc-reader-ssabi.png');
});
