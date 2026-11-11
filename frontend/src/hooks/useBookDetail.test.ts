import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { useBookDetail } from './useBookDetail';
import { BOOK_INFO_CONTENT } from '../data/bookInfoContent';
import type { BookInfoResponse, BookSummary, CatalogResponse } from '../types';

const fetchCatalogMock = vi.fn<() => Promise<CatalogResponse>>();
const fetchBookInfoMock = vi.fn<(bookId: string) => Promise<BookInfoResponse>>();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
  fetchBookInfo: (bookId: string) => fetchBookInfoMock(bookId),
}));

const TAKRYU: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-10-01T00:00:00.000Z',
  progress: { current_page: 21, percent: 70, is_complete: false, last_read_at: '2026-11-09T00:00:00.000Z' },
};

const NOT_READY: BookSummary = {
  book_id: 'not-ready-book',
  title: '검수 전 도서',
  author: '미상',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: false,
  genre: null,
  registered_at: '2026-10-15T00:00:00.000Z',
};

const OTHER: BookSummary = { ...NOT_READY, book_id: 'other-book', title: '다른 책', ssabi_ready: true };

const INFO: BookInfoResponse = {
  basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '411페이지' },
  introduction: '서버가 준 소개.',
  background: '첫째 배경.\n\n둘째 배경.',
  chapters: [
    { chapter_no: 1, title: '인간기념물', start_page: 1, end_page: 10 },
    { chapter_no: 2, title: '생활 제일과', start_page: 11, end_page: 20 },
  ],
};

function httpError(status: number) {
  return new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, null, { status } as AxiosResponse);
}

beforeEach(() => {
  fetchCatalogMock.mockReset();
  fetchBookInfoMock.mockReset();
  fetchCatalogMock.mockResolvedValue({ books: [TAKRYU, NOT_READY, OTHER] });
});

test('준비된 책은 소개·배경·장 목록을 준다', async () => {
  fetchBookInfoMock.mockResolvedValue(INFO);
  const { result } = renderHook(() => useBookDetail('takryu'));

  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.book?.book_id).toBe('takryu');
  expect(result.current.introduction).toBe('서버가 준 소개.');
  expect(result.current.background).toEqual(['첫째 배경.', '둘째 배경.']);
  expect(result.current.chapters).toEqual(INFO.chapters);
  expect(fetchBookInfoMock).toHaveBeenCalledWith('takryu');
});

test('소개와 배경이 비어 있으면 정적 소개 자료를 쓴다', async () => {
  fetchBookInfoMock.mockResolvedValue({ ...INFO, introduction: '', background: '' });
  const { result } = renderHook(() => useBookDetail('takryu'));

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.introduction).toBe(BOOK_INFO_CONTENT.takryu.intro);
  expect(result.current.background).toEqual(BOOK_INFO_CONTENT.takryu.background);
});

test('FR-ADM-005: 준비되지 않은 책은 not-ready이고 /info를 부르지 않는다', async () => {
  fetchBookInfoMock.mockResolvedValue(INFO);
  const { result } = renderHook(() => useBookDetail('not-ready-book'));

  await waitFor(() => expect(result.current.status).toBe('not-ready'));
  expect(result.current.book?.book_id).toBe('not-ready-book');
  expect(result.current.chapters).toEqual([]);
  expect(fetchBookInfoMock).not.toHaveBeenCalled();
});

test('/info가 403이면 not-ready다', async () => {
  fetchBookInfoMock.mockRejectedValue(httpError(403));
  const { result } = renderHook(() => useBookDetail('other-book'));

  await waitFor(() => expect(result.current.status).toBe('not-ready'));
  expect(result.current.chapters).toEqual([]);
});

test('목록에 없는 책은 not-found다', async () => {
  const { result } = renderHook(() => useBookDetail('no-such-book'));

  await waitFor(() => expect(result.current.status).toBe('not-found'));
  expect(result.current.book).toBeNull();
  expect(fetchBookInfoMock).not.toHaveBeenCalled();
});

test('/info가 404면 not-found다', async () => {
  fetchBookInfoMock.mockRejectedValue(httpError(404));
  const { result } = renderHook(() => useBookDetail('other-book'));

  await waitFor(() => expect(result.current.status).toBe('not-found'));
});

test('그 밖의 실패는 error이고 retry로 다시 부른다', async () => {
  fetchBookInfoMock.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(INFO);
  const { result } = renderHook(() => useBookDetail('takryu'));

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.book?.book_id).toBe('takryu');
  expect(result.current.chapters).toEqual([]);

  act(() => result.current.retry());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(fetchBookInfoMock).toHaveBeenCalledTimes(2);
  expect(result.current.chapters).toEqual(INFO.chapters);
});

test('작품 목록을 못 불러오면 error이고 retry로 목록을 다시 부른다', async () => {
  fetchCatalogMock.mockReset();
  fetchCatalogMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ books: [TAKRYU] });
  fetchBookInfoMock.mockResolvedValue(INFO);
  const { result } = renderHook(() => useBookDetail('takryu'));

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.book).toBeNull();

  act(() => result.current.retry());

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
});

test('책이 바뀌면 앞 책의 늦은 정보를 쓰지 않는다', async () => {
  let resolveFirst!: (info: BookInfoResponse) => void;
  fetchBookInfoMock.mockImplementation((bookId) =>
    bookId === 'takryu'
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve({ ...INFO, introduction: '다른 책 소개.' })
  );
  const { result, rerender } = renderHook(({ bookId }) => useBookDetail(bookId), {
    initialProps: { bookId: 'takryu' },
  });
  await waitFor(() => expect(fetchBookInfoMock).toHaveBeenCalledWith('takryu'));

  rerender({ bookId: 'other-book' });
  await waitFor(() => expect(result.current.introduction).toBe('다른 책 소개.'));

  await act(async () => {
    resolveFirst(INFO);
  });

  expect(result.current.book?.book_id).toBe('other-book');
  expect(result.current.introduction).toBe('다른 책 소개.');
});
