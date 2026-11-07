import { expect, test } from '@playwright/test';

test('결정 10: 홈 화면 추가 manifest는 standalone이고 이름이 싸비다', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation, '태블릿 PC 화면을 세로로 고정하지 않는다').toBeUndefined();
  expect(manifest.name).toBe('싸비');
  expect(manifest.short_name).toBe('싸비');
  expect(manifest.start_url).toBe('/');
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

test('결정 10: iOS 홈 화면 메타와 아이콘이 있다', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', '싸비');
  const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const response = await request.get(icon!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
});
