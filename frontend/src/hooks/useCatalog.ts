import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalog } from '../services/bookService';
import { resolveCoverUrl } from '../utils/coverOverrides';
import type { BookSummary } from '../types';

export interface Catalog {
  books: BookSummary[];
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
}

// FR-BRW-001 FR-BRF-005
export function useCatalog(): Catalog {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [status, setStatus] = useState<Catalog['status']>('loading');
  const latestRequest = useRef(0);

  const reload = useCallback(() => {
    const request = ++latestRequest.current;
    setStatus('loading');
    fetchCatalog()
      .then((response) => {
        if (request !== latestRequest.current) return;
        setBooks(
          response.books.map((book) => ({
            ...book,
            cover_url: resolveCoverUrl(book.book_id, book.cover_url) ?? '',
          }))
        );
        setStatus('ready');
      })
      .catch(() => {
        if (request !== latestRequest.current) return;
        setBooks([]);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      latestRequest.current += 1;
    };
  }, [reload]);

  return { books, status, reload };
}
