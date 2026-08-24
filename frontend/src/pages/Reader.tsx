import { useCallback, useEffect, useState } from 'react';
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
    appliedCutoff: recapAppliedCutoff,
    consume: consumeRecap,
    resetAppliedCutoff: resetRecapAppliedCutoff,
  } = useSSE();
  const {
    turns: chatTurns,
    streaming: chatStreaming,
    error: chatError,
    appliedCutoff: chatAppliedCutoff,
    conversations: chatConversations,
    historyOpen: chatHistoryOpen,
    ask: askChat,
    newChat: startNewChat,
    toggleHistory: toggleChatHistory,
    selectConversation: selectChatConversation,
    resetAppliedCutoff: resetChatAppliedCutoff,
  } = useChatConversation(bookId);
  /**
   * progress 응답이 실어 온 확인된 기준점 (2026-08-24, 사용자 요청 — 리캡·챗봇을 안 열어도
   * 페이지 넘길 때마다 배지가 최신으로 갱신되길 원함). sendProgress는 이미 페이지가 열릴
   * 때마다 무조건 나가므로(FR-PRG-002), 리캡·챗봇보다 갱신이 훨씬 잦다.
   */
  const [progressAppliedCutoff, setProgressAppliedCutoff] = useState<number | null>(null);

  /**
   * 패널 헤더에 보여줄 "확인된 기준점". 리캡·챗봇(그 탭을 실제로 열어 확인한 값)을
   * 우선하고, 아직 둘 다 없으면 progress 응답값으로 채운다. 관계도 탭은 계약에 이 값이
   * 아직 없어(GraphResponse TODO) 셋 다 없으면 표시할 수 없다 — 어느 경우든 프론트가
   * K를 계산해서 채우지 않는다(절대 규칙 2번) — 셋 다 서버가 확인해 준 값 그대로다.
   */
  const panelAppliedCutoff = recapAppliedCutoff ?? chatAppliedCutoff ?? progressAppliedCutoff;
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

  /**
   * "Np까지 확인" 배지는 리캡·챗봇이 확인해 준 값을 유지만 하고 스스로 지우지 않는다
   * (useSSE·useChatConversation 주석) — 그래서 예전 페이지에서 리캡을 한 번 열어 두고
   * 관계도 탭으로 옮긴 채 계속 다음 페이지로 넘기면, 리캡·챗봇을 다시 열기 전까지 배지가
   * 옛 페이지의 숫자를 그대로 붙들고 있었다. 페이지가 바뀌면 그 값부터 비운다 — 프론트가
   * 새 숫자를 계산해서 채우는 게 아니라(절대 규칙 2번), 다음에 리캡·챗봇이 확인해 줄
   * 때까지 배지를 안 보여주는 쪽으로 처리한다(critique P1 정책 그대로).
   */
  useEffect(() => {
    resetRecapAppliedCutoff();
    resetChatAppliedCutoff();
    setProgressAppliedCutoff(null);
  }, [currentPage, resetRecapAppliedCutoff, resetChatAppliedCutoff]);

  useEffect(() => {
    if (currentPage === null) return; // 진입 판정 전에는 진도를 보내지 않는다
    loadPage(currentPage);
    // 페이지 열림이 확정된 시점에 진도를 알린다 (FR-PRG-002, NFR-PERF-005) — 응답은
    // 기다리지 않는다(넘김을 막지 않음). 배지 갱신은 응답이 오면 뒤늦게 반영될 뿐이다.
    // 서버가 매번 "현재 저장된 위치" 기준으로 다시 조회해 응답하므로, 여러 요청이 뒤섞여
    // 순서가 바뀌어 도착해도 항상 최신 진실을 반환한다 — 프론트가 순서를 맞출 필요가 없다.
    void sendProgress(bookId, currentPage).then((cutoff) => {
      if (cutoff !== null) setProgressAppliedCutoff(cutoff);
    });
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
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <p role="alert" className="text-[13px] text-muted">
          읽기를 시작하지 못했습니다
        </p>
        <Button onClick={loadEntry}>다시 시도</Button>
      </div>
    );
  }

  if (!page) {
    if (pageError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
          <p role="alert" className="text-[13px] text-muted">
            페이지를 불러오지 못했습니다
          </p>
          <Button onClick={() => currentPage !== null && loadPage(currentPage)}>다시 시도</Button>
        </div>
      );
    }
    return <Loading message="책을 펼치는 중" />;
  }

  return (
    <div className="relative flex h-screen flex-col bg-canvas">
      {/*
       * 싸비 여닫기 버튼. **열림/닫힘과 무관하게 늘 같은 자리**에 있다 — top-bar(72px)
       * 아래, 패널 헤더의 "싸비의 가이드북"과 같은 줄, 화면 우측에서 24px.
       * 패널 안에 두면 닫는 순간 버튼도 사라져 다시 열 수 없고, top-bar 안에 두면
       * 열고 닫을 때 버튼이 위아래로 튄다. 그래서 흐름 밖에 고정한다.
       */}
      <div className="absolute right-6 top-24 z-10">
        <SsabiToggleButton open={panelOpen} onToggle={() => setPanelOpen((open) => !open)} />
      </div>

      <div className="flex h-[72px] shrink-0 items-center border-b border-line px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink transition-opacity hover:opacity-60"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div className="flex flex-col gap-0.5">
            <span className="font-serif text-lg font-bold tracking-widest text-ink">RE:ADD</span>
            <span className="text-xs text-muted">탁류</span>
          </div>
        </div>

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

        {panelOpen ? (
          <aside id="ssabi-panel" className="w-[420px] shrink-0">
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
          </aside>
        ) : null}
      </div>
    </div>
  );
}
