import BookRow from '../components/Home/BookRow';
import ContinueStrip from '../components/Home/ContinueStrip';
import LoginGate from '../components/Auth/LoginGate';
import { useCatalog } from '../hooks/useCatalog';
import { useEnterBook } from '../hooks/useEnterBook';
import { genreRows, newestFirst, pickContinueBook } from '../utils/homeRows';
import { listableBooks } from '../utils/listableBooks';

// FR-BRW-001 FR-BRF-001 FR-SPL-005
export default function Home() {
  const { books: catalogBooks, status, reload } = useCatalog();
  const { enter, busyId, failed, loginBookId, closeLogin } = useEnterBook();
  // FR-BRW-002 🚦 R12
  const books = listableBooks(catalogBooks);

  const continueBook = pickContinueBook(books);
  const genres = genreRows(books);

  return (
    <div className="mx-auto w-full max-w-page px-7 py-8 mobile:px-4 mobile:py-4">
      <h1 className="sr-only">홈</h1>

      {status === 'loading' && (
        <p role="status" className="text-sm text-dash-muted">
          불러오는 중
        </p>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-start gap-3">
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

      {status === 'ready' && (
        <div className="flex flex-col gap-8">
          {continueBook && (
            <ContinueStrip
              book={continueBook}
              busy={busyId === continueBook.book_id}
              failed={failed}
              onResume={() => void enter(continueBook.book_id)}
            />
          )}
          <BookRow title="신작" books={newestFirst(books)} />
          {genres.map((row) => (
            <BookRow key={row.genre} title={row.genre} books={row.books} />
          ))}
        </div>
      )}
      {loginBookId ? <LoginGate bookId={loginBookId} onClose={closeLogin} /> : null}
    </div>
  );
}
