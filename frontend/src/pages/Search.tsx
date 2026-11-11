import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BookCover from '../components/common/BookCover';
import { useCatalog } from '../hooks/useCatalog';
import { listableBooks } from '../utils/listableBooks';
import { searchBooks } from '../utils/searchBooks';
import { bookPath } from '../utils/routes';

// FR-BRW-001 FR-SPL-005
export default function Search() {
  const { books, status, reload } = useCatalog();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setQuery(next);
    setParams(next ? { q: next } : {}, { replace: true });
  }

  // FR-BRW-002 🚦 R12
  const results = searchBooks(listableBooks(books), query);

  return (
    <div className="mx-auto w-full max-w-page px-7 py-8 mobile:px-4 mobile:py-4">
      <h1 className="m-0 font-dashSerif text-xl font-bold text-dash-ink">검색</h1>

      <label htmlFor="book-search" className="mt-4 block text-xs text-dash-muted">
        작품, 작가 검색
      </label>
      <input
        id="book-search"
        type="search"
        value={query}
        onChange={handleChange}
        placeholder="작품, 작가 이름"
        autoComplete="off"
        className="mt-1.5 box-border min-h-11 w-full rounded-full border border-dash-line bg-white px-4 text-base text-dash-ink placeholder:text-dash-muted"
      />

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

      {status === 'ready' && results.length === 0 && (
        <p className="mt-6 text-sm text-dash-muted">찾는 작품이 없습니다</p>
      )}

      {status === 'ready' && results.length > 0 && (
        <ul aria-label="검색 결과" className="m-0 mt-4 flex list-none flex-col p-0">
          {results.map((book) => (
            <li key={book.book_id}>
              <Link
                to={bookPath(book.book_id)}
                aria-label={`${book.title}, ${book.author}`}
                className="flex min-h-11 items-center gap-3 border-b border-dash-line py-3"
              >
                <BookCover book={book} size="row" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 line-clamp-2 text-sm font-semibold text-dash-ink">{book.title}</p>
                  <p className="m-0 mt-0.5 truncate text-xs text-dash-muted">{book.author}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
