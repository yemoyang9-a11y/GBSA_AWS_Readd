import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReaderView from '../components/Reader/ReaderView';
import TocPanel from '../components/Reader/TocPanel';
import SsabiPanel from '../components/Ssabi/SsabiPanel';
import Loading from '../components/common/Loading';
import Button from '../components/common/Button';
import SsabiToggleButton from '../components/common/SsabiToggleButton';
import TocToggleButton from '../components/common/TocToggleButton';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelOpenTransition } from '../hooks/usePanelOpenTransition';
import { useReadingSession } from '../hooks/useReadingSession';
import { useReaderPrefs } from '../hooks/useReaderPrefs';
import ReaderPrefsSheet from '../components/Reader/ReaderPrefsSheet';
import JumpReturnBar from '../components/Reader/JumpReturnBar';
import { useBackToBook } from '../hooks/useBackToBook';

/**
 * 읽기 화면 컨테이너 — S3 · S4 · S5
 *
 * 페이지가 열릴 때마다 진도 이벤트를 보낸다 (POST /progress, fire-and-forget).
 * GET /pages 로 흡수하지 않는다 — 선요청 안전 규칙 때문에 R2가 거절했다 (team-sync-r4.md §1.1).
 * 이동할 페이지 번호는 서버 응답의 prev_page·next_page 를 그대로 쓴다.
 *
 * 싸비 조회는 열려 있는 탭만 하고, 페이지가 바뀌면 다시 조회한다 (FR-SVB-003) — 단
 * 리캡은 예외다(2026-08-25, 사용자 요청): LLM 호출이라 페이지 이동만으로는 다시 부르지
 * 않고, 탭을 새로 열 때만 자동 생성하며 그 뒤로는 새로고침 버튼을 눌러야 한다(아래
 * recapAutoFetchedRef 참고).
 * 리캡·챗봇은 스트리밍이라 useSSE 가 따로 받는다.
 */
export default function Reader() {
  const { bookId = '' } = useParams();
  // A different book must never inherit the previous book's entry, page, or panel state.
  return <ReadingSession key={bookId} />;
}

