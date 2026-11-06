import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { swipe } from './support/gestures';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function open(page: Page) {
  const log = await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await expect.poll(() => log.progress.length).toBe(1);
  const { width, height } = page.viewportSize()!;
  return { log, width, height };
}

test('G9: 싸비 손잡이로 전체 화면 싸비를 열고, 같은 손잡이로 닫는다', async ({ page }) => {
  const { width, height } = await open(page);
  await page.getByRole('button', { name: '싸비' }).click();
  const sheet = page.getByTestId('mobile-ssabi');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('tablist', { name: '싸비' })).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - height)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: '싸비' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('15');
});

test('C4: 양옆 손잡이는 44px 이상 눌린다', async ({ page }) => {
  await open(page);
  for (const name of ['목차', '싸비']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('C3: 손잡이의 보이는 부분이 본문 글줄과 겹치지 않는다', async ({ page }) => {
  await open(page);
  const textBox = await page.getByRole('article').evaluate((article) => {
    const range = document.createRange();
    range.selectNodeContents(article);
    const r = range.getBoundingClientRect();
    const style = getComputedStyle(article);
    return {
      left: r.left + parseFloat(style.paddingLeft),
      right: r.right - parseFloat(style.paddingRight),
    };
  });
  for (const name of ['목차', '싸비']) {
    const tab = (await page.getByRole('button', { name, exact: true }).getByTestId('edge-handle-tab').boundingBox())!;
    if (name === '목차') expect(tab.x + tab.width).toBeLessThanOrEqual(textBox.left);
    else expect(tab.x).toBeGreaterThanOrEqual(textBox.right);
  }
});

test('Review Focus 1: 싸비가 열린 상태에서 옆으로 끌어도 페이지가 넘어가지 않는다', async ({ page }) => {
  const { log, width, height } = await open(page);
  await page.getByRole('button', { name: '싸비' }).click();
  await expect(page.getByTestId('mobile-ssabi')).toBeVisible();
  await swipe(page, { fromX: width * 0.8, toX: width * 0.2, y: height * 0.5, durationMs: 300 });
  await page.waitForTimeout(500);
  expect(log.progress).toEqual([15]);
});

test('Review Focus 5: 손잡이에서 시작한 끌기로는 페이지가 넘어가지 않는다', async ({ page }) => {
  const { log, width } = await open(page);
  const box = (await page.getByRole('button', { name: '싸비' }).boundingBox())!;
  const y = box.y + box.height / 2;
  await swipe(page, { fromX: box.x + box.width / 2, toX: width * 0.2, y, durationMs: 300 });
  await page.waitForTimeout(500);
  await expect(page.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('15');
  expect(log.progress).toEqual([15]);
});
