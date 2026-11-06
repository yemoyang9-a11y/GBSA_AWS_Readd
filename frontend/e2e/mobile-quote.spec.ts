import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { swipe } from './support/gestures';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function open(page: Page) {
  const log = await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await expect.poll(() => log.progress.length).toBe(1);
  await page.evaluate(() => document.fonts.ready);
  const { width, height } = page.viewportSize()!;
  return { log, width, height };
}

async function selectFirstWords(page: Page): Promise<{ text: string; bottom: number }> {
  return page.getByRole('article').evaluate((article) => {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && (node.textContent ?? '').trim().length < 20) node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node!, 0);
    range.setEnd(node!, 20);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('touchend'));
    return { text: range.toString().trim(), bottom: range.getBoundingClientRect().bottom };
  });
}

test('G8: 꾹 눌러 고른 문장 아래에 "아모에게 물어보기"가 뜨고, 누르면 챗봇에 인용된다', async ({ page }) => {
  await open(page);
  const { text, bottom } = await selectFirstWords(page);
  const ask = page.getByRole('button', { name: '아모에게 물어보기' });
  await expect(ask).toBeVisible();
  await page.getByRole('button', { name: '아모에게 물어보기' }).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = (await ask.boundingBox())!;
  expect(box.y).toBeGreaterThan(bottom);
  expect(box.height).toBeGreaterThanOrEqual(44);

  await ask.click();
  await expect(page.getByTestId('mobile-ssabi')).toBeVisible();
  await expect(page.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('선택한 문장')).toBeVisible();
  await expect(page.getByTestId('mobile-ssabi')).toContainText(text);
});

test('G7: 글자가 선택된 동안에는 밀어도 넘어가지 않고, 선택을 풀면 넘어간다', async ({ page }) => {
  const { log, width, height } = await open(page);
  await selectFirstWords(page);
  await swipe(page, { fromX: width * 0.8, toX: width * 0.2, y: height * 0.6, durationMs: 400 });
  await page.waitForTimeout(500);
  expect(log.progress).toEqual([15]);

  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  await swipe(page, { fromX: width * 0.8, toX: width * 0.2, y: height * 0.6, durationMs: 400 });
  await expect(page.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('16');
});

test('Final fix 1: 실제 탭으로 "아모에게 물어보기"를 누르면 인용된다', async ({ page }) => {
  await open(page);
  const { text } = await selectFirstWords(page);
  await page.getByRole('button', { name: '아모에게 물어보기' }).tap();
  await expect(page.getByTestId('mobile-ssabi')).toBeVisible();
  await expect(page.getByTestId('mobile-ssabi')).toContainText(text);
});

test('Final fix 2: 손잡이로 선택 범위를 늘리면 늘어난 문장이 인용된다', async ({ page }) => {
  await open(page);
  await selectFirstWords(page);
  const extended = await page.getByRole('article').evaluate(() => {
    const selection = window.getSelection()!;
    const current = selection.getRangeAt(0);
    const range = document.createRange();
    range.setStart(current.startContainer, current.startOffset);
    range.setEnd(current.endContainer, 40);
    selection.removeAllRanges();
    selection.addRange(range);
    return range.toString().trim();
  });
  await page.getByRole('button', { name: '아모에게 물어보기' }).tap();
  await expect(page.getByTestId('mobile-ssabi')).toContainText(extended);
});

test('Final fix 4: 화면 아래쪽 문장을 골라도 버튼이 화면 안, 하단 바 위에 뜬다', async ({ page }) => {
  await open(page);
  await page.getByRole('article').evaluate((article) => {
    const navTop = document.querySelector('nav')!.getBoundingClientRect().top;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      for (let i = 0; i + 4 < text.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > navTop - 60 && rect.bottom < navTop) {
          range.setEnd(node, i + 4);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
          document.dispatchEvent(new Event('touchend'));
          return;
        }
      }
      node = walker.nextNode();
    }
    throw new Error('하단 근처 글줄을 찾지 못함');
  });
  const ask = page.getByRole('button', { name: '아모에게 물어보기' });
  await expect(ask).toBeVisible();
  await page.getByRole('button', { name: '아모에게 물어보기' }).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = (await ask.boundingBox())!;
  const navTop = (await page.locator('nav').boundingBox())!.y;
  expect(box.y + box.height).toBeLessThanOrEqual(navTop);
});

test('모바일 인용 버튼은 PC와 같은 디자인이다(문구·색), 크기만 44px', async ({ page }) => {
  await open(page);
  await selectFirstWords(page);
  const ask = page.getByRole('button', { name: '아모에게 물어보기' });
  await expect(ask).toBeVisible();
  await page.getByRole('button', { name: '아모에게 물어보기' }).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await expect(ask).toHaveClass(/border-brief-accent/);
  await expect(ask).toHaveClass(/bg-brief-accent-soft/);
  await expect(ask).toHaveClass(/text-brief-accent/);
  expect((await ask.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
