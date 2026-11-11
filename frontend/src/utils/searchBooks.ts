import type { BookSummary } from '../types';

// FR-BRW-001
export function searchBooks(books: BookSummary[], query: string): BookSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return books;
  return books.filter(
    (book) => book.title.toLowerCase().includes(needle) || book.author.toLowerCase().includes(needle)
  );
}
