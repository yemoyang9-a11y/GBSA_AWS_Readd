import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID, bookInfo } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { expectClasses, expectNoClass, overrideJson } from './support/classes';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

async function openReader(page: Page) {
  await installMockApi(page);
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
}

test.describe('읽기 화면 — PC와 같은 디자인', () => {
  test('A1·A2: 뒤로 가기는 PC와 같은 흰 원형 테두리 버튼, 아이콘 16px', async ({ page }) => {
    await openReader(page);
    const back = page.getByRole('button', { name: '뒤로 가기' });
    await expectClasses(back, ['rounded-full', 'border', 'border-brief-rule', 'bg-white', 'text-brief-ink', 'transition-shadow', 'hover:shadow-brief-soft-sm']);
    await expectClasses(back.locator('svg'), ['size-4']);
    const box = (await back.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  for (const handle of [
    { name: '목차', controls: 'toc-panel' },
    { name: '싸비', controls: 'ssabi-panel' },
  ]) {
    test(`A3~A6: ${handle.name} 손잡이는 PC 토글과 같은 이름·색·테두리`, async ({ page }) => {
      await openReader(page);
      const closed = page.getByRole('button', { name: `${handle.name} 열기`, exact: true });
      await expect(closed).toHaveAttribute('aria-expanded', 'false');
      await expect(closed).toHaveAttribute('aria-controls', handle.controls);
      const tab = closed.getByTestId('edge-handle-tab');
      await expectClasses(tab, ['bg-white', 'border', 'border-brief-rule']);
      await expectNoClass(tab, /opacity/);
      await expectClasses(tab.locator('span'), ['bg-brief-ink']);

      await closed.click();
      const open = page.getByRole('button', { name: `${handle.name} 닫기`, exact: true });
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(`#${handle.controls}`)).toBeVisible();
      const openTab = open.getByTestId('edge-handle-tab');
      await expectClasses(openTab, ['bg-white', 'border', 'border-brief-ink']);
      await expectNoClass(openTab, /opacity/);
      await expectClasses(openTab.locator('span'), ['bg-brief-ink']);
    });
  }

  test('A8~A12: 목차 리스트는 PC 목차 패널의 제목·색·항목 스타일을 쓴다', async ({ page }) => {
    await openReader(page);
    await page.getByRole('button', { name: '목차 열기' }).click();
    const list = page.getByTestId('toc-list');
    await expect(list).toHaveAttribute('id', 'toc-panel');
    await expectClasses(list, ['bg-brief-page', 'border', 'border-brief-rule']);
    await expectNoClass(list, /^shadow/);
    const heading = list.getByRole('heading', { level: 2, name: '목차' });
    await expect(heading).toBeVisible();
    await expectClasses(heading, ['font-dashSerif', 'text-base', 'font-extrabold', 'text-brief-ink']);

    const other = list.getByRole('button', { name: /인간기념물/ });
    await expectClasses(other.locator('span').first(), ['bg-brief-paper', 'text-brief-muted']);
    for (const item of [other, list.locator('[aria-current="true"]')]) {
      await expectClasses(item, [
        'transition-[background-color,box-shadow,transform]',
        'duration-150',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-brief-accent/40',
        'focus-visible:ring-offset-2',
      ]);
    }
  });

  test('A10: 장 목록이 비어 있으면 PC와 같은 안내 문구', async ({ page }) => {
    await installMockApi(page);
    await overrideJson(page, `/books/${BOOK_ID}/info`, { ...bookInfo(30), chapters: [] });
    await page.goto(`/books/${BOOK_ID}/read`);
    await expect(page.getByRole('article')).toContainText('15쪽.');
    await page.getByRole('button', { name: '목차 열기' }).click();
    const empty = page.getByTestId('toc-list').getByText('목차를 불러오는 중', { exact: true });
    await expect(empty).toBeVisible();
    await expectClasses(empty, ['text-xs', 'text-brief-muted']);
  });
});
