import type { BookSummary } from '../../types';
import BookCard from './BookCard';

/**
 * 대시보드 표지 그리드 — S2 (FR-BRW-001·002 🚦)
 *
 * 카드 한 칸의 책임은 BookCard 가 갖는다. 여기는 배치만 한다 — 시안의 간격 24px.
 */
export default function BookGrid({
  books,
  onSelect,
}: {
  books: BookSummary[];
  onSelect: (book: BookSummary) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-gutter">
      {books.map((book) => (
        <li key={book.book_id}>
          <BookCard book={book} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
