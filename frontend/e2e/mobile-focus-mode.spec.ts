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
  return log;
}

async function tapBody(page: Page) {
  const box = (await page.getByTestId('swipe-surface').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function boxes(page: Page) {
  return {
    surface: await page.getByTestId('swipe-surface').boundingBox(),
    article: await page.getByRole('article').boundingBox(),
  };
}

test('FR-PRG-001: 한 번 탭하면 조작 요소가 모두 사라지고 본문 영역의 크기·위치는 그대로다', async ({ page }) => {
  await open(page);
  const viewport = page.viewportSize()!;
  const before = await boxes(page);
  expect(before.surface).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  await tapBody(page);
  for (const name of ['뒤로 가기', '보기 설정', '이전 페이지', '다음 페이지']) {
    await expect(page.getByRole('button', { name, includeHidden: true })).toBeHidden();
  }
  await expect(page.getByRole('button', { name: /목차 열기|싸비 열기/ })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await boxes(page)).toEqual(before);

  await tapBody(page);
  await expect(page.getByRole('button', { name: '뒤로 가기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await boxes(page)).toEqual(before);
});

test('FR-PRG-001: 조작 요소가 보일 때 본문 첫 줄과 끝까지 내린 마지막 줄이 가려지지 않는다', async ({ page }) => {
  await open(page);
  const headerBottom = (await page.getByRole('button', { name: '뒤로 가기' }).locator('xpath=..').boundingBox())!;
  const firstLineTop = await page.getByRole('article').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects()[0].top;
  });
  expect(firstLineTop).toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height);

  await page.getByTestId('swipe-surface').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const navTop = (await page.getByRole('navigation').boundingBox())!.y;
  const lastLineBottom = await page.getByRole('article').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    return rects[rects.length - 1].bottom;
  });
  expect(lastLineBottom).toBeLessThanOrEqual(navTop);
});

test('FR-PRG-001: 숨긴 채 밀면 쪽이 넘어가고 숨김이 유지된다, 밀기는 숨김을 바꾸지 않는다', async ({ page }) => {
  const log = await open(page);
  const { width, height } = page.viewportSize()!;
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y: height / 2, durationMs: 400 });
  await expect(page.getByRole('article')).toContainText('16쪽.');
  await expect(page.getByRole('button', { name: '뒤로 가기' })).toBeVisible();

  await tapBody(page);
  await expect(page.getByRole('button', { name: '뒤로 가기', includeHidden: true })).toBeHidden();
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y: height / 2, durationMs: 400 });
  await expect(page.getByRole('article')).toContainText('17쪽.');
  await expect(page.getByRole('button', { name: '뒤로 가기', includeHidden: true })).toBeHidden();
  expect(log.progress).toEqual([15, 16, 17]);
});
