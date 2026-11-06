import TypographicCover from '../../components/common/TypographicCover';
import type { DashFilter } from '../../components/Dashboard/ShelfList';
import type { BookSummary } from '../../types';

const FILTERS: { id: DashFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'done', label: '완독' },
  { id: 'reading', label: '읽는 중' },
];

// FR-BRW-001 FR-BRF-005 🚦
export default function MobileShelf({
  books,
  visibleBooks,
  selectedId,
  onPreview,
  filter,
  onFilterChange,
  emptyMessage,
  onInfo,
}: {
  books: BookSummary[];
  visibleBooks: BookSummary[];
  selectedId: string;
  onPreview: (book: BookSummary) => void;
  filter: DashFilter;
  onFilterChange: (filter: DashFilter) => void;
  emptyMessage: string;
  onInfo: (book: BookSummary) => void;
}) {
  if (books.length <= 1) return null;

  return (
    <section className="mt-10">
      <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">MY SHELF</p>
      <h3 className="mt-0 whitespace-nowrap font-dashSerif text-[22px] font-semibold tracking-[-.07em] text-dash-ink">
        내 서재 <span className="text-[#89918a]">({books.length})</span>
      </h3>
      <div className="mt-3 flex gap-2">
        {FILTERS.map((tab) => {
          const selected = tab.id === filter;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onFilterChange(tab.id)}
              className={`min-h-11 min-w-11 whitespace-nowrap rounded-[18px] border px-4 font-dashSans text-[14px] ${
                selected ? 'border-dash-ink bg-dash-ink text-white' : 'border-dash-line bg-transparent text-dash-muted'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {visibleBooks.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-dash-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visibleBooks.map((book) => {
            const selected = book.book_id === selectedId;
            return (
              <li key={book.book_id} className="relative">
                <button
                  type="button"
                  aria-label={`${book.title} 선택`}
                  aria-pressed={selected}
                  onClick={() => onPreview(book)}
                  className={`flex w-full items-center gap-4 rounded-dash-card border bg-white p-3 pr-14 text-left shadow-dash-soft transition-transform ${
                    selected ? 'border-[#777] -translate-y-0.5' : 'border-dash-line'
                  }`}
                >
                  <span className="shrink-0 [&>div]:px-2">
                    <TypographicCover size="row" title={book.title} author={book.author} coverUrl={book.cover_url} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep font-dashSans text-[16px] text-dash-ink">{book.title}</span>
                    <span className="mt-1 block break-keep font-dashSans text-[13px] text-dash-muted">{book.author}</span>
                    {book.progress ? (
                      <span className="mt-3 block font-dashSans text-[13px] font-semibold text-[#555]">
                        {book.progress.percent}% 완료
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`${book.title} 정보 보기`}
                  onClick={() => onInfo(book)}
                  className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-dash-muted"
                >
                  <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
                    <line x1="12" y1="11" x2="12" y2="16.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="12" cy="7.6" r="0.9" fill="currentColor" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
