import { expect, test } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { noHorizontalScroll } from './support/layoutChecks';
import { BOOK_ID } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
  await page.goto('/search');
  await expect(page.getByRole('list', { name: '검색 결과' }).getByRole('link', { name: '탁류, 채만식', exact: true })).toBeVisible();
});

test('NFR-USE: 검색 화면은 화면 폭을 넘치지 않는다', async ({ page }) => {
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('NFR-USE: 입력창 글자는 16px 이상이고 높이는 44px 이상이라 눌러도 화면이 확대되지 않는다', async ({ page }, testInfo) => {
  const input = page.locator('#book-search');
  if (testInfo.project.name === 'desktop') await input.click();
  else await input.tap();
  const { fontSize, height } = await input.evaluate((el) => ({
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    height: el.getBoundingClientRect().height,
  }));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  expect(height).toBeGreaterThanOrEqual(44);
  const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  expect(scale).toBe(1);
});

test('FR-BRW-001: 입력하면 결과가 걸러지고 주소의 q가 바뀐다', async ({ page }) => {
  await page.locator('#book-search').fill('시험');
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole('list', { name: '검색 결과' }).getByRole('link')).toHaveCount(2);
  await page.locator('#book-search').fill('없는작품');
  await expect(page.getByText('찾는 작품이 없습니다')).toBeVisible();
});

test('FR-BRW-001: 결과를 누르면 작품 페이지 주소로 이동한다', async ({ page }, testInfo) => {
  const link = page.getByRole('list', { name: '검색 결과' }).getByRole('link', { name: '탁류, 채만식', exact: true });
  if (testInfo.project.name === 'desktop') await link.click();
  else await link.tap();
  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}$`));
});
