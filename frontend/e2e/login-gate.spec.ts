import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { noHorizontalScroll } from './support/layoutChecks';

async function openGate(page: Page) {
  await page.goto(`/books/${BOOK_ID}`);
  await page.getByRole('button', { name: '이어서 읽기' }).click();
  return page.getByRole('dialog', { name: '로그인' });
}

test('비로그인 사용자가 읽기를 누르면 진입 요청 없이 로그인 창이 뜨고, 두 버튼이 같은 크기로 가로 한 줄이다', async ({
  page,
}, testInfo) => {
  const log = await installMockApi(page, { guest: true });
  const dialog = await openGate(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('SNS 계정으로 로그인/가입')).toBeVisible();
  expect(log.entries).toBe(0);

  const kakao = (await page.getByRole('button', { name: '카카오 로그인' }).boundingBox())!;
  const google = (await page.getByRole('button', { name: 'Google 로그인' }).boundingBox())!;
  expect(Math.abs(kakao.width - google.width)).toBeLessThan(1);
  expect(Math.abs(kakao.height - google.height)).toBeLessThan(1);
  expect(Math.abs(kakao.y - google.y)).toBeLessThan(1);
  expect(kakao.height).toBeGreaterThanOrEqual(44);
  expect(kakao.x).toBeLessThan(google.x);

  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  if (testInfo.project.name === 'desktop') {
    await expect(dialog).toHaveAttribute('data-variant', 'modal');
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  } else {
    await expect(dialog).toHaveAttribute('data-variant', 'sheet');
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(2);
    expect(box.width).toBe(viewport.width);
  }
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('로그인 창을 닫으면 작품 페이지에 남는다', async ({ page }) => {
  await installMockApi(page, { guest: true });
  const dialog = await openGate(page);
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}$`));
});

test('처음 가입하면 동의 화면을 거쳐 열려던 책의 읽기 화면으로 돌아온다', async ({ page }) => {
  const log = await installMockApi(page, { guest: true, entryRoute: 'reader' });
  const dialog = await openGate(page);
  await dialog.getByRole('button', { name: '카카오 로그인' }).click();

  const form = page.getByRole('form', { name: '가입 동의' });
  await expect(form).toBeVisible();
  await expect(form.getByText('초안 — 검토 전')).toBeVisible();
  const proceed = form.getByRole('button', { name: '동의하고 시작하기' });
  await expect(proceed).toBeDisabled();

  await form.getByRole('checkbox', { name: '[필수] 이용약관' }).check();
  await form.getByRole('checkbox', { name: '[필수] 개인정보 수집·이용' }).check();
  await expect(proceed).toBeDisabled();
  await form.getByRole('checkbox', { name: '[필수] 만 14세 이상입니다' }).check();
  await expect(proceed).toBeEnabled();
  await proceed.click();

  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/read$`));
  expect(log.events).toContain('login:kakao');
  expect(log.events).toContain('consent');
  expect(log.entries).toBeGreaterThanOrEqual(1);
});

test('동의 화면의 본문 보기는 초안 표시가 달린 약관 본문을 연다', async ({ page }) => {
  await installMockApi(page, { guest: true });
  const dialog = await openGate(page);
  await dialog.getByRole('button', { name: 'Google 로그인' }).click();

  await page.getByRole('button', { name: '이용약관 본문 보기' }).click();
  const doc = page.getByRole('dialog', { name: '이용약관' });
  await expect(doc.getByText(/초안 — 검토 전/)).toBeVisible();
  await expect(doc.getByText('제1조 목적')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('로그인한 사용자는 로그인 창 없이 바로 읽기 화면에 들어간다', async ({ page }) => {
  const log = await installMockApi(page, { entryRoute: 'reader' });
  await page.goto(`/books/${BOOK_ID}`);
  await page.getByRole('button', { name: '이어서 읽기' }).click();

  await expect(page).toHaveURL(new RegExp(`/books/${BOOK_ID}/read$`));
  await expect(page.getByRole('dialog', { name: '로그인' })).toHaveCount(0);
  expect(log.entries).toBeGreaterThanOrEqual(1);
});
