import { searchBooks } from './searchBooks';
import { mockCatalog } from '../../mocks/fixtures';
import type { BookSummary } from '../types';

const ids = (books: BookSummary[]) => books.map((book) => book.book_id);

const books: BookSummary[] = [
  ...mockCatalog,
  { ...mockCatalog[0], book_id: 'english', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
];

test('FR-BRW-001: 빈 검색어는 전체를 돌려준다', () => {
  expect(ids(searchBooks(books, ''))).toEqual(ids(books));
  expect(ids(searchBooks(books, '   '))).toEqual(ids(books));
});

test('FR-BRW-001: 제목 일부로 찾는다', () => {
  expect(ids(searchBooks(books, '탁'))).toEqual(['takryu']);
});

test('FR-BRW-001: 저자 이름으로 찾는다', () => {
  expect(ids(searchBooks(books, '채만식'))).toEqual(['takryu']);
});

test('FR-BRW-001: 앞뒤 공백을 무시한다', () => {
  expect(ids(searchBooks(books, '  탁류 '))).toEqual(['takryu']);
});

test('FR-BRW-001: 영문 대소문자를 가리지 않는다', () => {
  expect(ids(searchBooks(books, 'GATSBY'))).toEqual(['english']);
  expect(ids(searchBooks(books, 'scott'))).toEqual(['english']);
});

test('FR-BRW-001: 기호가 들어와도 오류 없이 빈 결과를 준다', () => {
  expect(searchBooks(books, '(*[')).toEqual([]);
});

test('FR-BRW-001: 결과는 입력 순서 그대로이고 입력 배열을 바꾸지 않는다', () => {
  const before = ids(books);
  expect(ids(searchBooks(books, '시험 작가'))).toEqual(['unread-book', 'done-book']);
  expect(ids(books)).toEqual(before);
});
