import { useId } from 'react';
import { Link } from 'react-router-dom';
import BookCover from '../common/BookCover';
import { bookPath } from '../../utils/routes';
import type { BookSummary } from '../../types';

// FR-BRW-001
export default function BookRow({ title, books }: { title: string; books: BookSummary[] }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-dashSerif text-lg font-semibold text-dash-ink">
        {title}
      </h2>
      <ul className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-6 p-0 mobile:-mx-4 mobile:flex mobile:gap-3 mobile:overflow-x-auto mobile:px-4 mobile:pb-1">
        {books.map((book) => (
          <li key={book.book_id} className="mobile:w-[104px] mobile:flex-none">
            <Link to={bookPath(book.book_id)} aria-label={book.title} className="block">
              <BookCover book={book} size="grid" />
              <p className="m-0 mt-2 line-clamp-2 text-sm font-semibold text-dash-ink">{book.title}</p>
              <p className="m-0 mt-0.5 truncate text-xs text-dash-muted">{book.author}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
