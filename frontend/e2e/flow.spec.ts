import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import {
  DONE_BOOK,
  installMockApi,
  UNREAD_BOOK,
  type ApiLog,
  type MockApiOptions,
} from './support/mockApi';

const API = 'http://api.e2e.test';
const BOOK_URL = `/books/${BOOK_ID}`;
const READ_URL = new RegExp(`/books/${BOOK_ID}/read$`);
const BRIEFING_URL = new RegExp(`/books/${BOOK_ID}/briefing$`);
const BOOK_URL_RE = new RegExp(`/books/${BOOK_ID}$`);
const SSABI_PATH = /\/(ssabi|recap|chat)\//;

const isDesktop = (testInfo: TestInfo) => testInfo.project.name === 'desktop';

async function press(locator: Locator, testInfo: TestInfo) {
  if (isDesktop(testInfo)) await locator.click();
  else await locator.tap();
}

async function start(page: Page, url: string, opts: MockApiOptions = {}) {
  const log = await installMockApi(page, opts);
  await page.goto(url);
  return log;
}

const pageInput = (page: Page) => page.getByLabel('페이지로 이동');
const readButton = (page: Page) => page.getByRole('button', { name: '이어서 읽기' });
const chapterButton = (page: Page, title: RegExp) =>
  page.getByRole('list', { name: '목차' }).getByRole('button', { name: title });

async function openBookFromHome(page: Page, testInfo: TestInfo) {
  await press(
    page.getByRole('region', { name: '신작' }).getByRole('link', { name: '탁류' }),
    testInfo
  );
  await expect(page).toHaveURL(BOOK_URL_RE);
  await expect(page.getByRole('heading', { level: 1, name: '탁류' })).toBeVisible();
}

async function enterChapterThree(page: Page, testInfo: TestInfo) {
  const chapter = chapterButton(page, /신판 흥보전/);
  await expect(chapter).toBeEnabled();
  await press(chapter, testInfo);
}

async function continueFromBriefing(page: Page, testInfo: TestInfo) {
  await expect(page).toHaveURL(BRIEFING_URL);
  await press(readButton(page), testInfo);
  await expect(page).toHaveURL(READ_URL);
}

test('FR-BRF-001: 홈 → 표지 → 작품 페이지 → 이어서 읽기 → 브리핑(새 세션) → 읽기', async ({
  page,
}, testInfo) => {
  const log = await start(page, '/', { entryRoute: 'briefing' });

  await openBookFromHome(page, testInfo);
  expect(log.entries).toBe(0);
  await press(readButton(page), testInfo);
  await expect(page).toHaveURL(BRIEFING_URL);
  await expect(readButton(page)).toBeVisible();
  expect(log.entries).toBe(1);
  await continueFromBriefing(page, testInfo);

  await expect(pageInput(page)).toHaveValue('15');
});

test('FR-BRF-001: 홈의 이어 읽기 버튼은 작품 페이지를 거치지 않고 들어간다', async ({
  page,
}, testInfo) => {
  const log = await start(page, '/', { entryRoute: 'briefing' });

  const strip = page.getByRole('region', { name: '이어 읽기' });
  await press(strip.getByRole('button', { name: '이어서 읽기' }), testInfo);

  await expect(page).toHaveURL(BRIEFING_URL);
  await expect(readButton(page)).toBeVisible();
  expect(log.entries).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

async function backTwiceWithoutNewRequests(page: Page, testInfo: TestInfo, log: ApiLog) {
  await expect.poll(() => log.progress).toEqual([15]);
  const entries = log.entries;

  await press(page.getByRole('button', { name: '뒤로 가기' }), testInfo);
  await expect(page).toHaveURL(BOOK_URL_RE);
  await expect(page.getByRole('heading', { level: 1, name: '탁류' })).toBeVisible();
  await press(page.getByRole('button', { name: '뒤로 가기' }), testInfo);

  return async () => {
    await page.waitForTimeout(500);
    expect(log.entries).toBe(entries);
    expect(log.progress).toEqual([15]);
  };
}

test('FR-BRW-003: 서재 → 작품 → 읽기에서 뒤로 두 번이면 서재이고 진입·진도 요청이 다시 나가지 않는다', async ({
  page,
}, testInfo) => {
  const log = await start(page, '/shelf');

  await press(
    page.getByRole('list', { name: '서재 책 목록' }).getByRole('link', { name: '탁류' }),
    testInfo
  );
  await expect(page).toHaveURL(BOOK_URL_RE);
  await press(readButton(page), testInfo);
  await expect(page).toHaveURL(READ_URL);
  await expect(pageInput(page)).toHaveValue('15');

  const noNewRequests = await backTwiceWithoutNewRequests(page, testInfo, log);

  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page.getByRole('heading', { level: 1, name: '내 서재' })).toBeVisible();
  await noNewRequests();
});

test('FR-BRW-003: 홈 → 이어 읽기 → 읽기에서 뒤로 두 번이면 홈이고 진입·진도 요청이 다시 나가지 않는다', async ({
  page,
}, testInfo) => {
  const log = await start(page, '/');

  await press(
    page.getByRole('region', { name: '이어 읽기' }).getByRole('button', { name: '이어서 읽기' }),
    testInfo
  );
  await expect(page).toHaveURL(READ_URL);
  await expect(pageInput(page)).toHaveValue('15');

  const noNewRequests = await backTwiceWithoutNewRequests(page, testInfo, log);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('region', { name: '신작' })).toBeVisible();
  await noNewRequests();
});

