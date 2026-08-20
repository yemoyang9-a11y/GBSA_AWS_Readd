import type { BookSummary } from '../../types';
import ProgressBar from '../Reader/ProgressBar';

/**
 * 대시보드 표지 그리드 — S2 (FR-BRW-001·002 🚦)
 *
 * 미완비 도서(`ssabi_ready: false`)는 버튼을 disabled 로 둬 클릭 자체를 막는다.
 * 이건 UI 조치일 뿐이고 서버도 진입을 거절한다 — 둘 다 있어야 한다 (R2 `403 BOOK_NOT_READY`).
 * 진도 바의 percent 는 서버가 내려준 값을 그대로 넘긴다 (FR-BRF-005 🚦, 절대 규칙 2번).
 */
export default function BookGrid({
  books,
  onSelect,
}: {
  books: BookSummary[];
  onSelect: (book: BookSummary) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {books.map((book) => (
        <li key={book.book_id}>
          <button
            type="button"
            disabled={!book.ssabi_ready}
            onClick={() => onSelect(book)}
            className="w-full text-left disabled:opacity-50"
          >
            <img src={book.cover_url} alt="" className="w-full" />
            <span className="block font-semibold">{book.title}</span>
            <span className="block text-sm">{book.author}</span>
          </button>
          {book.progress ? <ProgressBar percent={book.progress.percent} /> : null}
        </li>
      ))}
    </ul>
  );
}
