import { expect, test, type Locator } from '@playwright/test';
import { DONE_BOOK, installMockApi } from './support/mockApi';
import { noHorizontalScroll, overflowingTexts } from './support/layoutChecks';
import { BOOK_ID } from './support/fixtures';

const LONG_TITLE = '오늘 밤, 세계에서 이 사랑이 사라진다 해도';

async function press(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap();
  else await locator.click();
}

const shelfList = (page: import('@playwright/test').Page) => page.getByRole('list', { name: '서재 책 목록' });

test.describe('서재 화면', () => {
  test.beforeEach(async ({ page }) => {
    await installMockApi(page);
    await page.goto('/shelf');
    await expect(shelfList(page).getByRole('link')).toHaveCount(2);
  });

  test('NFR-USE: 서재는 화면 폭을 넘치지 않는다', async ({ page }) => {
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test('NFR-USE: 필터 세 개가 각각 44px 이상이고 누르면 목록이 바뀐다', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name !== 'desktop';
    for (const name of ['전체', '읽는 중', '완독']) {
      const box = await page.getByRole('radio', { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }

    await press(page.getByRole('radio', { name: '완독' }), mobile);
    await expect(shelfList(page).getByRole('link')).toHaveCount(1);
    await expect(shelfList(page).getByRole('link', { name: DONE_BOOK.title })).toBeVisible();

    await press(page.getByRole('radio', { name: '읽는 중' }), mobile);
    await expect(shelfList(page).getByRole('link')).toHaveCount(1);
    await expect(shelfList(page).getByRole('link', { name: '탁류' })).toBeVisible();

    await press(page.getByRole('radio', { name: '전체' }), mobile);
    await expect(shelfList(page).getByRole('link')).toHaveCount(2);
  });

  test('FR-BRW-001: 표지를 누르면 작품 페이지 주소로 이동한다', async ({ page }, testInfo) => {
    await press(shelfList(page).getByRole('link', { name: '탁류' }), testInfo.project.name !== 'desktop');
    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}$`));
  });
});

test('NFR-USE: 긴 제목이 칸을 넘치지 않고 화면 폭도 넘치지 않는다', async ({ page }) => {
  await installMockApi(page);
  await page.route('http://api.e2e.test/books', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        books: [
          { ...DONE_BOOK, book_id: 'long-title-book', title: LONG_TITLE },
          { ...DONE_BOOK, book_id: 'long-latin-book', title: 'Supercalifragilisticexpialidocious_Supercalifragilistic' },
          DONE_BOOK,
        ],
      }),
    })
  );
  await page.goto('/shelf');
  await expect(shelfList(page).getByRole('link', { name: LONG_TITLE })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await overflowingTexts(page, '[aria-label="서재 책 목록"]')).toEqual([]);

  const cell = await shelfList(page).getByRole('listitem').first().boundingBox();
  const title = await shelfList(page).getByRole('link', { name: LONG_TITLE }).locator('p').first().boundingBox();
  expect(title!.x + title!.width).toBeLessThanOrEqual(cell!.x + cell!.width + 1);
});
