import type { BookSummary } from '../types';

// FR-BRW-001
function compareNewest(a: BookSummary, b: BookSummary): number {
  if (a.registered_at !== b.registered_at) return a.registered_at < b.registered_at ? 1 : -1;
  return a.title.localeCompare(b.title, 'ko');
}

// FR-BRF-001
export function pickContinueBook(books: BookSummary[]): BookSummary | null {
  let picked: BookSummary | null = null;
  for (const book of books) {
    if (!book.progress || !book.ssabi_ready) continue;
    if (picked === null || book.progress.last_read_at > picked.progress!.last_read_at) picked = book;
  }
  return picked;
}

// FR-BRW-001
export function newestFirst(books: BookSummary[]): BookSummary[] {
  return [...books].sort(compareNewest);
}

// FR-BRW-001
export function genreRows(books: BookSummary[]): { genre: string; books: BookSummary[] }[] {
  const byGenre = new Map<string, BookSummary[]>();
  for (const book of books) {
    if (!book.genre) continue;
    byGenre.set(book.genre, [...(byGenre.get(book.genre) ?? []), book]);
  }
  return [...byGenre.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([genre, rowBooks]) => ({ genre, books: newestFirst(rowBooks) }));
}
