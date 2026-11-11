import type { BookSummary } from '../types';

// FR-BRW-002 🚦 R12
export function listableBooks(books: BookSummary[]): BookSummary[] {
  return books.filter((book) => book.ssabi_ready);
}
