import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loading from '../../components/common/Loading';
import Button from '../../components/common/Button';
import { useReadingSession } from '../../hooks/useReadingSession';
import SsabiPanel from '../../components/Ssabi/SsabiPanel';
import MobileReaderView from '../components/MobileReaderView';
import EdgeHandle from '../components/EdgeHandle';
import MobileSsabiSheet from '../components/MobileSsabiSheet';
import TocList from '../components/TocList';

export default function MobileReader() {
  const { bookId = '' } = useParams();
  return <MobileReadingSession key={bookId} />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p role="alert" className="text-[14px] text-brief-muted">
        {message}
      </p>
      <Button onClick={onRetry}>다시 시도</Button>
    </div>
  );
}

// FR-PRG-003 🚦 FR-BRF-001
function MobileReadingSession() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const { entryError, retryEntry, page, pageError, retryPage, currentPage, totalPages, chapters, moveTo, highlightedQuote, panelOpen, togglePanel, ssabiPanelProps } =
    useReadingSession(bookId);
  const [tocOpen, setTocOpen] = useState(false);

  let body: ReactNode;
  if (entryError) {
    body = <ErrorState message="읽기를 시작하지 못했습니다" onRetry={retryEntry} />;
  } else if (page && page.page_no === currentPage) {
    body = (
      <MobileReaderView
        content={page.content}
        currentPage={page.page_no}
        totalPages={totalPages}
        prevPage={page.prev_page}
        nextPage={page.next_page}
        onMove={moveTo}
        highlightedQuote={highlightedQuote}
        chapterStart={chapters.find((chapter) => chapter.start_page === page.page_no) ?? null}
        swipeDisabled={panelOpen}
      />
    );
  } else if (pageError) {
    body = <ErrorState message="페이지를 불러오지 못했습니다" onRetry={retryPage} />;
  } else {
    body = <Loading message={page ? '페이지를 불러오는 중' : '책을 펼치는 중'} />;
  }

  return (
    <div
      data-testid="mobile-reader"
      className="flex h-[100dvh] flex-col overflow-hidden bg-brief-page"
      style={{ paddingTop: 'env(safe-area-inset-top, var(--sat, 0px))' }}
    >
      <header className="flex h-14 shrink-0 items-center border-b border-brief-rule bg-brief-paper px-2">
        <button
          type="button"
          onClick={() => navigate('/', { viewTransition: true })}
          aria-label="뒤로 가기"
          className="flex size-11 items-center justify-center rounded-full text-brief-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 4.8 6.5 8 9.5 11.2" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1">{body}</div>
      <EdgeHandle side="left" label="목차" open={tocOpen} onToggle={() => setTocOpen((open) => !open)} />
      {tocOpen ? (
        <TocList
          chapters={chapters}
          currentPage={currentPage}
          onSelect={(startPage) => {
            moveTo(startPage);
            setTocOpen(false);
          }}
        />
      ) : null}
      <EdgeHandle side="right" label="싸비" open={panelOpen} onToggle={togglePanel} />
      <MobileSsabiSheet open={panelOpen}>
        <SsabiPanel key={currentPage} {...ssabiPanelProps} />
      </MobileSsabiSheet>
    </div>
  );
}
