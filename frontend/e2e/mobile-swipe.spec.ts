import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi, type MockApiOptions } from './support/mockApi';
import { swipe } from './support/gestures';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function open(page: Page, opts: MockApiOptions = {}) {
  const log = await installMockApi(page, opts);
  await page.goto(`/books/${BOOK_ID}/read`);
  const start = opts.startPage ?? 15;
  await expect(page.getByRole('article')).toContainText(`${start}쪽.`);
  await expect.poll(() => log.progress.length).toBe(1);
  const width = page.viewportSize()!.width;
  const y = page.viewportSize()!.height / 2;
  const pageInput = page.getByRole('textbox', { name: '페이지로 이동' });
  return { log, width, y, pageInput };
}

test('G1: 왼쪽으로 1/4 이상 밀면 다음 페이지로 가고 진도 요청이 1건 생긴다', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page);
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
  await expect(pageInput).toHaveValue('16');
  await expect(page.getByRole('article')).toContainText('16쪽.');
  expect(log.progress).toEqual([15, 16]);
});

test('G2: 오른쪽으로 밀면 이전 페이지', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page);
  await swipe(page, { fromX: width * 0.3, toX: width * 0.8, y, durationMs: 400 });
  await expect(pageInput).toHaveValue('14');
  expect(log.progress).toEqual([15, 14]);
});

test('G3: 짧고 느리게 밀면 그대로이고 요청이 없다', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page);
  await swipe(page, { fromX: width * 0.6, toX: width * 0.6 - 60, y, durationMs: 600 });
  await page.waitForTimeout(500);
  await expect(pageInput).toHaveValue('15');
  expect(log.progress).toEqual([15]);
});

test.describe('빠른 튕김', () => {
  test.describe.configure({ retries: 2 });

  test('G4: 짧아도 빠르게 튕기면 넘어간다', async ({ page }) => {
    test.info().annotations.push({ type: 'timing', description: 'Windows 타이머 15.6ms + 병렬 부하로 합성 튕김이 늘어질 수 있어 재시도 허용' });
    const { width, y, pageInput } = await open(page);
    await swipe(page, { fromX: width * 0.6, toX: width * 0.6 - 60, y, durationMs: 50 });
    await expect(pageInput).toHaveValue('16');
  });
});

test('G5: 마지막 페이지에서 다음으로 밀면 그대로', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page, { startPage: 30 });
  await swipe(page, { fromX: width * 0.8, toX: width * 0.2, y, durationMs: 400 });
  await page.waitForTimeout(500);
  await expect(pageInput).toHaveValue('30');
  expect(log.progress).toEqual([30]);
});

test('G5: 첫 페이지에서 이전으로 밀면 그대로', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page, { startPage: 1 });
  await swipe(page, { fromX: width * 0.2, toX: width * 0.8, y, durationMs: 400 });
  await page.waitForTimeout(500);
  await expect(pageInput).toHaveValue('1');
  expect(log.progress).toEqual([1]);
});

test('G6: 페이지 안 세로 스크롤은 이동·요청을 만들지 않는다', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page);
  const fetchesBefore = log.pageFetches.length;
  await page.getByTestId('swipe-surface').evaluate((el) => (el.scrollTop = 600));
  await swipe(page, { fromX: width * 0.5, toX: width * 0.5 + 20, y: y + 150, toY: y - 150, durationMs: 300 });
  await page.waitForTimeout(500);
  await expect(pageInput).toHaveValue('15');
  expect(log.progress).toEqual([15]);
  expect(log.pageFetches.length).toBe(fetchesBefore);
});

test('Review Focus 2: 연속 두 번 밀면 16, 17 순서로 한 번씩 보낸다', async ({ page }) => {
  const { log, width, y, pageInput } = await open(page);
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
  await expect(page.getByRole('article')).toContainText('16쪽.');
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
  await expect(page.getByRole('article')).toContainText('17쪽.');
  await expect(pageInput).toHaveValue('17');
  expect(log.progress).toEqual([15, 16, 17]);
});

test('Review Focus 4: 페이지 불러오기 실패 상태에서는 밀어도 이동하지 않는다', async ({ page }) => {
  const { log, width, y } = await open(page, { failPages: [16] });
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
  await page.waitForTimeout(500);
  expect(log.pageFetches).not.toContain(17);
});
