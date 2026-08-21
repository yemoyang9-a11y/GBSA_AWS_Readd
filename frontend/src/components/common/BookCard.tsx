import type { BookSummary } from '../../types';
import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from './TypographicCover';

/**
 * 도서 카드 — 시안 book-card (폭 312px, 모서리 16px, 패딩 18px)
 *
 * 미완비 도서는 버튼을 disabled 로 둬 클릭 자체를 막는다. 이건 UI 조치일 뿐이고
 * 서버도 진입을 거절한다 — 둘 다 있어야 한다 (FR-BRW-002 🚦, R2 403 BOOK_NOT_READY).
 * 진도 percent 는 서버가 내려준 값을 그대로 넘긴다 (FR-BRF-005 🚦, 절대 규칙 2번).
 *
 * `intro_summary` 가 null 이면 소개 영역을 통째로 비운다 — 자리표시 문구를 지어내지 않는다.
 * (엔드포인트 계획 D-3 확정으로 계약에 들어왔다. 이전의 타입 캐스트를 걷어냈다.)
 */
export default function BookCard({
  book,
  onSelect,
}: {
  book: BookSummary;
  onSelect: (book: BookSummary) => void;
}) {
  const intro = book.intro_summary;

  return (
    <div className="w-book-card rounded-card bg-surface p-card shadow-card">
      <button
        type="button"
        disabled={!book.ssabi_ready}
        onClick={() => onSelect(book)}
        className="w-full text-left disabled:opacity-50"
      >
        <TypographicCover title={book.title} author={book.author} coverUrl={book.cover_url} />

        <span className="mt-4 block truncate font-serif text-lg font-bold text-ink">
          {book.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{book.author}</span>

        {intro ? (
          <span data-testid="book-intro" className="mt-2 block line-clamp-2 text-xs leading-normal text-muted">
            {intro}
          </span>
        ) : null}
      </button>

      {book.progress ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted">읽는 중</span>
            <span className="font-bold text-ink">{book.progress.percent}% 완료</span>
          </div>
          <ProgressBar percent={book.progress.percent} />
        </div>
      ) : null}
    </div>
  );
}
