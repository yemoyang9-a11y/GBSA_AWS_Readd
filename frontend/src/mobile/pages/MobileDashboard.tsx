import type { ReactNode } from 'react';
import Loading from '../../components/common/Loading';
import ProgressBar from '../../components/Reader/ProgressBar';
import TypographicCover from '../../components/common/TypographicCover';
import { ReaddMark } from '../../components/Layout/Header';
import { BOOK_INFO_CONTENT } from '../../data/bookInfoContent';
import { useDashboard } from '../../hooks/useDashboard';
import type { BookSummary } from '../../types';
import MobileShelf from '../components/MobileShelf';
import MobileBookInfoSheet from '../components/MobileBookInfoSheet';
import MobileErrorState from '../components/MobileErrorState';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="mobile-dashboard"
      data-mobile="true"
      className="min-h-[100dvh] bg-dash-paper font-dashSans text-dash-ink"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <header className="flex h-14 items-center border-b border-dash-line px-5">
        <span className="font-dashMono text-[22px] font-medium tracking-[-1px] text-dash-ink">
          RE<ReaddMark />
          <b className="font-medium">ADD</b>
        </span>
      </header>
      <main className="px-5 pb-10">
        <section className="pb-5 pt-7">
          <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">MY READING ROOM</p>
          <h1 className="mt-2 break-keep font-dashSerif text-[28px] font-semibold leading-tight tracking-[-.07em] text-dash-ink">
            오늘도, 이야기 속으로.
          </h1>
        </section>
        {children}
      </main>
    </div>
  );
}

// FR-BRW-001 FR-BRW-002 🚦 FR-BRF-005 🚦
function ContinueCard({
  book,
  onResume,
  busy,
  enterable,
  totalPages,
}: {
  book: BookSummary;
  onResume: () => void;
  busy: boolean;
  enterable: boolean;
  totalPages: number | null;
}) {
  const hasProgress = book.progress !== undefined;
  const ready = book.ssabi_ready;
  const caption = !ready ? '준비 중' : hasProgress ? 'CONTINUE READING' : '새로 시작하기';
  const buttonLabel = !ready ? '아직 준비 중입니다' : busy ? '여는 중' : hasProgress ? '이어서 읽기' : '읽기 시작';

  return (
    <section aria-live="polite" className="rounded-dash-panel border border-dash-line bg-white p-4 shadow-dash-soft">
      <div className="flex items-center gap-4">
        <span className="shrink-0 [&>div]:px-2">
          <TypographicCover size="row" title={book.title} author={book.author} coverUrl={book.cover_url} dimmed={!ready} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">{caption}</p>
          <h2 className="mt-1.5 break-keep font-dashSerif text-[22px] font-semibold leading-tight tracking-[-.05em] text-dash-ink">
            {book.title}
          </h2>
          <p className="mt-1 break-keep text-[13px] text-dash-muted">{book.author}</p>
        </div>
      </div>
      {ready && hasProgress ? (
        <div className="mt-4">
          <div className="flex justify-between text-[13px] text-[#555]">
            <span>{book.progress!.percent}% 완료</span>
            <span>{totalPages != null ? `${totalPages}쪽` : ''}</span>
          </div>
          <div className="mt-2">
            <ProgressBar percent={book.progress!.percent} tone="dash" size="md" />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onResume}
        disabled={!ready || busy || !enterable}
        className="mt-4 h-12 w-full rounded-full border border-dash-ink bg-transparent text-[15px] font-bold text-dash-ink active:bg-[rgba(31,31,31,0.1)] disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </section>
  );
}

export default function MobileDashboard() {
  const dash = useDashboard();

  if (dash.catalogError) {
    return (
      <div data-testid="mobile-dashboard" data-mobile="true" className="flex min-h-[100dvh] bg-dash-paper">
        <MobileErrorState message="서재를 불러오지 못했습니다" onRetry={dash.loadCatalog} />
      </div>
    );
  }

  if (!dash.books) return <Loading message="서재를 여는 중" />;

  if (!dash.selectedBook) {
    return (
      <Frame>
        <p className="py-16 text-center text-[13px] text-dash-muted">서재에 도서가 아직 없습니다</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <ContinueCard
        book={dash.selectedBook}
        onResume={() => void dash.handleResume()}
        busy={dash.enteringId === dash.selectedBook.book_id}
        enterable={dash.enterable}
        totalPages={dash.totalPages}
      />
      <MobileShelf
        books={dash.displayBooks}
        visibleBooks={dash.visibleBooks}
        selectedId={dash.selectedBook.book_id}
        onPreview={dash.previewBook}
        filter={dash.filter}
        onFilterChange={dash.handleFilterChange}
        emptyMessage={dash.emptyMessage}
        onInfo={dash.setInfoBook}
      />
      {dash.infoBook ? (
        <MobileBookInfoSheet
          book={dash.infoBook}
          content={BOOK_INFO_CONTENT[dash.infoBook.book_id]}
          onClose={() => dash.setInfoBook(null)}
        />
      ) : null}
    </Frame>
  );
}
