import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { hideKeyboard, installFakeKeyboard, showKeyboard } from './support/keyboard';

const KEYBOARD = 300;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function openChat(page: Page) {
  await installFakeKeyboard(page);
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.getByRole('button', { name: '싸비', exact: true }).click();
  await page.getByRole('tab', { name: '챗봇' }).click();
  const input = page.getByRole('textbox', { name: '질문' });
  await expect(input).toBeVisible();
  await page.getByRole('tabpanel').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  return input;
}

test('G12: 키보드가 올라오면 입력창이 키보드 위에 있고 탭은 보이며 손잡이는 숨는다', async ({ page }) => {
  const input = await openChat(page);
  await input.click();
  await showKeyboard(page, KEYBOARD);
  const visibleBottom = page.viewportSize()!.height - KEYBOARD;
  await expect
    .poll(async () => (await page.getByTestId('mobile-ssabi').boundingBox())!.height)
    .toBeLessThanOrEqual(visibleBottom + 1);
  const inputBox = (await input.boundingBox())!;
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(visibleBottom);
  await expect(page.getByRole('tablist', { name: '싸비' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '싸비', exact: true })).toHaveCount(0);

  await page.getByRole('tablist', { name: '싸비' }).locator('..').getByRole('tabpanel').click({ position: { x: 20, y: 20 } });
  await expect(input).not.toBeFocused();
  await hideKeyboard(page);
  await expect(page.getByRole('button', { name: '싸비', exact: true })).toBeVisible();
});

test('G13: 긴 질문은 6줄까지 늘어나다가 입력창 안에서 스크롤된다', async ({ page }) => {
  const input = await openChat(page);
  await input.fill(Array.from({ length: 10 }, (_, i) => `${i + 1}번째 줄`).join('\n'));
  const { height, lineHeight, scrollHeight, clientHeight } = await input.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(height).toBeLessThanOrEqual(lineHeight * 6 + 8);
  expect(scrollHeight).toBeGreaterThan(clientHeight);
});

test('입력창은 16px, 보내기 버튼은 44px이고 빈 입력에서는 비활성', async ({ page }) => {
  const input = await openChat(page);
  const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  const send = page.getByRole('button', { name: '질문 보내기' });
  const box = (await send.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(send).toBeDisabled();
  await input.fill('초봉은 누구야');
  await expect(send).toBeEnabled();
});
