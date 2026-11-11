import { genreRows, newestFirst, pickContinueBook } from './homeRows';
import type { BookSummary } from '../types';

function book(overrides: Partial<BookSummary> & { book_id: string }): BookSummary {
  return {
    title: overrides.book_id,
    author: '시험 작가',
    cover_url: '',
    intro_summary: null,
    ssabi_ready: true,
    genre: null,
    registered_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function reading(book_id: string, last_read_at: string, extra: Partial<BookSummary> = {}): BookSummary {
  return book({
    book_id,
    progress: { current_page: 10, percent: 50, is_complete: false, last_read_at },
    ...extra,
  });
}

const ids = (books: BookSummary[]) => books.map((b) => b.book_id);

test('pickContinueBook: last_read_at이 가장 늦은 책을 고른다', () => {
  const books = [
    reading('done-book', '2026-11-05T00:00:00.000Z'),
    reading('takryu', '2026-11-09T00:00:00.000Z'),
    book({ book_id: 'unread-book' }),
  ];
  expect(pickContinueBook(books)?.book_id).toBe('takryu');
});

test('pickContinueBook: 입력 순서가 달라도 같은 책을 고른다', () => {
  const books = [
    reading('takryu', '2026-11-09T00:00:00.000Z'),
    reading('done-book', '2026-11-05T00:00:00.000Z'),
  ];
  expect(pickContinueBook(books)?.book_id).toBe('takryu');
  expect(pickContinueBook([...books].reverse())?.book_id).toBe('takryu');
});

test('pickContinueBook: 진도가 있는 책이 없으면 null이다', () => {
  expect(pickContinueBook([book({ book_id: 'unread-book' })])).toBeNull();
  expect(pickContinueBook([])).toBeNull();
});

test('pickContinueBook: 준비되지 않은 책은 고르지 않는다', () => {
  const books = [
    reading('not-ready', '2026-11-10T00:00:00.000Z', { ssabi_ready: false }),
    reading('takryu', '2026-11-09T00:00:00.000Z'),
  ];
  expect(pickContinueBook(books)?.book_id).toBe('takryu');
  expect(
    pickContinueBook([reading('not-ready', '2026-11-10T00:00:00.000Z', { ssabi_ready: false })])
  ).toBeNull();
});

test('newestFirst: registered_at 내림차순이다', () => {
  const books = [
    book({ book_id: 'a', registered_at: '2026-10-01T00:00:00.000Z' }),
    book({ book_id: 'b', registered_at: '2026-11-03T00:00:00.000Z' }),
    book({ book_id: 'c', registered_at: '2026-10-15T00:00:00.000Z' }),
  ];
  expect(ids(newestFirst(books))).toEqual(['b', 'c', 'a']);
});

test('newestFirst: registered_at이 같으면 title 오름차순이고 몇 번 불러도 순서가 같다', () => {
  const same = '2026-11-01T00:00:00.000Z';
  const books = [
    book({ book_id: 'k', title: '다', registered_at: same }),
    book({ book_id: 'i', title: '가', registered_at: same }),
    book({ book_id: 'j', title: '나', registered_at: same }),
  ];
  expect(ids(newestFirst(books))).toEqual(['i', 'j', 'k']);
  expect(ids(newestFirst(newestFirst(books)))).toEqual(['i', 'j', 'k']);
  expect(ids(newestFirst([...books].reverse()))).toEqual(['i', 'j', 'k']);
});

test('newestFirst: 입력 배열의 순서를 바꾸지 않는다', () => {
  const books = [
    book({ book_id: 'a', registered_at: '2026-10-01T00:00:00.000Z' }),
    book({ book_id: 'b', registered_at: '2026-11-03T00:00:00.000Z' }),
  ];
  const before = ids(books);
  newestFirst(books);
  expect(ids(books)).toEqual(before);
});

test('genreRows: 장르별로 묶고 장르 이름 가나다순으로 준다', () => {
  const books = [
    book({ book_id: 'x1', genre: '추리', registered_at: '2026-10-01T00:00:00.000Z' }),
    book({ book_id: 'x2', genre: '애정소설', registered_at: '2026-10-02T00:00:00.000Z' }),
    book({ book_id: 'x3', genre: '추리', registered_at: '2026-11-01T00:00:00.000Z' }),
    book({ book_id: 'x4', genre: '근대문학', registered_at: '2026-10-03T00:00:00.000Z' }),
  ];
  const rows = genreRows(books);
  expect(rows.map((row) => row.genre)).toEqual(['근대문학', '애정소설', '추리']);
  expect(ids(rows[2].books)).toEqual(['x3', 'x1']);
});

test('genreRows: 장르가 null이거나 빈 문자열인 책은 어느 줄에도 없다', () => {
  const books = [
    book({ book_id: 'none', genre: null }),
    book({ book_id: 'empty', genre: '' }),
    book({ book_id: 'has', genre: '애정소설' }),
  ];
  const rows = genreRows(books);
  expect(rows.flatMap((row) => ids(row.books))).toEqual(['has']);
});

test('genreRows: 장르가 있는 책이 없으면 빈 배열이다', () => {
  expect(genreRows([book({ book_id: 'a', genre: null }), book({ book_id: 'b', genre: '' })])).toEqual([]);
  expect(genreRows([])).toEqual([]);
});
