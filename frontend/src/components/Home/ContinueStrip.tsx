import { Link } from 'react-router-dom';
import BookCover from '../common/BookCover';
import { bookPath } from '../../utils/routes';
import { resumeLabel } from '../../utils/resumeLabel';
import type { BookSummary } from '../../types';

// FR-BRF-001 FR-BRF-005
export default function ContinueStrip({
  book,
  busy,
  failed,
  onResume,
}: {
  book: BookSummary;
  busy: boolean;
  failed: boolean;
  onResume: () => void;
}) {
  return (
    <section aria-label="이어 읽기">
      <div className="flex items-center gap-3 rounded-dash-card border border-dash-line bg-white p-3 shadow-dash-soft">
        <Link
          to={bookPath(book.book_id)}
          aria-label={book.title}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <BookCover book={book} size="thumb" />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-bold text-dash-ink">{book.title}</p>
            {book.progress && <p className="m-0 mt-0.5 text-xs text-dash-muted">{book.progress.percent}%</p>}
          </div>
        </Link>
        <button
          type="button"
          onClick={onResume}
          disabled={busy}
          className="min-h-11 flex-none rounded-full border border-dash-ink bg-transparent px-[14px] text-xs font-bold text-dash-ink transition-colors hover:bg-dash-ink/5 active:bg-dash-ink/10 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {resumeLabel(book, busy)}
        </button>
      </div>
      {failed && (
        <p role="alert" className="m-0 mt-2 text-xs text-dash-ink">
          열지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
