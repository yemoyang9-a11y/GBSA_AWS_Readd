import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID, bookInfo } from './support/fixtures';
import { installMockApi, type MockApiOptions } from './support/mockApi';
import { noHorizontalScroll, overflowingTexts, smallTapTargets } from './support/layoutChecks';

const API = 'http://api.e2e.test';
const BOOK_URL = `/books/${BOOK_ID}`;
const SAFE_BOTTOM = 34;
const MANY_CHAPTERS = Array.from({ length: 20 }, (_, i) => ({
  chapter_no: i + 1,
  title: `${i + 1}번째 장`,
  start_page: i * 10 + 1,
  end_page: (i + 1) * 10,
}));

async function open(page: Page, opts: MockApiOptions = {}) {
  const log = await installMockApi(page, {
    totalPages: 200,
    startPage: 15,
    positions: {
      [BOOK_ID]: { applied_cutoff: 15, current_chapter_no: 2, read_chapter_nos: [1], is_complete: false },
    },
    ...opts,
  });
  await page.route(`${API}/books/${BOOK_ID}/info`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify({ ...bookInfo(200), chapters: MANY_CHAPTERS }),
    })
  );
  await page.goto(BOOK_URL);
  await page.addStyleTag({ content: `:root { --safe-bottom: ${SAFE_BOTTOM}px; }` });
  await expect(page.getByRole('heading', { level: 1, name: '탁류' })).toBeVisible();
  await expect(page.getByRole('button', { name: /20번째 장/ })).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  return log;
}

const readButton = (page: Page) => page.getByRole('button', { name: '이어서 읽기' });

test.describe('모바일 작품 페이지', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  test('NFR-USE: 읽기 버튼은 스크롤해도 화면 아래에 있고 아래 안전 영역을 침범하지 않는다', async ({ page }) => {
    await open(page);
    const { height } = page.viewportSize()!;

    const before = await readButton(page).boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole('button', { name: /20번째 장/ })).toBeInViewport();
    const after = await readButton(page).boundingBox();

    for (const box of [before!, after!]) {
      expect(box.y + box.height, '버튼 아래').toBeLessThanOrEqual(height - SAFE_BOTTOM + 0.5);
      expect(box.y, '버튼은 화면 아래쪽에 있다').toBeGreaterThan(height - 140);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  });

  test('NFR-USE: 목차 마지막 줄이 읽기 버튼에 가려지지 않는다', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const last = await page.getByRole('button', { name: /20번째 장/ }).boundingBox();
    const bar = await readButton(page).locator('..').boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y + 0.5);
  });

  test('NFR-USE: 목차 줄과 누르는 대상이 모두 44px 이상이다', async ({ page }) => {
    await open(page);
    const rows = page.getByRole('list', { name: '목차' }).getByRole('button');
    await expect(rows).toHaveCount(20);
    for (const box of await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
    expect(await smallTapTargets(page)).toEqual([]);
  });

  test('NFR-USE: 가로로 넘치지 않고 글자가 잘리지 않는다', async ({ page }) => {
    await open(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await overflowingTexts(page)).toEqual([]);
  });

  test('FR-BRF-001: 읽기 버튼을 누르면 서버가 정한 브리핑 주소로 가고 진도 요청은 없다', async ({ page }) => {
    const log = await open(page, { entryRoute: 'briefing' });

    await readButton(page).tap();

    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/briefing$`));
    expect(log.entries).toBe(1);
    expect(log.progress).toEqual([]);
  });
});

test('FR-BRF-001: PC 작품 페이지의 읽기 버튼은 표지 아래에 있고 누르면 브리핑으로 간다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱 프로젝트에서만');
  const log = await open(page, { entryRoute: 'briefing' });

  const title = await page.getByRole('heading', { level: 1, name: '탁류' }).boundingBox();
  const button = await readButton(page).boundingBox();
  expect(button!.y).toBeGreaterThan(title!.y + title!.height);
  expect(await readButton(page).locator('..').evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');
  expect(await noHorizontalScroll(page)).toBe(true);

  await readButton(page).click();

  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/briefing$`));
  expect(log.entries).toBe(1);
  expect(log.progress).toEqual([]);
});