test('FR-BRW-003: 작품 → 브리핑 → 읽기에서 뒤로 가기는 브리핑을 다시 거치지 않고 작품 페이지로 간다', async ({
  page,
}, testInfo) => {
  const log = await start(page, '/shelf', { entryRoute: 'briefing' });

  await press(
    page.getByRole('list', { name: '서재 책 목록' }).getByRole('link', { name: '탁류' }),
    testInfo
  );
  await press(readButton(page), testInfo);
  await continueFromBriefing(page, testInfo);
  await expect(pageInput(page)).toHaveValue('15');

  const noNewRequests = await backTwiceWithoutNewRequests(page, testInfo, log);

  await expect(page).toHaveURL(/\/shelf$/);
  await noNewRequests();
});

test('FR-SPL-002: 이 흐름에서 싸비 관련 요청은 읽기 화면에서 아모를 열기 전까지 0건이고, 열면 현재 쪽 기준 관계도 1건이다', async ({
  page,
}, testInfo) => {
  const ssabiRequests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === API && request.method() !== 'OPTIONS' && SSABI_PATH.test(url.pathname)) {
      ssabiRequests.push(url);
    }
  });
  await start(page, '/');

  await openBookFromHome(page, testInfo);
  await press(readButton(page), testInfo);
  await expect(page).toHaveURL(READ_URL);
  await expect(page.getByRole('article')).toBeVisible();
  await expect(pageInput(page)).toHaveValue('15');
  await page.waitForTimeout(500);
  expect(ssabiRequests.map((url) => url.pathname)).toEqual([]);

  await press(page.getByRole('button', { name: '싸비 열기' }), testInfo);

  await expect.poll(() => ssabiRequests.length).toBe(1);
  await page.waitForTimeout(500);
  expect(ssabiRequests.map((url) => url.pathname)).toEqual([`/books/${BOOK_ID}/ssabi/graph`]);
  expect(ssabiRequests[0].searchParams.get('page')).toBe('15');
});

test('FR-PRG-003: 작품 페이지 목차 → 장 누르기 → 브리핑 → 읽기에서 그 장의 첫 쪽이 열리고 진도 요청은 1건이다', async ({
  page,
}, testInfo) => {
  const log = await start(page, BOOK_URL, { entryRoute: 'briefing' });

  await enterChapterThree(page, testInfo);
  await expect(page).toHaveURL(BRIEFING_URL);
  await expect(readButton(page)).toBeVisible();
  expect(log.entries).toBe(1);
  expect(log.progress).toEqual([]);
  await continueFromBriefing(page, testInfo);

  await expect(pageInput(page)).toHaveValue('21');
  await expect.poll(() => log.progress).toEqual([21]);
});

test('FR-PRG-003: 브리핑 목차에서 장을 고르면 읽기에서 그 장의 첫 쪽이 열리고 진도 요청은 그 쪽으로 1건이다', async ({
  page,
}, testInfo) => {
  const log = await start(page, `/books/${BOOK_ID}/briefing`);

  await press(page.getByRole('button', { name: /목차/ }), testInfo);
  await press(chapterButton(page, /신판 흥보전/), testInfo);

  await expect(page).toHaveURL(READ_URL);
  await expect(pageInput(page)).toHaveValue('21');
  await expect.poll(() => log.progress).toEqual([21]);
});

test('FR-PRG-003: 장을 눌러 들어온 뒤 읽던 곳으로 돌아가기를 누르면 원래 쪽이 열리고 돌아가기 줄이 사라진다', async ({
  page,
}, testInfo) => {
  const log = await start(page, BOOK_URL);

  await enterChapterThree(page, testInfo);
  await expect(page).toHaveURL(READ_URL);
  await expect(pageInput(page)).toHaveValue('21');
  const bar = page.getByRole('status').filter({ hasText: '15쪽에서 옮겨 왔어요' });
  await expect(bar).toBeVisible();

  await press(page.getByRole('button', { name: '읽던 곳으로 돌아가기' }), testInfo);

  await expect(pageInput(page)).toHaveValue('15');
  await expect(bar).toHaveCount(0);
  await expect.poll(() => log.progress).toEqual([21, 15]);
});

