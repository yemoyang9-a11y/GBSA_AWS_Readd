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
   * 빠르게 여러 번 페이지를 넘기면(직접 입력 포함) fetchPage 요청이 겹쳐 나가고, 응답이
   * 순서대로 안 돌아올 수 있다 — 늦게 도착한 예전 요청이 최신 페이지를 덮어쓰면 본문·
   * 페이지 표시가 실제로 이동한 곳보다 뒤처진다(2026-08-24, 실사용 중 발견 — "Np까지
   * 확인" 배지는 currentPage를 바로 쓰는데 본문 표시는 이 응답에 묶여 있어 서로 어긋나
   * 보였다). 요청을 보낼 때 목표 페이지를 기록해 두고, 응답이 왔을 때 그 사이 더 최신
   * 요청이 나가지 않았을 때만 반영한다.
   */
  const latestRequestedPageRef = useRef<number | null>(null);

  /**
   * 싸비 패널 열림 상태. **기본은 닫힘**이다 — 읽기 화면에 들어오면 본문만 보이고,
   * 사용자가 top-bar 우측 토글을 눌러야 싸비가 열린다 (시안 47:132 "싸비없는 책읽기").
   *
   * 닫을 때는 `<aside>` 째로 언마운트한다. 숨기기만 하면 닫힌 패널의 리캡 탭이 계속 살아 있어
   * 페이지를 넘길 때마다 보이지도 않는 리캡 스트리밍이 나간다 — 아래 리캡 effect 가 선택된
   * 탭만 보고 패널 가시성은 보지 않기 때문이다. 그건 그대로 LLM 재호출이고 분당 3회 상한에
   * 걸린다 (NFR-AI-017).
   *
   * 대가로 닫았다 열면 탭이 기본값으로 돌아갔었다 — 무의미한 조회 차단(이 언마운트 정책)과
   * 탭 기억(2026-08-24, 아래 tabMemory)을 함께 만족시켰다: 조회는 여전히 언마운트로
   * 차단하고, 탭은 Reader가 별도로 기억했다 되돌려주는 방식으로 풀었다.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);

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

  const appRef = useRef<HTMLDivElement>(null);
  const { width: panelWidth, isDragging, handleProps } = usePanelResize({
    minWidth: 380,
    getMaxWidth: () => (appRef.current ? Math.round(appRef.current.clientWidth * 0.5) : 380),
  });

  /**
   * 본문 드래그 선택 → 챗봇 인용. token 은 같은 문장을 연달아 다시 선택해도 SsabiPanel의
   * 탭 강제 전환 effect 가 매번 반응하도록 하는 1회성 신호다 (문자열만 같으면 effect가
   * 재실행되지 않는 문제 방지).
   *
   * 리캡 카드 드래그(2026-08-25)도 같은 핸들러를 쓴다 — ReaderView에는 onQuote로,
   * SsabiPanel에는 onRecapQuote로 똑같이 넘긴다. 소스가 뭐든 결과(pendingQuote)는
   * 동일하게 처리되므로 핸들러를 나눌 이유가 없다.
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
   * 마지막으로 활성이던 싸비 탭 기억 — 어느 session_epoch에서 기록됐는지와 함께 보관한다.
   * 패널을 닫으면 SsabiPanel이 통째로 언마운트되어(위 panelOpen 주석) 그 안의 탭 상태가
   * 사라지므로, 언마운트되지 않는 이 컨테이너가 대신 들고 있다가 재마운트 시 SsabiPanel에
   * 초기값으로 되돌려준다 (2026-08-24, 사용자 요청 — 닫았다 다시 열면 항상 인물 관계도로
   * 리셋되던 것을 마지막 이용 탭 유지로 바꿈). epoch을 함께 저장해 두는 이유는 세션이
   * 바뀐 채로 닫혀 있었으면(FR-SVB-004) 옛 탭 기억을 쓰면 안 되기 때문 — SsabiPanel의
   * resolveSsabiTab이 이 짝을 그대로 보고 sameSession을 판정하므로 별도 분기가 필요 없다.
   */
  const [tabMemory, setTabMemory] = useState<{ tab: SsabiTab; epoch: number } | null>(null);
  const handleTabChange = useCallback(
    (nextTab: SsabiTab) => {
      setTab(nextTab);
      setTabMemory({ tab: nextTab, epoch: session?.session_epoch ?? 0 });
    },
    [session?.session_epoch]
  );

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
    deleteConversation: deleteChatConversation,
  } = useChatConversation(bookId);
  /**
   * 패널 헤더에 보여줄 "Np까지 읽음" 배지 (2026-08-24, 사용자 결정 — 리캡·챗봇이 실제로
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
      latestRequestedPageRef.current = targetPage;
      void fetchPage(bookId, targetPage)
        .then((fetched) => {
          // 그 사이 더 최신 페이지 요청이 나갔으면 이 응답은 버린다 — 늦게 도착한 예전
          // 요청이 최신 화면을 덮어쓰지 않게 막는다
          if (latestRequestedPageRef.current === targetPage) setPage(fetched);
        })
        .catch(() => {
          if (latestRequestedPageRef.current === targetPage) setPageError(true);
        });
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
            style={{ width: panelExpanded ? panelWidth : 0, flexBasis: panelExpanded ? panelWidth : 0 }}
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
              <SsabiPanel
                sessionEpoch={session?.session_epoch ?? 0}
                appliedCutoff={panelAppliedCutoff}
                initialTab={tabMemory?.tab ?? null}
                initialTabEpoch={tabMemory?.epoch ?? null}
                onTabChange={handleTabChange}
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
                onRecapQuote={handleQuote}
                onAsk={handleAsk}
                onNewChat={startNewChat}
                onToggleChatHistory={toggleChatHistory}
                onSelectChatConversation={selectChatConversation}
                onDeleteChatConversation={deleteChatConversation}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
