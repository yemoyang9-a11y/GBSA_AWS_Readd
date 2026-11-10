import Button from '../components/common/Button';
import BookInfoModal from '../components/Dashboard/BookInfoModal';
import ContinueReadingHero from '../components/Dashboard/ContinueReadingHero';
import ShelfList from '../components/Dashboard/ShelfList';
import WelcomeBanner from '../components/Dashboard/WelcomeBanner';
import Loading from '../components/common/Loading';
import Header from '../components/Layout/Header';
import { BOOK_INFO_CONTENT } from '../data/bookInfoContent';
import { useDashboard } from '../hooks/useDashboard';

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

export default function Dashboard() {
  const {
    books,
    displayBooks,
    visibleBooks,
    selectedBook,
    previewBook,
    filter,
    handleFilterChange,
    emptyMessage,
    enterable,
    enteringId,
    totalPages,
    handleResume,
    catalogError,
    loadCatalog,
    infoBook,
    setInfoBook,
  } = useDashboard();

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
          totalPages={totalPages}
        />

        <ShelfList
          books={displayBooks}
          visibleBooks={visibleBooks}
          selectedId={selectedBook.book_id}
          onPreview={previewBook}
          filter={filter}
          onFilterChange={handleFilterChange}
          emptyMessage={emptyMessage}
          onInfo={setInfoBook}
        />
      </main>

      {infoBook ? (
        <BookInfoModal
          book={infoBook}
          content={BOOK_INFO_CONTENT[infoBook.book_id]}
          onClose={() => setInfoBook(null)}
        />
      ) : null}
    </div>
  );
}
