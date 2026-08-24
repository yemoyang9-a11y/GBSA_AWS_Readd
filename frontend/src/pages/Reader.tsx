import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ReaderView from '../components/Reader/ReaderView';
import SsabiPanel from '../components/Ssabi/SsabiPanel';
import Loading from '../components/common/Loading';
import Button from '../components/common/Button';
import SsabiToggleButton from '../components/common/SsabiToggleButton';
import { fetchBookInfo, fetchPage } from '../services/bookService';
import { enterBook, sendProgress } from '../services/progressService';
import { streamRecap } from '../services/recapService';
import { useSsabiData } from '../hooks/useSsabiData';
import { useHeartbeat } from '../hooks/useHeartbeat';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelOpenTransition } from '../hooks/usePanelOpenTransition';
import { useSSE } from '../hooks/useSSE';
import { useChatConversation } from '../hooks/useChatConversation';
import { nextSeq } from '../utils/seq';
import { DEFAULT_SSABI_TAB } from '../utils/constants';
import type { EntryResponse, PageResponse, SsabiTab } from '../types';

/**
 * 읽기 화면 컨테이너 — S3 · S4 · S5
 *
 * 페이지가 열릴 때마다 진도 이벤트를 보낸다 (POST /progress, fire-and-forget).
 * GET /pages 로 흡수하지 않는다 — 선요청 안전 규칙 때문에 R2가 거절했다 (team-sync-r4.md §1.1).
 * 이동할 페이지 번호는 서버 응답의 prev_page·next_page 를 그대로 쓴다.
 *
 * 싸비 조회는 열려 있는 탭만 하고, 페이지가 바뀌면 다시 조회한다 (FR-SVB-003).
 * 리캡·챗봇은 스트리밍이라 useSSE 가 따로 받는다.
 */
