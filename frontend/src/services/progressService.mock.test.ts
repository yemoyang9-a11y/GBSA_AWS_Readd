import { enterBook, sendProgress } from './progressService';
import { fetchCatalog } from './bookService';
import { fetchPosition } from './positionService';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  USE_MOCK: true,
}));

async function catalogPage(bookId: string) {
  const { books } = await fetchCatalog();
  return books.find((book) => book.book_id === bookId)?.progress?.current_page;
}

test('FR-PRG-003: 다른 책의 진도를 옮기면 그 책의 진입·목록·위치만 바뀌고 탁류는 그대로다', async () => {
  await sendProgress('done-book', 12);

  expect((await enterBook('done-book')).page).toBe(12);
  expect(await catalogPage('done-book')).toBe(12);
  await expect(fetchPosition('done-book')).resolves.toEqual({
    applied_cutoff: 12,
    current_chapter_no: 2,
    read_chapter_nos: [1],
    is_complete: false,
  });

  expect((await enterBook('takryu')).page).toBe(21);
  expect(await catalogPage('takryu')).toBe(21);
  expect((await fetchPosition('takryu')).applied_cutoff).toBe(21);
});

test('FR-PRG-003: 탁류의 진도를 옮기면 탁류의 진입·목록·위치만 바뀌고 다른 책은 그대로다', async () => {
  await sendProgress('done-book', 20);
  await sendProgress('takryu', 8);

  expect((await enterBook('takryu')).page).toBe(8);
  expect(await catalogPage('takryu')).toBe(8);
  expect((await fetchPosition('takryu')).read_chapter_nos).toEqual([]);

  expect((await enterBook('done-book')).page).toBe(20);
  expect(await catalogPage('done-book')).toBe(20);
  expect((await fetchPosition('done-book')).is_complete).toBe(true);
  await sendProgress('takryu', 21);
});

test('FR-BRF-001: 진도가 없는 책의 첫 진입은 1쪽 브리핑이고, 진입만으로는 진도가 생기지 않는다', async () => {
  const entry = await enterBook('unread-book');

  expect(entry.route).toBe('briefing');
  expect(entry.page).toBe(1);
  expect(await catalogPage('unread-book')).toBeUndefined();
  await expect(fetchPosition('unread-book')).resolves.toEqual({
    applied_cutoff: 0,
    current_chapter_no: null,
    read_chapter_nos: [],
    is_complete: false,
  });
});

test('FR-BRW-002: 준비되지 않은 책과 없는 책의 진입은 403으로 실패한다', async () => {
  await expect(enterBook('not-ready-book')).rejects.toMatchObject({ response: { status: 403 } });
  await expect(enterBook('no-such-book')).rejects.toMatchObject({ response: { status: 403 } });
});

test('USE_MOCK=true에서 진입·진도·목록·위치는 네트워크 요청을 보내지 않는다', () => {
  expect(api.get).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});

test('FR-BRF-005: 책을 읽으면 그 책의 last_read_at이 목록에서 가장 늦고, 읽지 않은 책은 바뀌지 않는다', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T03:00:00.000Z'));
  const before = await fetchCatalog();
  const takryuBefore = before.books.find((b) => b.book_id === 'takryu')!.progress!.last_read_at;

  await sendProgress('done-book', 5);

  const { books } = await fetchCatalog();
  const lastRead = books.filter((b) => b.progress).map((b) => [b.book_id, b.progress!.last_read_at]);
  const latest = [...lastRead].sort((a, b) => b[1].localeCompare(a[1]))[0];
  expect(latest).toEqual(['done-book', '2026-11-12T03:00:00.000Z']);
  expect(books.find((b) => b.book_id === 'takryu')!.progress!.last_read_at).toBe(takryuBefore);
  expect(books.find((b) => b.book_id === 'unread-book')!.progress).toBeUndefined();
  vi.useRealTimers();
});
