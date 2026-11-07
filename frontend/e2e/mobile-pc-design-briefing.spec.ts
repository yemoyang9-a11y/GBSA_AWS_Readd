import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { expectClasses, expectNoClass } from './support/classes';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

test.describe('브리핑 — PC와 같은 디자인', () => {
  async function openBriefing(page: Page) {
    await installMockApi(page);
    await page.goto(`/books/${BOOK_ID}/briefing`);
    await expect(page.getByTestId('mobile-briefing')).toBeVisible();
  }

  test('A13·A14: 돌아가기는 PC와 같은 원형 테두리 버튼, 아이콘 16px', async ({ page }) => {
    await openBriefing(page);
    const back = page.getByRole('button', { name: '돌아가기' });
    await expectClasses(back, ['rounded-full', 'border', 'border-brief-line', 'bg-brief-paper', 'text-brief-ink', 'transition-opacity', 'hover:opacity-65']);
    await expectClasses(back.locator('svg'), ['size-4']);
    const box = (await back.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('A15: PC와 같은 구분선 3개', async ({ page }) => {
    await openBriefing(page);
    const rules = page.getByTestId('brief-rule');
    await expect(rules).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expectClasses(rules.nth(i), [i === 0 ? 'my-5' : 'my-7', 'h-[2px]', 'w-full', 'rounded-[1px]', 'bg-brief-rule']);
    }
  });

  test('A16: 표지는 PC 브리핑 표지처럼 흰 바탕·둥근 패널·그림자, 테두리 없음', async ({ page }) => {
    await openBriefing(page);
    const cover = page.getByTestId('typographic-cover');
    await expectClasses(cover, ['bg-white', 'rounded-brief-panel', 'shadow-brief-soft']);
    await expectNoClass(cover, /^border/);
  });

  test('A17~A19: 목차는 PC처럼 접히고 펼쳐지며, 현재 장 강조·포커스 링이 같다', async ({ page }) => {
    await openBriefing(page);
    const panel = page.locator('#mobileTocPanel');
    await expectClasses(panel, ['grid', 'transition-[grid-template-rows]', 'duration-300', 'ease-in-out', 'grid-rows-[0fr]', 'opacity-0']);
    const current = panel.locator('[aria-current="true"]');
    await expect(current).toHaveAttribute('tabindex', '-1');

    await page.getByRole('button', { name: /목차/ }).tap();
    await expectClasses(panel, ['grid-rows-[1fr]', 'opacity-100']);
    await expect(current).toHaveAttribute('tabindex', '0');
    await expectClasses(current, [
      'bg-brief-accent-soft',
      'shadow-brief-soft-sm',
      'transition-[background-color,box-shadow,transform]',
      'duration-150',
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-brief-accent/40',
      'focus-visible:ring-offset-2',
    ]);
  });
});
