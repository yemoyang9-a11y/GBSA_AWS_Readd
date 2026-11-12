import { useEffect, useRef, useState } from 'react';
import { highlightContent } from '../../components/Reader/ReaderView';
import type { ChapterSummary } from '../../types';
import { useSwipePager } from '../gestures/useSwipePager';
import { useQuoteSelection } from '../../hooks/useQuoteSelection';
import QuoteAskButton from './QuoteAskButton';
import { DEFAULT_READER_PREFS, READER_THEMES, type ReaderPrefs } from '../../hooks/useReaderPrefs';

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 10;
const NAV_HEIGHT = '49px';
export const CHROME_FADE = 'transition-[opacity,visibility] duration-200 motion-reduce:transition-none';

export function chromeProps(hidden: boolean) {
  return {
    'data-reader-chrome': '',
    'aria-hidden': hidden || undefined,
    ref: (el: HTMLElement | null) => el?.toggleAttribute('inert', hidden),
  };
}

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
  prefs = DEFAULT_READER_PREFS,
  insetTop,
  chromeHidden = false,
  canToggleChrome = false,
  onToggleChrome,
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
  prefs?: ReaderPrefs;
  insetTop: string;
  chromeHidden?: boolean;
  canToggleChrome?: boolean;
  onToggleChrome?: () => void;
}) {
  const theme = READER_THEMES[prefs.theme];
  const darkInk = prefs.theme === 'dark' ? { color: theme.color } : undefined;
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
    if (totalPages <= 0) {
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
  const navRef = useRef<HTMLElement>(null);
  const clearPopoverRef = useRef(clearPopover);
  clearPopoverRef.current = clearPopover;

  useEffect(() => {
    let down: { x: number; y: number; t: number; onAsk: boolean } | null = null;
    function onDown(e: PointerEvent) {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), onAsk: !!(e.target as Element).closest?.('[data-quote-ask]') };
    }
    function onUp(e: PointerEvent) {
      const start = down;
      down = null;
      if (!start || start.onAsk) return;
      const quickTap = performance.now() - start.t < TAP_MAX_MS && Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_MAX_MOVE;
      const selection = document.getSelection();
      const article = (containerRef as { current: HTMLElement | null }).current;
      if (!quickTap || !selection?.toString() || !selection.anchorNode || !article?.contains(selection.anchorNode)) return;
      document.getSelection()?.removeAllRanges();
      clearPopoverRef.current();
    }
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
    };
  }, [containerRef]);
  const liveSelectionRef = useRef('');

  useEffect(() => {
    function track() {
      const selection = document.getSelection();
      const text = selection?.toString().trim() ?? '';
      const article = (containerRef as { current: HTMLElement | null }).current;
      if (text && selection && selection.rangeCount > 0 && article?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        liveSelectionRef.current = text;
      }
    }
    document.addEventListener('selectionchange', track);
    return () => document.removeEventListener('selectionchange', track);
  }, [containerRef]);

  // FR-PRG-001
  const tapRef = useRef<{ x: number; y: number; t: number; hadSelection: boolean; moved: boolean } | null>(null);
  const surfaceBind = {
    ...bind,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      tapRef.current = e.isPrimary
        ? { x: e.clientX, y: e.clientY, t: performance.now(), hadSelection: (document.getSelection()?.toString() ?? '') !== '', moved: false }
        : null;
      bind.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const start = tapRef.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_MAX_MOVE) start.moved = true;
      bind.onPointerMove(e);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const start = tapRef.current;
      tapRef.current = null;
      bind.onPointerUp(e);
      if (!start || start.hadSelection || start.moved || !canToggleChrome) return;
      const quickTap = performance.now() - start.t < TAP_MAX_MS && Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_MAX_MOVE;
      if (!quickTap || (e.target as Element).closest?.('a, button, input, select, textarea, [data-quote-ask]')) return;
      onToggleChrome?.();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      tapRef.current = null;
      bind.onPointerCancel(e);
    },
  };

  const navChrome = chromeProps(chromeHidden);

  function setArticleRef(el: HTMLElement | null) {
    (targetRef as { current: HTMLElement | null }).current = el;
    (containerRef as { current: HTMLElement | null }).current = el;
  }

  return (
    <main className="relative h-full min-h-0 bg-brief-page" style={{ background: theme.background }}>
      {popover ? (
        <QuoteAskButton
          popover={popover}
          limitBottom={navRef.current?.getBoundingClientRect().top ?? window.innerHeight}
          onAsk={() => {
            onQuote(liveSelectionRef.current || popover.text);
            liveSelectionRef.current = '';
            document.getSelection()?.removeAllRanges();
            clearPopover();
          }}
        />
      ) : null}
      <div
        data-testid="swipe-surface"
        className="brief-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
        style={{ touchAction: 'pan-y' }}
        {...surfaceBind}
      >
        <article
          ref={setArticleRef}
          role="article"
          className="mx-auto w-full whitespace-pre-wrap px-6 font-dashSerif text-brief-ink"
          style={{
            fontSize: prefs.fontSize,
            lineHeight: prefs.lineHeight,
            background: theme.background,
            color: theme.color,
            paddingTop: `calc(${insetTop} + 2rem)`,
            paddingBottom: `calc(${NAV_HEIGHT} + max(4px, var(--safe-bottom)) + 2.5rem)`,
          }}
        >
          {chapterStart ? (
            <header className="mb-8 whitespace-normal">
              <p className="mb-1.5 font-dashSans text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5c6b47]" style={darkInk}>
                제 {chapterStart.chapter_no}장
              </p>
              <h2 className="font-dashSerif text-[19px] font-bold text-brief-ink" style={darkInk}>{chapterStart.title}</h2>
            </header>
          ) : null}
          {highlightContent(content, highlightedQuote)}
        </article>
      </div>

      <nav
        {...navChrome}
        ref={(el) => {
          (navRef as { current: HTMLElement | null }).current = el;
          navChrome.ref(el);
        }}
        className={`absolute inset-x-0 bottom-0 z-[5] flex items-center justify-between border-t border-brief-rule px-3 pt-1 font-dashSans text-[14px] text-brief-muted ${CHROME_FADE} ${chromeHidden ? 'invisible opacity-0' : ''}`}
        style={{ paddingBottom: 'max(4px, var(--safe-bottom))', background: theme.background, ...darkInk }}
      >
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="min-h-11 min-w-11 px-2 disabled:opacity-40"
        >
          이전 페이지
        </button>

        <div className="flex items-baseline gap-1.5 font-dashMono font-medium text-brief-ink" style={darkInk}>
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
            className="min-h-11 min-w-11 w-[4ch] border-0 border-b border-dashed border-brief-rule bg-transparent text-center text-[16px] text-inherit outline-none focus:border-b-[1.5px] focus:border-solid focus:border-brief-accent focus:bg-brief-accent-soft focus:text-brief-ink"
          />
          <span className="text-[14px] text-brief-muted" style={darkInk}>/ {totalPages}</span>
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
