import { expect, test, type Locator } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { noHorizontalScroll } from './support/layoutChecks';
import { BOOK_ID } from './support/fixtures';

async function press(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap();
  else await locator.click();
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: '신작' })).toBeVisible();
});

test('NFR-USE: 홈은 화면 폭을 넘치지 않는다', async ({ page }) => {
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('NFR-USE: 모바일에서는 표지 줄 안에서만 가로로 넘어간다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  const list = page.getByRole('region', { name: '신작' }).getByRole('list');
  const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('NFR-USE: 이어 읽기 버튼이 44px 이상이다', async ({ page }) => {
  const button = page
    .getByRole('region', { name: '이어 읽기' })
    .getByRole('button', { name: '이어서 읽기' });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
});

test('FR-BRW-001: 표지를 누르면 작품 페이지 주소로 이동한다', async ({ page }, testInfo) => {
  const link = page.getByRole('region', { name: '신작' }).getByRole('link', { name: '탁류' });
  await press(link, testInfo.project.name !== 'desktop');
  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}$`));
});
