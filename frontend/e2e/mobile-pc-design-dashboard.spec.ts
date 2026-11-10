import { expect, test, type Page } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { expectClasses, expectNoClass, overrideJson } from './support/classes';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
});

test.describe('서재 — PC와 같은 디자인', () => {
  async function openDashboard(page: Page) {
    await installMockApi(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '파친코 선택' })).toBeVisible();
  }

  test('A20: 머리줄에 PC와 같은 비활성 "도서 검색" 버튼', async ({ page }) => {
    await openDashboard(page);
    const search = page.getByTestId('mobile-dashboard').locator('header').getByRole('button', { name: '도서 검색' });
    await expect(search).toBeVisible();
    await expect(search).toBeDisabled();
    await expectClasses(search, ['border-b', 'border-transparent', 'font-dashSans', 'text-[15px]', 'text-dash-muted', 'disabled:opacity-40']);
    await expect(search.locator('svg')).toHaveAttribute('width', '15');
  });

  test('A21·A22: 이어 읽기 카드 제목 자간과 표지 모서리가 PC 히어로와 같다', async ({ page }) => {
    await openDashboard(page);
    const card = page.getByRole('heading', { level: 2 }).locator('xpath=ancestor::section[1]');
    await expectClasses(page.getByRole('heading', { level: 2 }), ['tracking-[-.07em]']);
    await expectClasses(card.getByTestId('typographic-cover'), ['rounded-dash-hero-cover', 'border', 'border-dash-line', 'bg-dash-paper']);
  });

  test('A23: 필터는 PC 필터와 같은 18px 모서리·색', async ({ page }) => {
    await openDashboard(page);
    const all = page.getByRole('button', { name: '전체' });
    const reading = page.getByRole('button', { name: '읽는 중' });
    await expectClasses(all, ['rounded-[18px]', 'border', 'border-dash-ink', 'bg-dash-ink', 'font-dashSans', 'text-white']);
    await expectClasses(reading, ['rounded-[18px]', 'border', 'border-dash-line', 'bg-transparent', 'font-dashSans', 'text-dash-muted']);
    expect((await reading.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('A24: 고른 책 카드는 PC처럼 테두리가 진해지고 살짝 떠오른다', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: '데미안 선택' }).tap();
    const selected = page.getByRole('button', { name: '데미안 선택' });
    const other = page.getByRole('button', { name: '파친코 선택' });
    await expectClasses(selected, ['border-[#777]', '-translate-y-0.5', 'transition-transform']);
    await expectClasses(other, ['border-dash-line', 'transition-transform']);
    await expectNoClass(other, /translate-y/);
  });

  test('A25: 서재 오류 문구는 서재 회색', async ({ page }) => {
    await installMockApi(page, { failCatalog: true });
    await page.goto('/');
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('서재를 불러오지 못했습니다');
    await expectClasses(alert, ['text-dash-muted']);
    await expectNoClass(alert, /brief/);
    const { width, height } = page.viewportSize()!;
    const box = (await alert.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(box.y).toBeGreaterThan(height * 0.3);
  });

  test('A26: 빈 서재 화면의 바탕 글꼴은 PC처럼 지정하지 않는다', async ({ page }) => {
    await installMockApi(page);
    await overrideJson(page, '/books', { books: [] });
    await page.goto('/');
    await expect(page.getByText('서재에 도서가 아직 없습니다')).toBeVisible();
    await expectNoClass(page.getByTestId('mobile-dashboard'), /^font-/);
  });
});

test.describe('도서 정보 시트 — PC와 같은 디자인', () => {
  async function openSheet(page: Page) {
    await installMockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: '데미안 정보 보기' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('A27: 진도 표시는 PC와 같은 18px 원형 진도 알약', async ({ page }) => {
    const dialog = await openSheet(page);
    const pill = dialog.getByText(/%까지 읽음/);
    await expectClasses(pill, ['rounded-full', 'border', 'border-brief-rule', 'bg-brief-paper', 'font-dashSans', 'text-xs', 'text-brief-muted']);
    const ring = pill.locator('svg');
    await expect(ring).toHaveAttribute('width', '18');
    await expect(ring.locator('circle')).toHaveCount(2);
  });

  test('A28·A29: 닫기 버튼은 PC와 같은 흐림·호버, 아이콘 14px', async ({ page }) => {
    const dialog = await openSheet(page);
    const close = dialog.getByRole('button', { name: '닫기' });
    await expectClasses(close, ['rounded-full', 'text-brief-accent', 'opacity-70', 'transition', 'hover:bg-brief-accent-soft', 'hover:opacity-100']);
    await expect(close.locator('svg')).toHaveAttribute('width', '14');
  });

  test('A30·A31: 표지는 PC 정보 창 표지, 시트 윗모서리는 PC 패널 반경', async ({ page }) => {
    const dialog = await openSheet(page);
    await expectClasses(dialog, ['rounded-t-dash-panel']);
    await expectClasses(dialog.getByRole('img', { name: '데미안 표지' }), ['rounded-dash-hero-cover', 'object-cover']);
  });
});

test('404: PC와 같은 문구만 두고, 서재로 버튼은 PC 공용 버튼 모양', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/no-such-page');
  const root = page.getByTestId('mobile-not-found');
  await expect(root).toContainText('페이지를 찾을 수 없습니다');
  await expect(root.getByText('404', { exact: true })).toHaveCount(0);
  await expect(root.getByRole('heading')).toHaveCount(0);
  await expectNoClass(root, /^font-/);
  const button = root.getByRole('button', { name: '서재로' });
  await expectClasses(button, ['text-[13px]', 'transition-opacity', 'rounded-lg', 'bg-ink', 'font-bold', 'text-white']);
  const box = (await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});
