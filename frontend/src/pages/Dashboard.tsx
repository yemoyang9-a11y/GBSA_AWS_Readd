import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BookGrid from '../components/common/BookGrid';
import Button from '../components/common/Button';
import FilterTabs from '../components/common/FilterTabs';
import Loading from '../components/common/Loading';
import StatCard from '../components/common/StatCard';
import Header from '../components/Layout/Header';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

type Filter = 'reading' | 'done' | 'all';

/** 순서는 넓은 쪽 → 좁은 쪽. 기본 선택인 '전체'가 맨 앞에 온다 (2026-08-22 사용자 결정) */
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'done', label: '완독' },
  { id: 'reading', label: '읽는 중' },
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
 *    "완독"은 판정 데이터 자체가 없다. 그 사실을 숨기지 않되 `0` 으로도 쓰지 않는다 —
 *    0 은 "측정했더니 0권" 이라는 주장이라 없는 사실을 지어내는 셈이다. 통계는 `—`,
 *    완독 필터는 빈 목록 대신 그 이유를 문장으로 말한다 (크리틱 P0/P1, 2026-08-22).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  /**
   * 카탈로그 조회 실패 상태. 실패 시 무한 로딩 대신 재시도 UI를 보여준다 —
   * 크리틱 P0: 이전에는 `.catch` 가 없어 백엔드 장애 시 "불러오는 중"에서 영원히 멈췄다.
   * 여기는 앱의 유일한 진입점이라 복구 수단이 새로고침밖에 없었다 (실측 확인, 2026-08-22).
   */
  const [catalogError, setCatalogError] = useState(false);

  /** 진입 왕복 중인 도서. `null` 이 아니면 카드를 잠근다 — `enterBook` 중복 발신을 막는다 */
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

  const emptyMessage =
    filter === 'done'
      ? '완독 여부를 판정할 데이터가 아직 없습니다'
      : filter === 'reading'
        ? '읽던 도서가 아직 없습니다'
        : '서재에 도서가 아직 없습니다';

  async function handleSelect(book: BookSummary) {
    // 왕복이 끝나기 전에 다시 눌리면 `enterBook` 이 또 나간다. 그 호출은 seq 를 되돌리고
    // 서버 세션 판정을 다시 돌리므로 중복이 무해하지 않다 (크리틱 P1).
    if (enteringId) return;
    setEnteringId(book.book_id);
    try {
      const entry = await enterBook(book.book_id);
      navigate(routePathFor(book.book_id, entry), { state: { entry } });
    } catch {
      setEnteringId(null);
    }
  }

  if (catalogError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <p role="alert" className="text-[13px] text-muted">
          서재를 불러오지 못했습니다
        </p>
        <Button onClick={loadCatalog}>다시 시도</Button>
      </div>
    );
  }

  if (!books) return <Loading message="서재를 여는 중" />;

  return (
    <div className="min-h-full bg-canvas">
      <Header />

      <main className="mx-auto w-full max-w-page px-7 py-6">
        <div className="mb-6 flex max-w-stats gap-3">
          <div data-testid="stat-reading" className="flex flex-1">
            <StatCard value={readingCount} label="읽는 중" />
          </div>
          <div data-testid="stat-done" className="flex flex-1">
            {/* 판정 데이터가 없다 — `0` 은 "0권 완독" 이라는 주장이 되므로 미측정으로 표시한다 */}
            <StatCard value="—" label="완독" />
          </div>
        </div>

        <div className="mb-6">
          <FilterTabs tabs={FILTERS} active={filter} onChange={setFilter} />
        </div>

        {enteringId ? (
          <div role="status" className="mb-4 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-line border-t-ink"
            />
            <span className="text-[13px] text-muted">책을 여는 중</span>
          </div>
        ) : null}

        <BookGrid
          books={visible}
          onSelect={handleSelect}
          emptyMessage={emptyMessage}
          busyId={enteringId}
        />
      </main>
    </div>
  );
}
