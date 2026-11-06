import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { fontReport, noHorizontalScroll, overflowingTexts, smallTapTargets } from './support/layoutChecks';
import { installFakeKeyboard, showKeyboard } from './support/keyboard';

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function openReader(page: Page) {
  await installFakeKeyboard(page);
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.evaluate(() => document.fonts.ready);
}

async function selectWords(page: Page) {
  await page.getByRole('article').evaluate((article) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && (node.textContent ?? '').trim().length < 20) node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node!, 0);
    range.setEnd(node!, 20);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('touchend'));
  });
  await expect(page.getByRole('button', { name: '챗봇에 물어보기' })).toBeVisible();
}

const STATES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'reader', open: async () => {} },
  {
    name: 'toc',
    open: async (page) => {
      await page.getByRole('button', { name: '목차', exact: true }).click();
      await expect(page.getByTestId('toc-list')).toBeVisible();
    },
  },
  {
    name: 'ssabi',
    open: async (page) => {
      await page.getByRole('button', { name: '싸비', exact: true }).click();
      await expect(page.getByRole('tablist', { name: '싸비' })).toBeVisible();
      await page.waitForTimeout(600);
    },
  },
  { name: 'quote', open: selectWords },
  {
    name: 'ssabi-recap',
    open: async (page) => {
      await page.getByRole('button', { name: '싸비', exact: true }).click();
      await page.getByRole('tab', { name: '리캡' }).click();
      await expect(page.getByRole('tabpanel')).toContainText('줄거리');
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'ssabi-chat',
    open: async (page) => {
      await page.getByRole('button', { name: '싸비', exact: true }).click();
      await page.getByRole('tab', { name: '챗봇' }).click();
      await expect(page.getByRole('textbox', { name: '질문' })).toBeVisible();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'ssabi-chat-keyboard',
    open: async (page) => {
      await page.getByRole('button', { name: '싸비', exact: true }).click();
      await page.getByRole('tab', { name: '챗봇' }).click();
      await page.getByRole('textbox', { name: '질문' }).click();
      await showKeyboard(page, 300);
      await page.waitForTimeout(600);
    },
  },
];

for (const state of STATES) {
  test(`화면 점검 — ${state.name}`, async ({ page }, testInfo) => {
    await openReader(page);
    await state.open(page);

    expect(await noHorizontalScroll(page), 'C1 가로 스크롤').toBe(true);
    const textScope = state.name.startsWith('ssabi') ? '[data-testid="mobile-ssabi"]' : '[data-testid="mobile-reader"]';
    expect(await overflowingTexts(page, textScope), 'C2 글자 넘침·잘림').toEqual([]);
    expect(await smallTapTargets(page), 'C4 누르는 영역').toEqual([]);

    await page.screenshot({ path: `test-results/screens/${testInfo.project.name}-${state.name}.png` });
  });
}

test('C5: 한글이 정상 글꼴 폭으로 그려진다', async ({ page }, testInfo) => {
  await openReader(page);
  const report = await fontReport(page);
  testInfo.annotations.push({ type: 'font', description: JSON.stringify(report) });
  console.log(`FONT ${testInfo.project.name} ${JSON.stringify(report)}`);
  expect(report.hangulWidth).toBeGreaterThan(0);
});

test('C6: 노치·홈 막대 영역에 조작 요소가 들어가지 않는다', async ({ page }) => {
  await openReader(page);
  await page.addStyleTag({ content: `:root { --safe-top: ${SAFE_TOP}px; --safe-bottom: ${SAFE_BOTTOM}px; }` });
  const { height } = page.viewportSize()!;
  const inSafe = async (name: string, box: { y: number; height: number } | null) => {
    expect(box, name).not.toBeNull();
    expect(box!.y, `${name} 위`).toBeGreaterThanOrEqual(SAFE_TOP - 1);
    expect(box!.y + box!.height, `${name} 아래`).toBeLessThanOrEqual(height - SAFE_BOTTOM + 1);
  };
  await inSafe('뒤로 가기', await page.getByRole('button', { name: '뒤로 가기' }).boundingBox());
  await inSafe('다음 페이지', await page.getByRole('button', { name: '다음 페이지' }).boundingBox());
  await inSafe('목차 손잡이', await page.getByRole('button', { name: '목차', exact: true }).boundingBox());
  await inSafe('싸비 손잡이', await page.getByRole('button', { name: '싸비', exact: true }).boundingBox());

  await page.getByRole('button', { name: '싸비', exact: true }).click();
  await inSafe('싸비 탭', await page.getByRole('tablist', { name: '싸비' }).boundingBox());
});
