import { useState } from 'react';
import { highlightContent } from '../../components/Reader/ReaderView';
import type { ChapterSummary } from '../../types';
import { useSwipePager } from '../gestures/useSwipePager';
import { useQuoteSelection } from '../../hooks/useQuoteSelection';
import QuoteAskButton from './QuoteAskButton';

// FR-PRG-001 🚦 FR-PRG-003 🚦
export default function MobileReaderView({
  content,
  currentPage,
  totalPages,
  prevPage,
  nextPage,
  onMove,
  highlightedQuote,
  chapterStart,
  swipeDisabled,
  onQuote,
}: {
  content: string;
  currentPage: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
  onMove: (page: number) => void;
  highlightedQuote: string | null;
  chapterStart: ChapterSummary | null;
  swipeDisabled: boolean;
  onQuote: (text: string) => void;
}) {
  const [inputValue, setInputValue] = useState(String(currentPage));

  if (String(currentPage) !== inputValue && document.activeElement?.tagName !== 'INPUT') {
    setInputValue(String(currentPage));
  }

  function commit() {
    const n = parseInt(inputValue, 10);
    if (isNaN(n)) {
      setInputValue(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(totalPages, n));
    setInputValue(String(clamped));
    if (clamped !== currentPage) onMove(clamped);
  }

  const { targetRef, bind } = useSwipePager<HTMLElement>({
    hasPrev: prevPage !== null,
    hasNext: nextPage !== null,
    onNext: () => nextPage !== null && onMove(nextPage),
    onPrev: () => prevPage !== null && onMove(prevPage),
    disabled: swipeDisabled,
  });

  const { containerRef, popover, clearPopover } = useQuoteSelection<HTMLElement>();

  function setArticleRef(el: HTMLElement | null) {
    (targetRef as { current: HTMLElement | null }).current = el;
    (containerRef as { current: HTMLElement | null }).current = el;
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-brief-page">
      {popover ? (
        <QuoteAskButton
          popover={popover}
          onAsk={() => {
            onQuote(popover.text);
            document.getSelection()?.removeAllRanges();
            clearPopover();
          }}
        />
      ) : null}
      <div
        data-testid="swipe-surface"
        className="brief-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ touchAction: 'pan-y' }}
        {...bind}
      >
        <article
          ref={setArticleRef}
          role="article"
          className="mx-auto w-full whitespace-pre-wrap px-6 pb-10 pt-8 font-dashSerif text-[18px] leading-[2] text-brief-ink"
        >
          {chapterStart ? (
            <header className="mb-8 whitespace-normal">
              <p className="mb-1.5 font-dashSans text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5c6b47]">
                제 {chapterStart.chapter_no}장
              </p>
              <h2 className="font-dashSerif text-[19px] font-bold text-brief-ink">{chapterStart.title}</h2>
            </header>
          ) : null}
          {highlightContent(content, highlightedQuote)}
        </article>
      </div>

      <nav
        className="flex shrink-0 items-center justify-between border-t border-brief-rule px-3 pt-1 font-dashSans text-[14px] text-brief-muted"
        style={{ paddingBottom: 'max(4px, var(--safe-bottom))' }}
      >
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="min-h-11 min-w-11 px-2 disabled:opacity-40"
        >
          이전 페이지
        </button>

        <div className="flex items-baseline gap-1.5 font-dashMono font-medium text-brief-ink">
          <input
            type="text"
            inputMode="numeric"
            aria-label="페이지로 이동"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={commit}
            className="min-h-11 min-w-11 w-[4ch] border-0 border-b border-dashed border-brief-rule bg-transparent text-center text-[16px] text-inherit outline-none focus:border-b-[1.5px] focus:border-solid focus:border-brief-accent focus:bg-brief-accent-soft"
          />
          <span className="text-[14px] text-brief-muted">/ {totalPages}</span>
        </div>

        <button
          type="button"
          disabled={nextPage === null}
          onClick={() => nextPage !== null && onMove(nextPage)}
          className="min-h-11 min-w-11 px-2 disabled:opacity-40"
        >
          다음 페이지
        </button>
      </nav>
    </main>
  );
}
