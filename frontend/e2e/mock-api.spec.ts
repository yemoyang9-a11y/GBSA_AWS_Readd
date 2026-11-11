import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';

const API = 'http://api.e2e.test';

async function call(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const response = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, json: await response.json() };
    },
    { url: `${API}${path}`, method, body }
  );
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '가짜 API 점검은 한 번만');
  await installMockApi(page);
  await page.goto('/books/no-such/briefing-not-a-route');
});

test('FR-BRF-005: 탁류 목록 항목의 진도는 위치 응답과 같은 쪽이고 last_read_at이 있다', async ({ page }) => {
  const catalog = await call(page, 'GET', '/books');
  const takryu = catalog.json.books.find((b: { book_id: string }) => b.book_id === BOOK_ID);
  expect(takryu.progress).toEqual({
    current_page: 15,
    percent: 50,
    is_complete: false,
    last_read_at: '2026-11-09T00:00:00.000Z',
  });
  const position = await call(page, 'GET', `/books/${BOOK_ID}/position`);
  expect(position.json.applied_cutoff).toBe(takryu.progress.current_page);
});

test('FR-ADM-005: /info는 준비된 책 200, 준비되지 않은 책 403, 없는 책 404', async ({ page }) => {
  const ok = await call(page, 'GET', '/books/done-book/info');
  expect(ok.status).toBe(200);
  expect(ok.json.basic_info.title).toBe('다 읽은 책');
  expect((await call(page, 'GET', '/books/not-ready-book/info')).status).toBe(403);
  expect((await call(page, 'GET', '/books/no-such-book/info')).status).toBe(404);
});

test('FR-SPL-002: 진도를 뒤로 옮기면 위치 응답과 목록 진도가 그 쪽을 따른다', async ({ page }) => {
  await call(page, 'POST', `/books/${BOOK_ID}/progress`, { page: 5 });

  const position = await call(page, 'GET', `/books/${BOOK_ID}/position`);
  expect(position.json).toEqual({
    applied_cutoff: 5,
    current_chapter_no: 1,
    read_chapter_nos: [],
    is_complete: false,
  });
  const catalog = await call(page, 'GET', '/books');
  const takryu = catalog.json.books.find((b: { book_id: string }) => b.book_id === BOOK_ID);
  expect(takryu.progress.current_page).toBe(5);
});

test('FR-SPL-002: 진도를 앞으로 옮기면 위치 응답의 세 값이 그 쪽을 따른다', async ({ page }) => {
  await call(page, 'POST', `/books/${BOOK_ID}/progress`, { page: 5 });
  await call(page, 'POST', `/books/${BOOK_ID}/progress`, { page: 25 });

  const position = await call(page, 'GET', `/books/${BOOK_ID}/position`);
  expect(position.json).toEqual({
    applied_cutoff: 25,
    current_chapter_no: 3,
    read_chapter_nos: [1, 2],
    is_complete: false,
  });
});

test('FR-SPL-002: 다른 책의 진도를 옮기면 그 책의 위치 응답만 바뀐다', async ({ page }) => {
  await call(page, 'POST', '/books/done-book/progress', { page: 12 });

  expect((await call(page, 'GET', '/books/done-book/position')).json).toEqual({
    applied_cutoff: 12,
    current_chapter_no: 2,
    read_chapter_nos: [1],
    is_complete: false,
  });
  expect((await call(page, 'GET', `/books/${BOOK_ID}/position`)).json.applied_cutoff).toBe(15);
  expect((await call(page, 'GET', '/books/unread-book/position')).json).toEqual({
    applied_cutoff: 0,
    current_chapter_no: null,
    read_chapter_nos: [],
    is_complete: false,
  });
});
