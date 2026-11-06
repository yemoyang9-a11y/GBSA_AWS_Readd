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

test.describe('태블릿 세로(PC 화면)', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('Review fix 2·3: 태블릿 PC 화면의 싸비 크기와 보내기 버튼은 바뀌지 않는다', async ({ page }) => {
    await installMockApi(page);
    await page.goto(`/books/${BOOK_ID}/read`);
    await expect(page.getByRole('article')).toContainText('15쪽.');
    await page.getByRole('button', { name: '싸비 열기' }).click();
    const tab = page.getByRole('tab', { name: '챗봇' });
    await tab.click();
    expect((await tab.boundingBox())!.height).toBeLessThan(44);
    const input = page.getByRole('textbox', { name: '질문' });
    expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(16);
    const send = page.getByRole('button', { name: '질문 보내기' });
    expect((await send.boundingBox())!.width).toBeLessThan(44);
    await expect(send).toBeEnabled();
  });
});
