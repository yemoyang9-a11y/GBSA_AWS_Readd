import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi, type MockApiOptions } from './support/mockApi';
import { swipe } from './support/gestures';
import { noHorizontalScroll, overflowingTexts, smallTapTargets } from './support/layoutChecks';

const BRIEFING_URL = `/books/${BOOK_ID}/briefing`;

test('FR-BRF-001: 휴대폰이면 모바일 브리핑, 데스크톱이면 PC 브리핑', async ({ page }, testInfo) => {
  await installMockApi(page);
  await page.goto(BRIEFING_URL);
  await expect(page.getByText('그동안 이런 이야기였어요')).toBeVisible();
  const mobile = page.getByTestId('mobile-briefing');
  if (testInfo.project.name === 'desktop') await expect(mobile).toHaveCount(0);
  else await expect(mobile).toBeVisible();
});

test.describe('모바일 브리핑', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  async function open(page: Page, opts: MockApiOptions = {}) {
    const log = await installMockApi(page, opts);
    await page.goto(BRIEFING_URL);
    await expect(page.getByTestId('mobile-briefing')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return log;
  }

  const STATES: { name: string; opts: MockApiOptions; ready: (page: Page) => Promise<void> }[] = [
    {
      name: 'saved',
      opts: {},
      ready: async (page) => {
        await expect(page.getByText('15페이지까지의 줄거리입니다.', { exact: false })).toBeVisible();
      },
    },
    {
      name: 'fallback',
      opts: { briefingRecap: 'none' },
      ready: async (page) => {
        await expect(page.getByText('정 주사는 미두장을 드나들며 재산을 잃는다.', { exact: false })).toBeVisible();
      },
    },
    {
      name: 'first',
      opts: { briefingRecap: 'first' },
      ready: async (page) => {
        await expect(page.getByText('아직 읽은 내용이 없습니다')).toBeVisible();
      },
    },
    {
      name: 'toc',
      opts: {},
      ready: async (page) => {
        await page.getByRole('button', { name: /목차/ }).tap();
        await expect(page.getByRole('button', { name: /신판 흥보전/ })).toBeVisible();
        await page.waitForTimeout(400);
      },
    },
  ];

  for (const state of STATES) {
    test(`화면 점검 — briefing-${state.name}: C1·C2·C4`, async ({ page }, testInfo) => {
      await open(page, state.opts);
      await state.ready(page);
      expect(await noHorizontalScroll(page), 'C1 가로 스크롤').toBe(true);
      expect(await overflowingTexts(page, '[data-testid="mobile-briefing"]'), 'C2 글자 넘침·잘림').toEqual([]);
      expect(await smallTapTargets(page), 'C4 누르는 영역').toEqual([]);
      await page.screenshot({
        path: `test-results/screens/${testInfo.project.name}-briefing-${state.name}.png`,
        fullPage: true,
      });
    });
  }

  test('인사 문구가 한 글자씩 쌓이지 않는다(3줄 이하)', async ({ page }) => {
    await open(page);
    const greeting = page.getByRole('heading', { level: 2 });
    const { height, lineHeight } = await greeting.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThanOrEqual(lineHeight * 3 + 1);
  });

  test('표지 자리의 저자 이름이 한 줄로 보인다', async ({ page }) => {
    await open(page);
    const author = page.getByTestId('typographic-cover').locator('span').last();
    const { height, lineHeight } = await author.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThan(lineHeight * 1.5);
  });

  test('FR-SPL-005: 이어서 읽기는 브리핑에서 진도 요청을 보내지 않고 읽기 화면으로 간다', async ({ page }) => {
    const log = await open(page);
    const button = page.getByRole('button', { name: '이어서 읽기' });
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 2 * 20 - 1);
    expect(log.progress).toEqual([]);
    await button.tap();
    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/read$`));
    await expect(page.getByRole('article')).toContainText('15쪽.');
    await expect.poll(() => log.progress.length).toBe(1);
    await page.waitForTimeout(500);
    expect(log.progress).toEqual([15]);
    expect(log.events[0]).toBe('entry');
  });

  test('FR-PRG-003: 이어서 읽기 뒤 읽기 화면에서 쪽을 넘기면 그때 진도 요청이 생긴다', async ({ page }) => {
    const log = await open(page);
    await page.getByRole('button', { name: '이어서 읽기' }).tap();
    await expect(page.getByRole('article')).toContainText('15쪽.');
    await expect.poll(() => log.progress.length).toBe(1);
    const width = page.viewportSize()!.width;
    const y = page.viewportSize()!.height / 2;
    await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y, durationMs: 400 });
    await expect(page.getByRole('article')).toContainText('16쪽.');
    expect(log.progress).toEqual([15, 16]);
  });

  const SAFE_BOTTOM = 34;
  const LONG_RECAP = Array.from(
    { length: 14 },
    (_, i) =>
      `${i + 1}번째 문단. 정 주사는 미두장을 드나들며 재산을 잃고, 딸 초봉을 시집보내 형편을 펴 보려 한다. 초봉은 제중당 약국 창가에서 지나가는 사람들을 내다본다.`
  ).join('\n\n');

  async function openWithLongRecap(page: Page) {
    const log = await installMockApi(page);
    await page.route('http://api.e2e.test/**/briefing', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          applied_cutoff: 15,
          recap: LONG_RECAP,
          current_chapter: { chapter_no: 2, title: '생활 제일과' },
          progress: { current_page: 15, total_pages: 30, percent: 50 },
        }),
      })
    );
    await page.goto(BRIEFING_URL);
    await expect(page.getByTestId('mobile-briefing')).toBeVisible();
    await expect(page.getByText('14번째 문단.', { exact: false })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return log;
  }

  test('FR-BRF-001: 줄거리가 길어도 스크롤하지 않고 이어서 읽기 버튼이 화면 안에 있다', async ({ page }) => {
    await openWithLongRecap(page);
    const { height } = page.viewportSize()!;
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(height * 1.5);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await page.getByRole('button', { name: '이어서 읽기' }).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  });

  test('FR-BRF-001: 이어서 읽기 버튼이 아래 안전 영역 밖에 있다', async ({ page }) => {
    await openWithLongRecap(page);
    await page.addStyleTag({ content: `:root { --safe-bottom: ${SAFE_BOTTOM}px; }` });
    const { height } = page.viewportSize()!;
    const box = (await page.getByRole('button', { name: '이어서 읽기' }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height - SAFE_BOTTOM + 0.5);
    const bar = (await page.getByTestId('briefing-continue-bar').boundingBox())!;
    expect(bar.y + bar.height).toBeGreaterThanOrEqual(height - 0.5);
  });

  test('FR-BRF-001: 목차를 펼쳐 끝까지 내려도 마지막 장이 이어서 읽기 줄에 가려지지 않는다', async ({ page }) => {
    await openWithLongRecap(page);
    await page.addStyleTag({ content: `:root { --safe-bottom: ${SAFE_BOTTOM}px; }` });
    await page.getByRole('button', { name: /목차/ }).tap();
    const last = page.getByRole('button', { name: /신판 흥보전/ });
    await expect(last).toBeVisible();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const lastBox = (await last.boundingBox())!;
    const barBox = (await page.getByTestId('briefing-continue-bar').boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y + 0.5);
  });

  test('FR-PRG-003: 목차에서 장을 고르면 브리핑은 진도 요청 없이 곧바로 읽기 화면으로 간다', async ({ page }) => {
    const log = await open(page, { progressDelayMs: 1200 });
    await page.getByRole('button', { name: /목차/ }).tap();
    await page.getByRole('button', { name: /신판 흥보전/ }).tap();
    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/read$`), { timeout: 800 });
    await expect(page.getByRole('article')).toBeVisible();
    await expect.poll(() => log.events.includes('entry')).toBe(true);
    await expect.poll(() => log.progress.length).toBeGreaterThan(0);
    const firstProgress = log.events.findIndex((event) => event.startsWith('progress:'));
    expect(firstProgress).toBeGreaterThan(log.events.indexOf('entry'));
  });

  test('NFR-AI-017: 저장 리캡이 없으면 리캡 스트리밍을 정확히 1회 요청한다', async ({ page }) => {
    const log = await open(page, { briefingRecap: 'none' });
    await expect(page.getByText('정 주사는 미두장을 드나들며 재산을 잃는다.', { exact: false })).toBeVisible();
    await page.waitForTimeout(800);
    expect(log.recapStreams).toBe(1);
  });

  test('D13: 첫 진입(cutoff 0)이면 리캡 스트리밍 요청 0건', async ({ page }) => {
    const log = await open(page, { briefingRecap: 'first' });
    await expect(page.getByText('아직 읽은 내용이 없습니다')).toBeVisible();
    await page.waitForTimeout(800);
    expect(log.recapStreams).toBe(0);
  });

  test('D13 positive: 저장 리캡이 있으면 리캡 스트리밍 요청 0건이고 저장 리캡이 보인다', async ({ page }) => {
    const log = await open(page);
    await expect(page.getByText('15페이지까지의 줄거리입니다.', { exact: false })).toBeVisible();
    await page.waitForTimeout(800);
    expect(log.recapStreams).toBe(0);
  });
});

test('Review fix: 브리핑을 불러오지 못하면 재시도 화면이 뜨고, 다시 시도하면 브리핑이 열린다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  await installMockApi(page, { failBriefingTimes: 2 });
  await page.goto(`/books/${BOOK_ID}/briefing`);
  await expect(page.getByRole('alert')).toContainText('브리핑을 불러오지 못했습니다');
  await page.getByRole('button', { name: '다시 시도' }).tap();
  await expect(page.getByRole('button', { name: '이어서 읽기' })).toBeVisible();
});