export default function Reader() {
  const { bookId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const entry = (location.state as { entry?: EntryResponse } | null)?.entry;

  const [page, setPage] = useState<PageResponse | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [tab, setTab] = useState<SsabiTab>(DEFAULT_SSABI_TAB);

  /**
   * 싸비 패널 열림 상태. **기본은 닫힘**이다 — 읽기 화면에 들어오면 본문만 보이고,
   * 사용자가 top-bar 우측 토글을 눌러야 싸비가 열린다 (시안 47:132 "싸비없는 책읽기").
   *
   * 닫을 때는 `<aside>` 째로 언마운트한다. 숨기기만 하면 닫힌 패널의 리캡 탭이 계속 살아 있어
   * 페이지를 넘길 때마다 보이지도 않는 리캡 스트리밍이 나간다 — 아래 리캡 effect 가 선택된
   * 탭만 보고 패널 가시성은 보지 않기 때문이다. 그건 그대로 LLM 재호출이고 분당 3회 상한에
   * 걸린다 (NFR-AI-017).
   *
   * TODO 대가로 닫았다 열면 탭이 기본값으로 돌아간다. 탭 기억과 무의미한 호출 차단을 함께
   *   만족시키려면 조회 effect 들의 조건에 이 상태를 넣어야 한다 — 추가 기능 작업에서 처리.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);

  /**
   * 닫는 즉시 언마운트하던 걸(위 주석) 260ms 슬라이드 애니메이션 동안만 유예한다
   * (2026-08-24, 사용자 피드백 — 지피티 워크 모드 사이드 채팅 같은 느낌을 원함).
   * panelRendered가 true인 동안만 `<aside>`를 그리고, 실제 폭은 panelOpen을 기준으로
   * 0↔panelWidth를 오간다 — usePanelResize가 이미 드래그용으로 쓰던 transition-[width]
   * 클래스를 그대로 재사용해 열기/닫기도 같은 방식으로 부드럽게 움직인다. 애니메이션이
   * 끝나면(260ms) panelRendered가 false로 떨어져 실제로 언마운트되므로, 리캡 재스트리밍
   * 위험(위 주석)은 "닫힌 채로 오래 마운트"가 아니라 "애니메이션 한 번"으로만 남는다.
   */
  const panelRendered = usePanelOpenTransition(panelOpen, 260);

  const appRef = useRef<HTMLDivElement>(null);
  const { width: panelWidth, isDragging, handleProps } = usePanelResize({
    minWidth: 380,
    getMaxWidth: () => (appRef.current ? Math.round(appRef.current.clientWidth * 0.5) : 380),
  });

  /**
   * 본문 드래그 선택 → 챗봇 인용. token 은 같은 문장을 연달아 다시 선택해도 SsabiPanel의
   * 탭 강제 전환 effect 가 매번 반응하도록 하는 1회성 신호다 (문자열만 같으면 effect가
   * 재실행되지 않는 문제 방지).
   */
  const [pendingQuote, setPendingQuote] = useState<{ text: string; token: number } | null>(null);
  const handleQuote = useCallback((text: string) => {
    setPanelOpen(true);
    setPendingQuote((prev) => ({ text, token: (prev?.token ?? 0) + 1 }));
  }, []);

  /**
   * 시작 페이지·세션은 **서버 진입 판정**이 정한다 (FR-BRF-001, 절대 규칙 8번).
   * 브리핑을 거쳐 왔으면 그 결과를 그대로 받고, URL 로 바로 들어왔으면 여기서 판정을 받는다.
   * 클라이언트가 1페이지라고 가정하면 그 값으로 진도가 발신되어 기준점이 되감긴다.
   */
  const [session, setSession] = useState<EntryResponse | null>(entry ?? null);
  const [currentPage, setCurrentPage] = useState<number | null>(entry?.page ?? null);

  /**
   * 진입 판정 실패 상태. 실패 시 무한 로딩 대신 재시도 UI를 보여준다 —
   * 크리틱 P0: 이전에는 `.catch` 가 없어 백엔드 장애 시 "불러오는 중"에서 영원히 멈췄다.
   */
  const [entryError, setEntryError] = useState(false);
  const [pageError, setPageError] = useState(false);

  const loadEntry = useCallback(() => {
    setEntryError(false);
    void enterBook(bookId)
      .then((judged) => {
        setSession(judged);
        setCurrentPage(judged.page);
      })
      .catch(() => setEntryError(true));
  }, [bookId]);

  useEffect(() => {
    if (session) return;
    loadEntry();
  }, [session, loadEntry]);

  const {
    text: recapText,
    streaming: recapStreaming,
    error: recapError,
    consume: consumeRecap,
  } = useSSE();
  const {
    turns: chatTurns,
    streaming: chatStreaming,
    error: chatError,
    conversations: chatConversations,
    historyOpen: chatHistoryOpen,
    ask: askChat,
    newChat: startNewChat,
    toggleHistory: toggleChatHistory,
    selectConversation: selectChatConversation,
  } = useChatConversation(bookId);
  /**
   * 패널 헤더에 보여줄 "Np까지 확인" 배지 (2026-08-24, 사용자 결정 — 리캡·챗봇이 실제로
   * 어디까지 근거로 썼는지가 아니라 "지금 보고 있는 페이지"를 그대로 보여주는 쪽을
   * 선택함). 챗봇은 이미 지금 페이지 본문을 매 질문마다 자동으로 근거에 포함하므로
   * (service.ts "지금 보고 있는 페이지 본문" 섹션) 이 표시가 챗봇 기준으로는 정확하다 —
   * 다만 리캡·관계도 조회 자체는 여전히 K(현재 페이지 − 1)까지만 본다(R1 불변). 여기
   * 쓰는 값은 서버가 응답으로 확인해 준 현재 페이지 번호 그대로다 — 프론트가 page−1 같은
   * 산술을 하지 않는다(절대 규칙 2번).
   */
  const panelAppliedCutoff = currentPage;
  const { graph, failed: graphFailed } = useSsabiData({ bookId, tab, currentPage: currentPage ?? 0 });

  /**
   * 한 페이지에 오래 머물러도 세션이 끊기지 않게 한다 (A2).
   * 읽기 화면에만 둔다 — 브리핑은 스쳐 가는 화면이고, 여기가 사용자가 머무는 곳이다.
   */
  useHeartbeat({ bookId });

  useEffect(() => {
    void fetchBookInfo(bookId).then((info) => {
      const last = info.chapters[info.chapters.length - 1];
      setTotalPages(last ? last.end_page : 0);
    });
  }, [bookId]);

  const loadPage = useCallback(
    (targetPage: number) => {
      setPageError(false);
      void fetchPage(bookId, targetPage)
        .then(setPage)
        .catch(() => setPageError(true));
    },
    [bookId]
  );

  useEffect(() => {
    if (currentPage === null) return; // 진입 판정 전에는 진도를 보내지 않는다
    loadPage(currentPage);
    // 페이지 열림이 확정된 시점에 진도를 알린다 (FR-PRG-002, NFR-PERF-005)
    void sendProgress(bookId, currentPage);
  }, [bookId, currentPage, loadPage]);

  // 리캡 탭을 열면 그 시점 기준점으로 받는다. 페이지가 바뀌면 다시 받는다 (FR-SVB-003)
  useEffect(() => {
    if (tab !== 'recap' || currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
  }, [tab, bookId, currentPage, consumeRecap]);

  const handleAsk = useCallback(
    (query: string, quote?: string) => {
      if (currentPage === null) return;
      void askChat(query, currentPage, nextSeq(), quote);
    },
    [askChat, currentPage]
  );

  if (entryError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-brief-page px-6 text-center">
        <p role="alert" className="text-[13px] text-brief-muted">
          읽기를 시작하지 못했습니다
        </p>
        <Button onClick={loadEntry}>다시 시도</Button>
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
          <Button onClick={() => currentPage !== null && loadPage(currentPage)}>다시 시도</Button>
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

      <div className="flex h-16 shrink-0 items-center justify-between border-b border-brief-rule bg-brief-paper px-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로 가기"
          className="flex size-9 items-center justify-center rounded-full border border-brief-rule bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm"
        >
          <span aria-hidden="true" className="text-base">
            ‹
          </span>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReaderView
            content={page.content}
            currentPage={page.page_no}
            totalPages={totalPages}
            prevPage={page.prev_page}
            nextPage={page.next_page}
            onMove={setCurrentPage}
            onQuote={handleQuote}
          />
        </div>

        {panelRendered ? (
          <aside
            id="ssabi-panel"
            style={{ width: panelOpen ? panelWidth : 0, flexBasis: panelOpen ? panelWidth : 0 }}
            className={`relative shrink-0 overflow-hidden border-l border-brief-rule ${
              isDragging ? '' : 'transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
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
              className={`h-full transition-opacity duration-[220ms] ${panelOpen ? 'opacity-100' : 'opacity-0'}`}
              style={{ width: panelWidth }}
            >
              <SsabiPanel
                sessionEpoch={session?.session_epoch ?? 0}
                appliedCutoff={panelAppliedCutoff}
                onTabChange={setTab}
                graph={graph}
                graphFailed={graphFailed}
                recapText={recapText}
                recapStreaming={recapStreaming}
                recapFailed={recapError !== null}
                chatTurns={chatTurns}
                chatStreaming={chatStreaming}
                chatError={chatError}
                chatConversations={chatConversations}
                chatHistoryOpen={chatHistoryOpen}
                pendingQuote={pendingQuote}
                onAsk={handleAsk}
                onNewChat={startNewChat}
                onToggleChatHistory={toggleChatHistory}
                onSelectChatConversation={selectChatConversation}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
