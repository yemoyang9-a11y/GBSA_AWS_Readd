import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { fetchBookInfo } from '../services/bookService';
import { BOOK_INFO_CONTENT } from '../data/bookInfoContent';
import { useCatalog } from './useCatalog';
import type { BookInfoResponse, BookSummary, ChapterSummary } from '../types';

export interface BookDetail {
  status: 'loading' | 'ready' | 'not-ready' | 'not-found' | 'error';
  book: BookSummary | null;
  introduction: string | null;
  background: string[];
  chapters: ChapterSummary[];
  retry: () => void;
}

interface InfoRequest {
  bookId: string;
  fetchable: boolean;
  attempt: number;
  generation: number;
}

type InfoResult =
  | { generation: number; status: 'ready'; info: BookInfoResponse }
  | { generation: number; status: 'not-ready' | 'not-found' | 'error' };

function failureStatus(error: unknown): 'not-ready' | 'not-found' | 'error' {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) return 'not-ready';
  if (status === 404) return 'not-found';
  return 'error';
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// FR-BRW-003 FR-ADM-005 FR-BGK-002
export function useBookDetail(bookId: string): BookDetail {
  const catalog = useCatalog();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<InfoResult | null>(null);

  const book = catalog.status === 'ready' ? (catalog.books.find((b) => b.book_id === bookId) ?? null) : null;
  const shouldFetchInfo = book !== null && book.ssabi_ready;

  const [request, setRequest] = useState<InfoRequest>({
    bookId,
    fetchable: shouldFetchInfo,
    attempt,
    generation: 0,
  });
  let currentRequest = request;
  if (request.bookId !== bookId || request.fetchable !== shouldFetchInfo || request.attempt !== attempt) {
    currentRequest = { bookId, fetchable: shouldFetchInfo, attempt, generation: request.generation + 1 };
    setRequest(currentRequest);
  }
  const { generation } = currentRequest;

  useEffect(() => {
    if (!shouldFetchInfo) return;
    let active = true;
    fetchBookInfo(bookId)
      .then((info) => {
        if (active) setResult({ generation, status: 'ready', info });
      })
      .catch((error: unknown) => {
        if (active) setResult({ generation, status: failureStatus(error) });
      });
    return () => {
      active = false;
    };
  }, [bookId, shouldFetchInfo, generation]);

  const { reload } = catalog;
  const catalogFailed = catalog.status === 'error';
  const retry = useCallback(() => {
    if (catalogFailed) reload();
    else setAttempt((n) => n + 1);
  }, [catalogFailed, reload]);

  const current = result?.generation === generation ? result : null;
  const info = current?.status === 'ready' ? current.info : null;
  const fallback = BOOK_INFO_CONTENT[bookId];

  let status: BookDetail['status'];
  if (catalog.status === 'loading') status = 'loading';
  else if (catalogFailed) status = 'error';
  else if (!book) status = 'not-found';
  else if (!book.ssabi_ready) status = 'not-ready';
  else status = current?.status ?? 'loading';

  const background = info ? paragraphs(info.background) : [];

  return {
    status,
    book,
    introduction: info?.introduction || fallback?.intro || null,
    background: background.length > 0 ? background : (fallback?.background ?? []),
    chapters: info?.chapters ?? [],
    retry,
  };
}
