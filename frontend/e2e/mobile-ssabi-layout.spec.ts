import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { overflowingTexts, smallTapTargets } from './support/layoutChecks';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function openSsabi(page: Page) {
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: /^싸비 (열기|닫기)$/ }).click();
  await expect(page.getByRole('tablist', { name: '싸비' })).toBeVisible();
}

for (const tabName of ['리캡', '인물 관계도', '챗봇']) {
  test(`싸비 ${tabName} 탭: 누르는 영역 44px, 글자 넘침 없음`, async ({ page }) => {
    await openSsabi(page);
    await page.getByRole('tab', { name: tabName }).click();
    await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(700);
    expect(await smallTapTargets(page), 'C4').toEqual([]);
    expect(await overflowingTexts(page, '[data-testid="mobile-ssabi"]'), 'C2').toEqual([]);
  });
}

test('싸비 제목은 한 줄이다', async ({ page }) => {
  await openSsabi(page);
  const title = page.getByRole('heading', { name: '아모의 가이드북' });
  const { height, lineHeight } = await title.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
});

test('열린 싸비 위의 손잡이는 시트 내용을 가리지 않는다', async ({ page }) => {
  await openSsabi(page);
  const handle = page.getByRole('button', { name: /^싸비 (열기|닫기)$/ });
  const box = (await handle.boundingBox())!;
  const covered = await page.evaluate(
    ({ x, y, w, h }) => {
      const handleEl = document.elementFromPoint(x + w / 2, y + h / 2)!.closest('button')!;
      handleEl.style.visibility = 'hidden';
      const points = [
        [x + 2, y + 2],
        [x + w - 2, y + h / 2],
        [x + w / 2, y + h - 2],
      ];
      const hits = points
        .map(([px, py]) => document.elementFromPoint(px, py))
        .filter((el) => el && el.closest('button, a, input, textarea, [role="tab"]'))
        .map((el) => el!.closest('button, a, input, textarea, [role="tab"]')!.textContent?.trim() ?? '');
      handleEl.style.visibility = '';
      return hits;
    },
    { x: box.x, y: box.y, w: box.width, h: box.height }
  );
  expect(covered).toEqual([]);
});

test('목차를 연 채 싸비를 열었다 닫으면 목차 리스트가 다시 펼쳐지지 않는다', async ({ page }) => {
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.getByRole('button', { name: /^목차 (열기|닫기)$/ }).click();
  await expect(page.getByTestId('toc-list')).toBeVisible();
  await page.getByRole('button', { name: /^싸비 (열기|닫기)$/ }).click();
  await expect(page.getByTestId('mobile-ssabi')).toBeVisible();
  await page.getByRole('button', { name: /^싸비 (열기|닫기)$/ }).click();
  await expect(page.getByTestId('mobile-ssabi')).toHaveCount(0);
  await expect(page.getByTestId('toc-list')).toHaveCount(0);
});

test('싸비 제목과 읽음 배지가 겹치지 않는다', async ({ page }) => {
  await openSsabi(page);
  const title = (await page.getByRole('heading', { name: '아모의 가이드북' }).boundingBox())!;
  const badge = (await page.getByText(/p까지 읽음/).boundingBox())!;
  expect(title.x + title.width).toBeLessThanOrEqual(badge.x);
});
