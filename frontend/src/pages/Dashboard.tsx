import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BookGrid from '../components/common/BookGrid';
import Loading from '../components/common/Loading';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

/**
 * 대시보드 (카탈로그) — S2
 *
 * 표지 그리드 · 읽던 도서만 진도 바 + % · 미완비 도서는 클릭 불가 (FR-BRW-001·002 🚦).
 * 도서를 고르면 POST /entry 응답의 route 를 그대로 따라 이동한다 — 브리핑/읽기 판정을
 * 클라이언트가 하지 않는다 (FR-BRF-001, 자가 검증 17번).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);

  useEffect(() => {
    void fetchCatalog().then((response) => setBooks(response.books));
  }, []);

  async function handleSelect(book: BookSummary) {
    const entry = await enterBook(book.book_id);
    navigate(routePathFor(book.book_id, entry), { state: { entry } });
  }

  if (!books) return <Loading />;

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">읽을 책</h1>
      <BookGrid books={books} onSelect={handleSelect} />
    </main>
  );
}
