import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import ContinueReadingHero from '../components/Dashboard/ContinueReadingHero';
import ShelfList, { type DashFilter } from '../components/Dashboard/ShelfList';
import WelcomeBanner from '../components/Dashboard/WelcomeBanner';
import Loading from '../components/common/Loading';
import Header from '../components/Layout/Header';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

/**
 * 대시보드(서재) — 대시보드 재설계 시안 (2026-08-23)
 *
 * "이어읽기 히어로 + 책 목록" 구조. 그리드+통계 카드 구조를 대체한다(2026-08-20 초판).
 * 히어로는 선택된 한 권을 보여주고, 목록 행을 클릭하면 히어로의 미리보기만 바뀐다 —
 * 실제 진입(POST /entry)은 히어로의 "이어서 읽기" 버튼만 한다.
 *
 * 실제 카탈로그가 1권뿐이면(발표 전) `ShelfList`가 스스로 숨는다 — 이 화면도 그 경우엔
 * 히어로 하나만 남는다(2026-08-22 크리틱 "도서 1권 문제"의 결론).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [filter, setFilter] = useState<DashFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const loadCatalog = useCallback(() => {
    setCatalogError(false);
    void fetchCatalog()
      .then((response) => setBooks(response.books))
      .catch(() => setCatalogError(true));
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedBook = useMemo(() => {
    if (!books || books.length === 0) return null;
    return books.find((book) => book.book_id === selectedId) ?? books[0];
  }, [books, selectedId]);

  const visibleBooks = useMemo(() => {
    if (!books) return [];
    if (filter === 'reading') return books.filter((book) => book.progress);
    if (filter === 'done') return []; // 완독 판정 데이터 없음 (스펙 §7 #1)
    return books;
  }, [books, filter]);

  const emptyMessage =
    filter === 'done'
      ? '완독 여부를 판정할 데이터가 아직 없습니다'
      : filter === 'reading'
        ? '읽던 도서가 아직 없습니다'
        : '서재에 도서가 아직 없습니다';

  async function handleResume() {
    if (!selectedBook || enteringId) return;
    setEnteringId(selectedBook.book_id);
    try {
      const entry = await enterBook(selectedBook.book_id);
      navigate(routePathFor(selectedBook.book_id, entry), { state: { entry } });
    } catch {
      setEnteringId(null);
    }
  }

  if (catalogError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-dash-paper px-6 text-center">
        <p role="alert" className="text-[13px] text-dash-muted">
          서재를 불러오지 못했습니다
        </p>
        <Button onClick={loadCatalog}>다시 시도</Button>
      </div>
    );
  }

  if (!books) return <Loading message="서재를 여는 중" />;

  if (!selectedBook) {
    return (
      <div className="min-h-full bg-dash-paper">
        <Header />
        <main className="mx-auto w-full max-w-page px-[38px] py-6">
          <WelcomeBanner />
          <p className="py-16 text-center text-[13px] text-dash-muted">
            서재에 도서가 아직 없습니다
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-dash-paper font-dashSans">
      <Header />

      <main className="mx-auto w-full max-w-page px-[38px] py-6">
        <WelcomeBanner />

        <ContinueReadingHero
          book={selectedBook}
          onResume={handleResume}
          busy={enteringId === selectedBook.book_id}
        />

        <ShelfList
          books={books}
          visibleBooks={visibleBooks}
          selectedId={selectedBook.book_id}
          onPreview={(book) => setSelectedId(book.book_id)}
          filter={filter}
          onFilterChange={setFilter}
          emptyMessage={emptyMessage}
        />
      </main>
    </div>
  );
}
