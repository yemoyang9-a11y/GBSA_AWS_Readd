import TypographicCover from './TypographicCover';
import type { BookSummary } from '../../types';

const FRAME_WIDTH = {
  thumb: 'w-[44px] flex-none',
  row: 'w-[84px] flex-none',
  grid: 'w-full',
  detail: 'w-[118px] flex-none',
} as const;

export default function BookCover({
  book,
  size,
}: {
  book: Pick<BookSummary, 'book_id' | 'title' | 'author' | 'cover_url'>;
  size: 'thumb' | 'row' | 'grid' | 'detail';
}) {
  return (
    <div
      className={`${FRAME_WIDTH[size]} aspect-[2/3] overflow-hidden rounded-dash-row-cover [&>div]:!h-full [&>div]:!w-full`}
    >
      {book.cover_url ? (
        <img src={book.cover_url} alt={`${book.title} 표지`} className="h-full w-full object-cover" />
      ) : (
        <TypographicCover
          title={book.title}
          author={book.author}
          size={size === 'detail' ? 'hero' : 'hero-compact'}
        />
      )}
    </div>
  );
}
