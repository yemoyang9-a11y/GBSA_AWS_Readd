import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi, type MockApiOptions } from './support/mockApi';
import { noHorizontalScroll, overflowingTexts, smallTapTargets } from './support/layoutChecks';

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

test('404: 휴대폰이면 모바일 404, 데스크톱이면 PC 404', async ({ page }, testInfo) => {
  await installMockApi(page);
  await page.goto('/no-such-page');
  await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible();
  const mobile = page.getByTestId('mobile-not-found');
  if (testInfo.project.name === 'desktop') await expect(mobile).toHaveCount(0);
  else await expect(mobile).toBeVisible();
});

test.describe('모바일 404·오류 화면', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  const STATES: { name: string; url: string; opts: MockApiOptions; message: string }[] = [
    { name: 'not-found', url: '/no-such-page', opts: {}, message: '페이지를 찾을 수 없습니다' },
    { name: 'catalog-error', url: '/', opts: { failCatalog: true }, message: '작품을 불러오지 못했습니다' },
    { name: 'entry-error', url: `/books/${BOOK_ID}/read`, opts: { failEntry: true }, message: '읽기를 시작하지 못했습니다' },
    { name: 'page-error', url: `/books/${BOOK_ID}/read`, opts: { failPages: [15] }, message: '페이지를 불러오지 못했습니다' },
  ];

  async function open(page: Page, state: (typeof STATES)[number]) {
    const log = await installMockApi(page, state.opts);
    await page.goto(state.url);
    await expect(page.getByText(state.message)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return log;
  }

  for (const state of STATES) {
    test(`화면 점검 — ${state.name}: C1·C2·C4`, async ({ page }, testInfo) => {
      await open(page, state);
      expect(await noHorizontalScroll(page), 'C1 가로 스크롤').toBe(true);
      expect(await overflowingTexts(page), 'C2 글자 넘침·잘림').toEqual([]);
      expect(await smallTapTargets(page), 'C4 누르는 영역').toEqual([]);
      await page.screenshot({ path: `test-results/screens/${testInfo.project.name}-${state.name}.png` });
    });
  }

  test('404의 "서재로" 버튼을 누르면 홈으로 간다', async ({ page }) => {
    await open(page, STATES[0]);
    await page.getByRole('button', { name: '서재로' }).tap();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('region', { name: '신작' }).getByRole('link', { name: '탁류' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
  });

  test('작품 목록 불러오기 실패 후 다시 시도하면 홈의 작품 줄이 보인다', async ({ page }) => {
    let fail = true;
    await installMockApi(page);
    await page.route('http://api.e2e.test/books', (route) =>
      fail ? route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{}' }) : route.fallback()
    );
    await page.goto('/');
    await expect(page.getByText('작품을 불러오지 못했습니다')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: '다시 시도' }).tap();
    await expect(page.getByRole('region', { name: '신작' }).getByRole('link', { name: '탁류' })).toBeVisible();
  });

  test('C6: 홈 화면 모드의 노치·홈 막대 영역에 홈·브리핑 조작 요소가 들어가지 않는다', async ({ page }) => {
    await installMockApi(page);
    await page.addInitScript(
      ([top, bottom]) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `:root { --safe-top: ${top}px; --safe-bottom: ${bottom}px; }`;
          document.head.appendChild(style);
        });
      },
      [SAFE_TOP, SAFE_BOTTOM]
    );
    await page.goto('/');
    const first = page.getByRole('region', { name: '이어 읽기' }).getByRole('link', { name: '탁류' });
    await expect(first).toBeVisible();
    expect((await first.boundingBox())!.y).toBeGreaterThanOrEqual(SAFE_TOP - 1);

    await page.goto(`/books/${BOOK_ID}/briefing`);
    const back = page.getByRole('button', { name: '돌아가기' });
    await expect(back).toBeVisible();
    expect((await back.boundingBox())!.y).toBeGreaterThanOrEqual(SAFE_TOP - 1);
  });
});
