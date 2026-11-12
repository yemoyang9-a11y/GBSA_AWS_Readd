import { act, renderHook, waitFor } from '@testing-library/react';
import { useCatalog } from './useCatalog';
import type { BookSummary } from '../types';

const reading: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-10-01T00:00:00.000Z',
  progress: {
    current_page: 72,
    percent: 25.3,
    is_complete: false,
    last_read_at: '2026-11-09T00:00:00.000Z',
  },
};

const done: BookSummary = {
  book_id: 'done-book',
  title: '다 읽은 책',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: '애정소설',
  registered_at: '2026-11-03T00:00:00.000Z',
  progress: {
    current_page: 20,
    percent: 100,
    is_complete: true,
    last_read_at: '2026-11-05T00:00:00.000Z',
  },
};

const unread: BookSummary = {
  book_id: 'unread-book',
  title: '읽지 않은 책',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-11-01T00:00:00.000Z',
};

const fetchCatalogMock = vi.fn();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
}));

beforeEach(() => {
  fetchCatalogMock.mockReset();
});

test('useCatalog: 목록을 서버가 준 순서 그대로 준다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [unread, done, reading] });
  const { result } = renderHook(() => useCatalog());

  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.books.map((b) => b.book_id)).toEqual(['unread-book', 'done-book', 'takryu']);
});

test('useCatalog: 시범용 책을 붙이지 않는다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [reading] });
  const { result } = renderHook(() => useCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.books.filter((b) => b.book_id.startsWith('__demo-'))).toHaveLength(0);
  expect(result.current.books).toHaveLength(1);
});

test('useCatalog: 표지 주소가 비어 있으면 표지 덮어쓰기 값을 쓴다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [reading, unread] });
  const { result } = renderHook(() => useCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.books[0].cover_url).toBe('/covers/takryu.jpg');
  expect(result.current.books[1].cover_url).toBe('');
});

test('useCatalog: 서버가 준 is_complete·last_read_at·genre·registered_at을 그대로 넘긴다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [done, reading] });
  const { result } = renderHook(() => useCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  const [first, second] = result.current.books;
  expect(first.genre).toBe('애정소설');
  expect(first.registered_at).toBe('2026-11-03T00:00:00.000Z');
  expect(first.progress).toEqual(done.progress);
  expect(second.genre).toBeNull();
  expect(second.progress).toEqual(reading.progress);
});

test('useCatalog: 불러오기에 실패하면 status가 error이고 reload로 다시 부른다', async () => {
  fetchCatalogMock.mockRejectedValueOnce(new Error('network'));
  fetchCatalogMock.mockResolvedValueOnce({ books: [reading] });
  const { result } = renderHook(() => useCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.books).toEqual([]);

  act(() => result.current.reload());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
  expect(result.current.books.map((b) => b.book_id)).toEqual(['takryu']);
});

test('useCatalog: 결과를 모듈에 캐시하지 않는다 — 다시 마운트하면 새로 받는다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [reading] });
  const first = renderHook(() => useCatalog());
  await waitFor(() => expect(first.result.current.status).toBe('ready'));
  first.unmount();

  const second = renderHook(() => useCatalog());
  expect(second.result.current.status).toBe('loading');
  await waitFor(() => expect(second.result.current.status).toBe('ready'));
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
});

test('FR-ADM-005: 목록 훅은 미검수 도서를 거르지 않는다 — 작품 페이지가 준비 중을 알려야 한다', async () => {
  const notReady: BookSummary = { ...unread, book_id: 'not-ready', ssabi_ready: false };
  fetchCatalogMock.mockResolvedValue({ books: [reading, notReady] });
  const { result } = renderHook(() => useCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.books.map((book) => book.book_id)).toEqual([reading.book_id, 'not-ready']);
});