test('FR-PRG-003: 장을 눌러 브리핑까지 갔다가 뒤로 나온 뒤 읽기 버튼으로 들어가면 서버가 준 쪽에서 시작한다', async ({
  page,
}, testInfo) => {
  const log = await start(page, BOOK_URL, { entryRoute: 'briefing' });

  await enterChapterThree(page, testInfo);
  await expect(page).toHaveURL(BRIEFING_URL);
  await expect(readButton(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(BOOK_URL_RE);

  await press(readButton(page), testInfo);
  await continueFromBriefing(page, testInfo);

  await expect(pageInput(page)).toHaveValue('15');
  await expect.poll(() => log.progress).toEqual([15]);
  await expect(page.getByText('쪽에서 옮겨 왔어요')).toHaveCount(0);
});

test('FR-PRG-003: 장을 누르고 진입 응답 전에 뒤로 가면 홈 이어 읽기는 서버가 준 쪽에서 시작한다', async ({
  page,
}, testInfo) => {
  const log = await installMockApi(page);
  let releaseFirstEntry = () => {};
  const firstEntryHeld = new Promise<void>((resolve) => {
    releaseFirstEntry = resolve;
  });
  let entryCalls = 0;
  await page.route(`${API}/books/${BOOK_ID}/entry`, async (route) => {
    if (route.request().method() === 'POST' && ++entryCalls === 1) await firstEntryHeld;
    await route.fallback();
  });
  await page.goto('/');
  await openBookFromHome(page, testInfo);

  await enterChapterThree(page, testInfo);
  await expect.poll(() => entryCalls).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  releaseFirstEntry();
  await expect.poll(() => log.entries).toBe(1);
  await expect(page).toHaveURL(/\/$/);

  await press(
    page.getByRole('region', { name: '이어 읽기' }).getByRole('button', { name: '이어서 읽기' }),
    testInfo
  );

  await expect(page).toHaveURL(READ_URL);
  await expect(pageInput(page)).toHaveValue('15');
  await expect.poll(() => log.progress).toEqual([15]);
  await expect(page.getByText('쪽에서 옮겨 왔어요')).toHaveCount(0);
});

test('FR-PRG-003: 장 이동으로 들어온 읽기 화면을 새로고침하면 서버가 저장한 쪽이 열리고 예약이 다시 실행되지 않는다', async ({
  page,
}, testInfo) => {
  const log = await start(page, BOOK_URL);

  await enterChapterThree(page, testInfo);
  await expect(pageInput(page)).toHaveValue('21');
  await expect.poll(() => log.progress).toEqual([21]);

  await page.reload();

  await expect(pageInput(page)).toHaveValue('21');
  await expect.poll(() => log.progress).toEqual([21, 21]);
  await page.waitForTimeout(500);
  expect(log.progress).toEqual([21, 21]);
  await expect(page.getByText('쪽에서 옮겨 왔어요')).toHaveCount(0);
});

test('FR-SPL-002: 장 이동 뒤 작품 페이지로 돌아오면 읽음 표시가 새 응답대로 바뀐다', async ({
  page,
}, testInfo) => {
  const log = await start(page, BOOK_URL);

  const second = chapterButton(page, /생활 제일과/);
  const third = chapterButton(page, /신판 흥보전/);
  await expect(second).toHaveAttribute('aria-current', 'true');
  await expect(second).not.toContainText('읽음');
  await expect(third).not.toHaveAttribute('aria-current', 'true');

  await enterChapterThree(page, testInfo);
  await expect(pageInput(page)).toHaveValue('21');
  await expect.poll(() => log.progress).toEqual([21]);
  await press(page.getByRole('button', { name: '뒤로 가기' }), testInfo);
  await expect(page).toHaveURL(BOOK_URL_RE);

  await expect(third).toHaveAttribute('aria-current', 'true');
  await expect(second).toContainText('읽음');
  await expect(second).not.toHaveAttribute('aria-current', 'true');
  await expect(third).not.toContainText('읽음');
});

test('서재에서 완독 필터를 고르면 다 읽은 책만 보인다', async ({ page }, testInfo) => {
  await start(page, '/shelf');
  const list = page.getByRole('list', { name: '서재 책 목록' });
  await expect(list.getByRole('link', { name: '탁류' })).toBeVisible();
  await expect(list.getByRole('link', { name: UNREAD_BOOK.title })).toHaveCount(0);

  await press(page.getByRole('radio', { name: '완독' }), testInfo);

  await expect(list.getByRole('link')).toHaveCount(1);
  await expect(list.getByRole('link', { name: DONE_BOOK.title })).toBeVisible();
  await expect(page.getByRole('radio', { name: '완독' })).toHaveAttribute('aria-checked', 'true');
});

test('MY에서 로그인 전 카드가 보이고, 로그인 상태를 켜면 표시 이름이 보인다', async ({ page }) => {
  await start(page, '/my', { guest: true });
  await expect(page.getByText('로그인하지 않은 상태예요')).toBeVisible();
  await expect(page.getByRole('button', { name: '구글로 로그인' })).toBeVisible();
  await expect(page.getByText('시험 독자님')).toHaveCount(0);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await installMockApi(page, { authMember: true });
  await page.evaluate(() => localStorage.setItem('ssabi.auth_token', 'e2e-token'));
  await page.reload();

  await expect(page.getByText('시험 독자님')).toBeVisible();
  await expect(page.getByText('로그인하지 않은 상태예요')).toHaveCount(0);
});
