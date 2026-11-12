import { expect, test } from '@playwright/test';
import { installMockApi } from './support/mockApi';
import { noHorizontalScroll } from './support/layoutChecks';

test('NFR-USE: 로그인 버튼 두 개가 44px 이상이고 가로 넘침이 없다', async ({ page }) => {
  await installMockApi(page, { guest: true });
  await page.goto('/my');
  await expect(page.getByText('로그인하지 않은 상태예요')).toBeVisible();
  for (const name of ['구글로 로그인', '카카오로 로그인']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.width, name).toBeGreaterThanOrEqual(44);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('button', { name: '의견 남기기' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('로그인 상태를 켜고 열면 표시 이름이 보인다', async ({ page }) => {
  await installMockApi(page, { authMember: true });
  await page.addInitScript(() => {
    localStorage.setItem('ssabi.auth_token', 'e2e-token');
  });
  await page.goto('/my');
  await expect(page.getByText('시험 독자님')).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});
