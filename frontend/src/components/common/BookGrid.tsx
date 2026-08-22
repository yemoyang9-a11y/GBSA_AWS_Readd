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
  emptyMessage,
  busyId,
}: {
  books: BookSummary[];
  onSelect: (book: BookSummary) => void;
  /** 목록이 비었을 때 그 이유를 말한다. 없으면 아무것도 그리지 않는다 */
  emptyMessage?: string;
  /** 진입 왕복 중인 도서. 그 카드는 잠근다 */
  busyId?: string | null;
}) {
  if (books.length === 0) {
    return emptyMessage ? (
      <p className="py-16 text-center text-[13px] text-muted">{emptyMessage}</p>
    ) : null;
  }

  return (
    <ul className="flex flex-wrap gap-gutter">
      {books.map((book) => (
        <li key={book.book_id}>
          <BookCard book={book} onSelect={onSelect} busy={busyId !== null && busyId !== undefined} />
        </li>
      ))}
    </ul>
  );
}
