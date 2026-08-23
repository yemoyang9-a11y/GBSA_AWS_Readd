import FilterTabs from '../common/FilterTabs';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';

export type DashFilter = 'all' | 'reading' | 'done';

const FILTERS: { id: DashFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'done', label: '완독' },
  { id: 'reading', label: '읽는 중' },
];

/**
 * 서재 목록 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .library-head` + `.library`)
 *
 * 행을 클릭해도 이동하지 않는다 — 히어로의 미리보기 대상만 바뀐다(`onPreview`).
 * 실제 진입은 히어로의 "이어서 읽기" 버튼이 한다(`ContinueReadingHero`).
 *
 * 책이 1권뿐이면(발표 전 실제 카탈로그가 그렇다) 아무것도 렌더하지 않는다 — 히어로가
 * 이미 그 책이라 목록·필터가 같은 책의 빈 반복이 된다.
 */
export default function ShelfList({
  books,
  visibleBooks,
  selectedId,
  onPreview,
  filter,
  onFilterChange,
  emptyMessage,
}: {
  books: BookSummary[];
  visibleBooks: BookSummary[];
  selectedId: string;
  onPreview: (book: BookSummary) => void;
  filter: DashFilter;
  onFilterChange: (filter: DashFilter) => void;
  emptyMessage?: string;
}) {
  if (books.length <= 1) return null;

  return (
    <section className="mt-14">
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
            YOUR SHELF
          </p>
          <h3 className="mt-0 font-dashSerif text-2xl font-semibold tracking-[-.07em] text-dash-ink">
            내 서재 <span className="text-[#89918a]">({books.length})</span>
          </h3>
        </div>
        <FilterTabs tabs={FILTERS} active={filter} onChange={onFilterChange} />
      </div>

      {visibleBooks.length === 0 ? (
        emptyMessage ? (
          <p className="py-16 text-center text-[13px] text-dash-muted">{emptyMessage}</p>
        ) : null
      ) : (
        <ul className="grid grid-cols-2 gap-[22px]">
          {visibleBooks.map((book) => {
            const selected = book.book_id === selectedId;
            return (
              <li key={book.book_id}>
                <button
                  type="button"
                  aria-label={`${book.title} 선택`}
                  onClick={() => onPreview(book)}
                  className={`flex h-[150px] w-full items-center gap-[17px] rounded-dash-card border bg-white p-4 text-left shadow-dash-soft transition-transform ${
                    selected ? 'selected border-[#777] -translate-y-0.5' : 'border-dash-line'
                  }`}
                >
                  <TypographicCover
                    size="row"
                    title={book.title}
                    author={book.author}
                    coverUrl={book.cover_url}
                  />
                  <div>
                    <h4 className="m-0 mb-1 font-dashSans text-[17px] text-dash-ink">
                      {book.title}
                    </h4>
                    <p className="m-0 font-dashSans text-[13px] text-dash-muted">{book.author}</p>
                    {book.progress ? (
                      <div className="mt-4 font-dashSans text-[13px] font-semibold text-[#555]">
                        {book.progress.percent}% 완료
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
