import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import ContinueReadingHero from '../components/Dashboard/ContinueReadingHero';
import ShelfList, { type DashFilter } from '../components/Dashboard/ShelfList';
import WelcomeBanner from '../components/Dashboard/WelcomeBanner';
import Loading from '../components/common/Loading';
import Header from '../components/Layout/Header';
import { DEMO_SHELF_BOOKS } from '../data/demoShelfBooks';
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
 * **Ruling 정정(2026-08-23, 사용자 요청)** — 원래는 실제 카탈로그가 1권뿐이면
 * `ShelfList`를 통째로 숨겼다(2026-08-22 크리틱 "도서 1권 문제"의 결론). 그런데
 * 데모에서는 시안의 "내 서재" 구성 자체를 보여줘야 해서, 실제 도서 뒤에 정적 데모
 * 항목(`DEMO_SHELF_BOOKS`)을 이어붙여 목록이 항상 3권으로 보이게 한다. 데모 항목은
 * 미리보기(히어로 전환)는 되지만 실제 카탈로그에 없으므로 진입은 막는다 — 이 화면
 * 아래 `enterable` 판정이 그 경계선이다. 실제 도서가 늘면 데모 항목과 나란히 보인다.
 */

/**
 * 표지 override(2026-08-23, 사용자 제공) — `GET /books`의 cover_url이 비어 있을 때만
 * 화면에서 대신 채운다. 서버 응답을 고치는 게 아니라 표시만 바꾸는 것이라 지어낸 데이터는
 * 아니다 — R1 파이프라인이 실제 cover_url을 채워주면 이 표는 지운다.
 */
const COVER_OVERRIDES: Record<string, string> = {
  takryu: '/covers/takryu.jpg',
};

function applyDashFilter(list: BookSummary[], filter: DashFilter): BookSummary[] {
  if (filter === 'reading') return list.filter((book) => book.progress);
  if (filter === 'done') return []; // 완독 판정 데이터 없음 (스펙 §7 #1)
  return list;
}
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

  // 실제 도서 뒤에 데모 항목을 이어붙인다 — 실제 도서가 하나도 없을 때는 붙이지 않는다
  // (빈 서재 화면 자체가 데모 항목 때문에 가려지면 안 된다)
  const displayBooks = useMemo(() => {
    if (!books || books.length === 0) return books ?? [];
    const realBooksWithCover = books.map((book) =>
      !book.cover_url && COVER_OVERRIDES[book.book_id]
        ? { ...book, cover_url: COVER_OVERRIDES[book.book_id] }
        : book
    );
    return [...realBooksWithCover, ...DEMO_SHELF_BOOKS];
  }, [books]);

  const selectedBook = useMemo(() => {
    if (displayBooks.length === 0) return null;
    return displayBooks.find((book) => book.book_id === selectedId) ?? displayBooks[0];
  }, [displayBooks, selectedId]);

  // 실제 카탈로그에 있는 책만 진입할 수 있다 — 데모 항목은 서버에 없어 POST /entry 를
  // 보낼 대상이 없다 (2026-08-23 사용자 요청)
  const enterable = useMemo(
    () => (books ?? []).some((book) => book.book_id === selectedBook?.book_id),
    [books, selectedBook]
  );

  const visibleBooks = useMemo(() => applyDashFilter(displayBooks, filter), [displayBooks, filter]);

  /**
   * 필터를 바꿨을 때 히어로가 걸러진 책을 계속 보여주면 안 된다 — "완독"을 눌렀는데
   * 아직 다 안 읽은 책이 히어로에 남아 있는 게 그 증상이었다(2026-08-23 사용자 제보).
   * 히어로는 필터 자체와는 무관하게 동작하지만(미리보기 목적), 선택된 책이 새 필터의
   * 목록에서 사라지면 기본값(첫 번째 책)으로 되돌린다.
   */
  function handleFilterChange(next: DashFilter) {
    setFilter(next);
    const nextVisible = applyDashFilter(displayBooks, next);
    if (selectedBook && !nextVisible.some((book) => book.book_id === selectedBook.book_id)) {
      setSelectedId(null);
    }
  }

  const emptyMessage =
    filter === 'done'
      ? '완독 여부를 판정할 데이터가 아직 없습니다'
      : filter === 'reading'
        ? '읽던 도서가 아직 없습니다'
        : '서재에 도서가 아직 없습니다';

  async function handleResume() {
    if (!selectedBook || enteringId || !enterable) return;
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
          enterable={enterable}
        />

        <ShelfList
          books={displayBooks}
          visibleBooks={visibleBooks}
          selectedId={selectedBook.book_id}
          onPreview={(book) => setSelectedId(book.book_id)}
          filter={filter}
          onFilterChange={handleFilterChange}
          emptyMessage={emptyMessage}
        />
      </main>
    </div>
  );
}
