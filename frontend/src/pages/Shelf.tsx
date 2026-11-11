import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import BookCover from '../components/common/BookCover';
import { useCatalog } from '../hooks/useCatalog';
import { APP_ROUTES, bookPath } from '../utils/routes';
import type { BookSummary } from '../types';

type ShelfFilter = 'all' | 'reading' | 'done';

const FILTERS: { value: ShelfFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'reading', label: '읽는 중' },
  { value: 'done', label: '완독' },
];

function matches(book: BookSummary, filter: ShelfFilter): boolean {
  if (filter === 'reading') return book.progress?.is_complete === false;
  if (filter === 'done') return book.progress?.is_complete === true;
  return true;
}

// FR-BRW-001 FR-BRF-005 FR-SPL-005
export default function Shelf() {
  const { books, status, reload } = useCatalog();
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const shelfBooks = books.filter((book) => book.progress);
  const visible = shelfBooks.filter((book) => matches(book, filter));

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const current = FILTERS.findIndex((item) => item.value === filter);
    const next = (current + step + FILTERS.length) % FILTERS.length;
    setFilter(FILTERS[next].value);
    radios.current[next]?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-page px-7 py-8 mobile:px-4 mobile:py-4">
      <div className="flex items-baseline gap-2">
        <h1 className="m-0 font-dashSerif text-xl font-bold text-dash-ink">내 서재</h1>
        {status === 'ready' && shelfBooks.length > 0 && (
          <span className="text-sm text-dash-muted">{shelfBooks.length}권</span>
        )}
      </div>

      {status === 'loading' && (
        <p role="status" className="mt-6 text-sm text-dash-muted">
          불러오는 중
        </p>
      )}

      {status === 'error' && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="m-0 text-sm text-dash-ink">작품을 불러오지 못했습니다</p>
          <button
            type="button"
            onClick={reload}
            className="min-h-11 rounded-full border border-dash-ink bg-transparent px-[14px] text-xs font-bold text-dash-ink"
          >
            다시 시도
          </button>
        </div>
      )}

      {status === 'ready' && shelfBooks.length === 0 && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="m-0 text-sm text-dash-ink">아직 읽기 시작한 책이 없어요</p>
          <Link
            to={APP_ROUTES.home}
            className="inline-flex min-h-11 items-center rounded-full border border-dash-ink px-[14px] text-xs font-bold text-dash-ink"
          >
            홈에서 작품 찾기
          </Link>
        </div>
      )}

      {status === 'ready' && shelfBooks.length > 0 && (
        <>
          <div
            role="radiogroup"
            aria-label="서재 필터"
            onKeyDown={handleKeyDown}
            className="mt-4 flex gap-1.5"
          >
            {FILTERS.map((item, index) => {
              const checked = item.value === filter;
              return (
                <button
                  key={item.value}
                  ref={(node) => {
                    radios.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setFilter(item.value)}
                  className={`min-h-11 rounded-full border px-[14px] text-[13px] ${
                    checked
                      ? 'border-dash-ink bg-dash-ink text-white'
                      : 'border-dash-line bg-white text-dash-muted'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 text-sm text-dash-muted">해당하는 책이 없어요</p>
          ) : (
            <ul
              aria-label="서재 책 목록"
              className="m-0 mt-5 grid list-none grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-6 p-0 mobile:grid-cols-3 mobile:gap-x-3"
            >
              {visible.map((book) => (
                <li key={book.book_id} className="min-w-0">
                  <Link to={bookPath(book.book_id)} aria-label={book.title} className="block">
                    <BookCover book={book} size="grid" />
                    <p className="m-0 mt-2 line-clamp-2 break-words text-sm font-semibold text-dash-ink">
                      {book.title}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-dash-muted">{book.progress?.percent}%</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
