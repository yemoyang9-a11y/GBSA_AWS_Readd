import { expect, test } from '@playwright/test';
import { swipe } from './support/gestures';

const API = process.env.REAL_API;

test.use({ baseURL: 'http://localhost:4174' });

test.beforeEach(({}, testInfo) => {
  test.skip(!API, 'REAL_API가 있을 때만(로컬 백엔드·로컬 DB 확인용)');
  test.skip(testInfo.project.name !== 'iphone-pro-max', 'iPhone 한 기기로 한 번');
});

test('5.3: 로컬 백엔드·로컬 DB로 홈 → 작품 페이지 → 진입 → 읽기 스와이프 → 관계도', async ({ page }) => {
  const progress: number[] = [];
  const appliedCutoffs: number[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/progress') && req.method() === 'POST') progress.push((req.postDataJSON() as { page: number }).page);
  });
  page.on('response', async (res) => {
    if (!res.url().includes('/progress') || res.request().method() !== 'POST') return;
    const body = (await res.json().catch(() => null)) as { applied_cutoff?: number } | null;
    if (typeof body?.applied_cutoff === 'number') appliedCutoffs.push(body.applied_cutoff);
  });
  await page.goto('/');
  const cover = page.getByRole('region', { name: '신작' }).getByRole('link', { name: '탁류' });
  await expect(cover).toBeVisible();
  await page.screenshot({ path: 'test-results/real/1-home.png' });

  await cover.tap();
  await page.waitForURL(/\/books\/takryu$/);
  await page.getByRole('button', { name: /이어서 읽기|읽기 시작/ }).tap();
  await page.waitForURL(/\/books\/takryu\/(read|briefing)/);
  if (page.url().includes('/briefing')) {
    await expect(page.getByTestId('mobile-briefing')).toBeVisible();
    await page.screenshot({ path: 'test-results/real/2-briefing.png' });
    await page.getByRole('button', { name: '이어서 읽기' }).tap();
    await page.waitForURL(/\/read/);
  }
  const article = page.getByRole('article');
  await expect(article).toBeVisible();
  const input = page.getByRole('textbox', { name: '페이지로 이동' });
  const before = Number(await input.inputValue());
  await page.screenshot({ path: 'test-results/real/3-reader.png' });

  const transitionMs = await page.evaluate(async () => {
    const t0 = performance.now();
    while (document.getAnimations().some((a) => String((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition')))
      await new Promise((r) => setTimeout(r, 20));
    return Math.round(performance.now() - t0);
  });
  console.log(`VIEW_TRANSITION_REMAINING_MS ${transitionMs}`);
  const { width, height } = page.viewportSize()!;
  await swipe(page, { fromX: width * 0.8, toX: width * 0.3, y: height * 0.5, durationMs: 400 });
  await expect(input).toHaveValue(String(before + 1));
  await expect.poll(() => progress.at(-1)).toBe(before + 1);

  await page.getByRole('button', { name: /^싸비 (열기|닫기)$/ }).tap();
  await page.getByRole('tab', { name: '인물 관계도' }).tap();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/real/4-relationship.png' });
  await expect.poll(() => appliedCutoffs.at(-1)).toBe(before + 1);
});
