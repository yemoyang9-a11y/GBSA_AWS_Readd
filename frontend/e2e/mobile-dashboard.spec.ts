import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi, type MockApiOptions } from './support/mockApi';
import { noHorizontalScroll, overflowingTexts, smallTapTargets } from './support/layoutChecks';

test('FR-BRW-001: 휴대폰이면 모바일 서재, 데스크톱이면 PC 서재', async ({ page }, testInfo) => {
  await installMockApi(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '데미안 선택' })).toBeVisible();
  const mobile = page.getByTestId('mobile-dashboard');
  if (testInfo.project.name === 'desktop') await expect(mobile).toHaveCount(0);
  else await expect(mobile).toBeVisible();
});

test.describe('모바일 서재', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  async function open(page: Page, opts: MockApiOptions = {}) {
    const log = await installMockApi(page, opts);
    await page.goto('/');
    await expect(page.getByTestId('mobile-dashboard')).toBeVisible();
    await expect(page.getByRole('button', { name: '파친코 선택' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all(Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))))
    );
    return log;
  }

  const resumeButton = (page: Page) => page.getByRole('button', { name: /^(이어서 읽기|읽기 시작)$/ });

  const STATES: { name: string; ready: (page: Page) => Promise<void> }[] = [
    { name: 'shelf', ready: async () => {} },
    {
      name: 'demo-selected',
      ready: async (page) => {
        await page.getByRole('button', { name: '데미안 선택' }).tap();
        await expect(page.getByRole('heading', { level: 2, name: '데미안' })).toBeVisible();
      },
    },
    {
      name: 'filter-reading',
      ready: async (page) => {
        await page.getByRole('button', { name: '읽는 중' }).tap();
        await expect(page.getByRole('button', { name: '탁류 선택' })).toHaveCount(0);
      },
    },
    {
      name: 'info-sheet',
      ready: async (page) => {
        await page.getByRole('button', { name: '데미안 정보 보기' }).tap();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.waitForTimeout(400);
      },
    },
  ];

  for (const state of STATES) {
    test(`화면 점검 — dashboard-${state.name}: C1·C2·C4`, async ({ page }, testInfo) => {
      await open(page);
      await state.ready(page);
      expect(await noHorizontalScroll(page), 'C1 가로 스크롤').toBe(true);
      expect(await overflowingTexts(page), 'C2 글자 넘침·잘림').toEqual([]);
      expect(await smallTapTargets(page), 'C4 누르는 영역').toEqual([]);
      await page.screenshot({
        path: `test-results/screens/${testInfo.project.name}-dashboard-${state.name}.png`,
        fullPage: state.name !== 'info-sheet',
      });
    });
  }

  test('환영 문구가 2줄 이하이고 제목이 한 글자씩 쌓이지 않는다', async ({ page }) => {
    await open(page);
    for (const heading of [page.getByRole('heading', { level: 1 }), page.getByRole('heading', { name: /내 서재/ })]) {
      const { height, lineHeight } = await heading.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      }));
      expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    }
  });

  test('FR-BRF-001: 진입 버튼을 누르면 POST /entry 1건 후 서버가 정한 읽기 화면으로 간다', async ({ page }) => {
    const log = await open(page);
    const button = resumeButton(page);
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    await button.tap();
    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/read$`));
    expect(log.entries).toBeGreaterThanOrEqual(1);
    expect(log.events[0]).toBe('entry');
  });

  test('FR-BRF-001: 서버가 briefing을 정하면 브리핑 화면으로 간다', async ({ page }) => {
    const log = await open(page, { entryRoute: 'briefing' });
    await resumeButton(page).tap();
    await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/briefing$`));
    await expect(page.getByTestId('mobile-briefing')).toBeVisible();
    expect(log.entries).toBe(1);
  });

  test('데모 항목은 미리보기만 되고 진입 요청을 보내지 않는다', async ({ page }) => {
    const log = await open(page);
    await expect(resumeButton(page)).toBeEnabled();
    await page.getByRole('button', { name: '데미안 선택' }).tap();
    await expect(page.getByRole('heading', { level: 2, name: '데미안' })).toBeVisible();
    await expect(resumeButton(page)).toBeDisabled();
    await resumeButton(page).tap({ force: true });
    await page.waitForTimeout(500);
    expect(log.entries).toBe(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('FR-BRW-003: 정보 시트는 닫기 버튼과 바깥 누르기로 닫히고, 열린 동안 배경 스크롤이 잠긴다', async ({ page }) => {
    await open(page);
    const info = page.getByRole('button', { name: '데미안 정보 보기' });
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

    await info.tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('도서 소개');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    const close = dialog.getByRole('button', { name: '닫기' });
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    await close.tap();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

    await info.tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogBox = (await page.getByRole('dialog').boundingBox())!;
    expect(dialogBox.y).toBeGreaterThan(40);
    await page.touchscreen.tap(page.viewportSize()!.width / 2, dialogBox.y / 2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('필터 "읽는 중"이면 진도 있는 책만 보이고, "전체"로 돌아가면 모두 보인다', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '읽는 중' }).tap();
    await expect(page.getByRole('button', { name: '탁류 선택' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '데미안 선택' })).toBeVisible();
    await expect(page.getByRole('button', { name: '파친코 선택' })).toBeVisible();
    await page.getByRole('button', { name: '전체' }).tap();
    await expect(page.getByRole('button', { name: '탁류 선택' })).toBeVisible();
  });

  for (const from of [
    { name: '브리핑 돌아가기', url: `/books/${BOOK_ID}/briefing`, button: '돌아가기' },
    { name: '읽기 뒤로 가기', url: `/books/${BOOK_ID}/read`, button: '뒤로 가기' },
    { name: '404 서재로', url: '/no-such-page', button: '서재로' },
  ]) {
    test(`${from.name}로 서재에 돌아오면 서재가 그려진다(페이지가 멈추지 않는다)`, async ({ page }) => {
      await installMockApi(page);
      await page.goto(from.url);
      await page.getByRole('button', { name: from.button }).tap();
      await expect(page.getByRole('button', { name: '데미안 선택' })).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.getByRole('button', { name: '데미안 선택' })).toBeVisible();
    });
  }
});

test('PR 리뷰: 아래쪽 서재 행을 누르면 위쪽 이어 읽기 카드가 보이도록 스크롤된다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  await installMockApi(page);
  await page.goto('/');
  await expect(page.getByTestId('mobile-dashboard')).toBeVisible();
  const rows = page.getByRole('button', { pressed: false }).filter({ hasText: '파친코' });
  await rows.first().scrollIntoViewIfNeeded();
  await rows.first().tap();
  await expect(page.getByRole('button', { name: /이어서 읽기|읽기 시작/ }).first()).toBeInViewport();
});