function ReadingSession() {
  const { bookId = '' } = useParams();
  const {
    entryError,
    retryEntry,
    page,
    pageError,
    retryPage,
    currentPage,
    totalPages,
    chapters,
    bookTitle,
    currentChapter,
    jumpOrigin,
    returnToOrigin,
    dismissJumpOrigin,
    moveTo,
    panelOpen,
    togglePanel,
    highlightedQuote,
    quote,
    ssabiPanelProps,
  } = useReadingSession(bookId);
  const backToBook = useBackToBook(bookId);
  const prefsApi = useReaderPrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * 닫는 즉시 언마운트하던 걸(위 주석) 480ms 슬라이드 애니메이션 동안만 유예한다
   * (2026-08-24, 사용자 피드백 — 지피티 워크 모드 사이드 채팅 같은 느낌을 원함. 260ms→340ms→
   * 480ms로 두 차례 더 늘렸다 — "조금 빠르다"는 재피드백이 반복돼 이번엔 더 크게 늘렸다.
   * 아래 transition duration과 반드시 같이 맞춘다, 안 그러면 애니메이션이 끝나기 전에
   * 언마운트돼 뚝 끊겨 보인다).
   * panelRendered가 true인 동안만 `<aside>`를 그리고, 실제 폭은 panelExpanded(바로 아래)를
   * 기준으로 0↔panelWidth를 오간다 — usePanelResize가 이미 드래그용으로 쓰던 transition-[width]
   * 클래스를 그대로 재사용해 열기/닫기도 같은 방식으로 부드럽게 움직인다. 애니메이션이
   * 끝나면 panelRendered가 false로 떨어져 실제로 언마운트되므로, 리캡 재스트리밍
   * 위험(위 주석)은 "닫힌 채로 오래 마운트"가 아니라 "애니메이션 한 번"으로만 남는다.
   */
  const PANEL_ANIM_MS = 480;
  const panelRendered = usePanelOpenTransition(panelOpen, PANEL_ANIM_MS);

  /**
   * 실측 결과(requestAnimationFrame으로 폭을 프레임마다 찍어봄) — 열 때는 panelOpen이
   * true가 되는 바로 그 렌더에서 `<aside>`가 마운트와 동시에 최종 폭(380px)으로 그려져,
   * 브라우저가 전환해 올 "이전 값"이 없어서 애니메이션 없이 즉시 나타났다. 닫을 때는
   * 이미 마운트된 상태에서 폭만 바뀌므로 정상 작동한다(380→...→1로 보간 확인).
   * 그래서 여는 쪽만 별도로: 먼저 0으로 마운트되게 두고, 두 번 중첩된
   * requestAnimationFrame(브라우저가 0인 상태로 최소 한 번 페인트하도록 강제하는 표준
   * 트릭)으로 다음 프레임에 목표 폭으로 바꿔 브라우저가 실제로 보간할 값을 준다.
   */
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelRafRef = useRef(0);
  useEffect(() => {
    if (!panelOpen) {
      setPanelExpanded(false);
      return;
    }
    panelRafRef.current = requestAnimationFrame(() => {
      panelRafRef.current = requestAnimationFrame(() => setPanelExpanded(true));
    });
    return () => cancelAnimationFrame(panelRafRef.current);
  }, [panelOpen]);

  /**
   * 목차 패널 (2026-08-25, 사용자 요청) — 싸비 패널과 같은 열기/닫기 방식을 왼쪽에
   * 대칭으로 쓴다. 폭은 고정값이라(usePanelResize 같은 드래그 리사이즈 없음) 위
   * panelExpanded와 같은 2단 requestAnimationFrame 트릭만 그대로 가져온다 — 열 때
   * `<aside>`가 마운트와 동시에 최종 폭으로 그려지면 브라우저가 보간할 "이전 값"이
   * 없어 애니메이션 없이 즉시 나타나는 문제를 막는다.
   */
  const TOC_WIDTH = 300;
  const TOC_ANIM_MS = 320;
  const [tocOpen, setTocOpen] = useState(false);
  const toggleToc = useCallback(() => setTocOpen((open) => !open), []);
  const tocRendered = usePanelOpenTransition(tocOpen, TOC_ANIM_MS);
  const [tocExpanded, setTocExpanded] = useState(false);
  const tocRafRef = useRef(0);
  useEffect(() => {
    if (!tocOpen) {
      setTocExpanded(false);
      return;
    }
    tocRafRef.current = requestAnimationFrame(() => {
      tocRafRef.current = requestAnimationFrame(() => setTocExpanded(true));
    });
    return () => cancelAnimationFrame(tocRafRef.current);
  }, [tocOpen]);

  /** 목차에서 장을 고르면 그 장의 start_page로 이동하고 패널을 닫는다 — 서버가 준
   *  값을 그대로 쓴다(절대 규칙 2번). 페이지 입력창의 임의 이동과 같은 카테고리다. */
  const handleSelectChapter = useCallback(
    (startPage: number) => {
      moveTo(startPage);
      setTocOpen(false);
    },
    [moveTo]
  );

  const appRef = useRef<HTMLDivElement>(null);
  const {
    width: panelWidth,
    isDragging,
    handleProps,
  } = usePanelResize({
    minWidth: 380,
    getMaxWidth: () => (appRef.current ? Math.round(appRef.current.clientWidth * 0.5) : 380),
  });

  if (entryError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-brief-page px-6 text-center">
        <p role="alert" className="text-[13px] text-brief-muted">
          읽기를 시작하지 못했습니다
        </p>
        <Button onClick={retryEntry}>다시 시도</Button>
      </div>
    );
  }

  if (!page) {
    if (pageError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-brief-page px-6 text-center">
          <p role="alert" className="text-[13px] text-brief-muted">
            페이지를 불러오지 못했습니다
          </p>
          <Button onClick={retryPage}>다시 시도</Button>
        </div>
      );
    }
    return <Loading message="책을 펼치는 중" />;
  }

  return (
    <div ref={appRef} className="relative flex h-screen flex-col bg-brief-page">
      {/*
       * 싸비 여닫기 버튼. **열림/닫힘과 무관하게 늘 같은 자리**에 있다 — top-bar(64px)
       * 아래, 화면 우측에서 24px. 패널 안에 두면 닫는 순간 버튼도 사라져 다시 열 수 없고,
       * top-bar 안에 두면 열고 닫을 때 버튼이 위아래로 튄다. 그래서 흐름 밖에 고정한다.
       */}
      <div className="absolute right-6 top-20 z-10">
        <SsabiToggleButton open={panelOpen} onToggle={togglePanel} />
      </div>

      {/* 목차 여닫기 버튼 — 싸비 버튼과 같은 규칙을 좌측에 대칭으로 적용 (2026-08-25) */}
      <div className="absolute left-6 top-20 z-10">
        <TocToggleButton open={tocOpen} onToggle={toggleToc} />
      </div>

      <div className="flex h-16 shrink-0 items-center justify-between border-b border-brief-rule bg-brief-paper px-6">
        <button
          type="button"
          // FR-BRW-003
          onClick={backToBook}
          aria-label="뒤로 가기"
          className="flex size-9 items-center justify-center rounded-full border border-brief-rule bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm"
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
        {bookTitle ? (
          <p className="min-w-0 flex-1 truncate px-4 text-center font-dashSans text-[14px] text-brief-muted">
            {currentChapter ? `${bookTitle} · ${currentChapter.chapter_no}장 ${currentChapter.title}` : bookTitle}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <button
          ref={prefsButtonRef}
          type="button"
          onClick={() => setPrefsOpen((open) => !open)}
          aria-label="보기 설정"
          aria-haspopup="dialog"
          aria-expanded={prefsOpen}
          className="flex size-9 items-center justify-center rounded-full border border-brief-rule bg-white font-dashSerif text-[14px] font-bold text-brief-ink transition-shadow hover:shadow-brief-soft-sm"
        >
          <span aria-hidden="true">가</span>
        </button>
      </div>

      <JumpReturnBar origin={jumpOrigin} onReturn={returnToOrigin} onDismiss={dismissJumpOrigin} />
      {prefsOpen ? (
        <ReaderPrefsSheet
          variant="popover"
          onClose={() => setPrefsOpen(false)}
          returnFocusRef={prefsButtonRef}
          prefsApi={prefsApi}
        />
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {tocRendered ? (
          <aside
            id="toc-panel"
            style={{
              width: tocExpanded ? TOC_WIDTH : 0,
              flexBasis: tocExpanded ? TOC_WIDTH : 0,
            }}
            className="relative shrink-0 overflow-hidden border-r border-brief-rule transition-[width,flex-basis] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <div
              className={`h-full transition-opacity duration-[280ms] ${tocExpanded ? 'opacity-100' : 'opacity-0'}`}
              style={{ width: TOC_WIDTH }}
            >
              <TocPanel
                chapters={chapters}
                currentPage={currentPage}
                onSelectChapter={handleSelectChapter}
              />
            </div>
          </aside>
        ) : null}

        <div className="flex-1">
          {page.page_no === currentPage ? (
            <ReaderView
              content={page.content}
              currentPage={page.page_no}
              totalPages={totalPages}
              prevPage={page.prev_page}
              nextPage={page.next_page}
              onMove={moveTo}
              onQuote={quote}
              highlightedQuote={highlightedQuote}
              chapterStart={chapters.find((chapter) => chapter.start_page === page.page_no) ?? null}
              prefs={prefsApi.prefs}
            />
          ) : pageError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p role="alert" className="text-[13px] text-brief-muted">
                페이지를 불러오지 못했습니다
              </p>
              <Button onClick={retryPage}>
                다시 시도
              </Button>
            </div>
          ) : (
            <Loading message="페이지를 불러오는 중" />
          )}
        </div>

        {panelRendered ? (
          <aside
            id="ssabi-panel"
            style={{
              width: panelExpanded ? panelWidth : 0,
              flexBasis: panelExpanded ? panelWidth : 0,
            }}
            className={`relative shrink-0 overflow-hidden border-l border-brief-rule ${
              isDragging
                ? ''
                : 'transition-[width,flex-basis] duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
            }`}
          >
            {panelOpen ? (
              <div
                {...handleProps}
                className={`absolute -left-[5px] top-0 z-10 flex h-full w-[10px] cursor-col-resize items-center justify-center ${isDragging ? 'select-none' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`w-[3px] rounded-full bg-brief-rule transition-all ${isDragging ? 'h-[52px] bg-brief-ink' : 'h-9'}`}
                />
              </div>
            ) : null}
            <div
              className={`h-full transition-opacity duration-[400ms] ${panelExpanded ? 'opacity-100' : 'opacity-0'}`}
              style={{ width: panelWidth }}
            >
              <SsabiPanel key={currentPage} {...ssabiPanelProps} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
