import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BookGrid from '../components/common/BookGrid';
import FilterTabs from '../components/common/FilterTabs';
import Loading from '../components/common/Loading';
import StatCard from '../components/common/StatCard';
import Header from '../components/Layout/Header';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

type Filter = 'reading' | 'done' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'reading', label: '읽는 중' },
  { id: 'done', label: '완독' },
  { id: 'all', label: '전체' },
];

/**
 * 대시보드 (카탈로그) — S2
 *
 * 표지 그리드 · 읽던 도서만 진도 바 + % · 미완비 도서는 클릭 불가 (FR-BRW-001·002 🚦).
 * 도서를 고르면 POST /entry 응답의 route 를 그대로 따라 이동한다 — 브리핑/읽기 판정을
 * 클라이언트가 하지 않는다 (FR-BRF-001, 자가 검증 17번).
 *
 * ⚠️ 통계·필터는 시안에 있으나 API 에 대응 필드가 없다 (스펙 §7 #1·#2).
 *    카탈로그 응답에서 프론트가 센다 — `progress` 유무로 "읽는 중"을 가른다.
 *    이건 **목록 길이 세기**이지 기준점 파생 계산이 아니므로 절대 규칙 2번과 무관하다.
 *    "완독"은 판정 데이터 자체가 없어 항상 0이며, 그 사실을 숨기지 않는다.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void fetchCatalog().then((response) => setBooks(response.books));
  }, []);

  const readingCount = useMemo(
    () => (books ?? []).filter((book) => book.progress).length,
    [books]
  );

  const visible = useMemo(() => {
    if (!books) return [];
    if (filter === 'reading') return books.filter((book) => book.progress);
    if (filter === 'done') return []; // 완독 판정 데이터 없음 (스펙 §7 #1)
    return books;
  }, [books, filter]);

  async function handleSelect(book: BookSummary) {
    const entry = await enterBook(book.book_id);
    navigate(routePathFor(book.book_id, entry), { state: { entry } });
  }

  if (!books) return <Loading />;

  return (
    <div className="min-h-full bg-canvas">
      <Header subtitle="오늘도 나만의 페이스로 활자를 마주합니다." />

      <main className="px-7 py-6">
        <div className="mb-6 flex gap-3">
          <div data-testid="stat-reading" className="flex flex-1">
            <StatCard value={readingCount} label="읽는 중" />
          </div>
          <div data-testid="stat-done" className="flex flex-1">
            <StatCard value={0} label="완독" />
          </div>
        </div>

        <div className="mb-6">
          <FilterTabs tabs={FILTERS} active={filter} onChange={setFilter} />
        </div>

        <BookGrid books={visible} onSelect={handleSelect} />
      </main>
    </div>
  );
}
