import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loading from '../../components/common/Loading';
import { useReadingSession } from '../../hooks/useReadingSession';
import SsabiPanel from '../../components/Ssabi/SsabiPanel';
import SsabiToggleButton from '../../components/common/SsabiToggleButton';
import MobileReaderView from '../components/MobileReaderView';
import EdgeHandle from '../components/EdgeHandle';
import MobileSsabiSheet from '../components/MobileSsabiSheet';
import TocList from '../components/TocList';
import MobileErrorState from '../components/MobileErrorState';
import { useVisualViewport } from '../useVisualViewport';

export default function MobileReader() {
  const { bookId = '' } = useParams();
  return <MobileReadingSession key={bookId} />;
}

// FR-PRG-003 🚦 FR-BRF-001
function MobileReadingSession() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const { entryError, retryEntry, page, pageError, retryPage, currentPage, totalPages, chapters, moveTo, highlightedQuote, panelOpen, togglePanel, ssabiPanelProps, quote } =
    useReadingSession(bookId);
  const [tocOpen, setTocOpen] = useState(false);
  const viewport = useVisualViewport();

  useEffect(() => {
    if (panelOpen) setTocOpen(false);
  }, [panelOpen]);

  let body: ReactNode;
  if (entryError) {
    body = <MobileErrorState message="읽기를 시작하지 못했습니다" onRetry={retryEntry} />;
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
        onQuote={quote}
      />
    );
  } else if (pageError) {
    body = <MobileErrorState message="페이지를 불러오지 못했습니다" onRetry={retryPage} />;
  } else {
    body = <Loading message={page ? '페이지를 불러오는 중' : '책을 펼치는 중'} />;
  }

  return (
    <div
      data-testid="mobile-reader"
      className="flex h-[100dvh] flex-col overflow-hidden bg-brief-page"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <header className="flex h-14 shrink-0 items-center border-b border-brief-rule bg-brief-paper px-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="뒤로 가기"
          className="flex size-11 items-center justify-center rounded-full border border-brief-rule bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
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
      <EdgeHandle side="left" label="목차" controls="toc-panel" open={tocOpen} onToggle={() => setTocOpen((open) => !open)} hidden={panelOpen} />
      {tocOpen && !panelOpen ? (
        <TocList
          chapters={chapters}
          currentPage={currentPage}
          onSelect={(startPage) => {
            moveTo(startPage);
            setTocOpen(false);
          }}
        />
      ) : null}
      <EdgeHandle side="right" label="싸비" controls="ssabi-panel" open={panelOpen} onToggle={togglePanel} hidden={panelOpen || viewport.keyboardOpen} />
      <MobileSsabiSheet open={panelOpen} height={viewport.height} offsetTop={viewport.offsetTop} keyboardOpen={viewport.keyboardOpen}>
        {viewport.keyboardOpen ? null : (
          <div className="absolute right-6 z-10" style={{ top: 'calc(var(--safe-top) + 16px)' }}>
            <SsabiToggleButton open={panelOpen} onToggle={togglePanel} />
          </div>
        )}
        <SsabiPanel key={currentPage} {...ssabiPanelProps} compactHeader={viewport.keyboardOpen} requireTextToSend />
      </MobileSsabiSheet>
    </div>
  );
}
