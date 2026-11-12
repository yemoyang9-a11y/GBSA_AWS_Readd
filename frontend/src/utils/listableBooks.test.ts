import { listableBooks } from './listableBooks';
import { mockCatalog } from '../../mocks/fixtures';

test('FR-BRW-002 🚦: 미검수 도서는 목록에서 0권이다', () => {
  expect(listableBooks(mockCatalog).filter((book) => !book.ssabi_ready)).toEqual([]);
});

test('FR-BRW-002 🚦: 검수된 도서는 서버가 준 순서 그대로 남는다', () => {
  expect(listableBooks(mockCatalog).map((book) => book.book_id)).toEqual(['takryu', 'unread-book', 'done-book']);
});

test('입력 배열을 바꾸지 않는다', () => {
  const books = [...mockCatalog];
  listableBooks(books);
  expect(books).toEqual(mockCatalog);
});
