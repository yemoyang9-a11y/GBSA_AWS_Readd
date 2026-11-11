import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type SsabiPanel from '../components/Ssabi/SsabiPanel';
import { fetchBookInfo, fetchPage } from '../services/bookService';
import { enterBook, sendProgress } from '../services/progressService';
import { streamRecap } from '../services/recapService';
import { useSsabiData } from './useSsabiData';
import { useHeartbeat } from './useHeartbeat';
import { useSSE } from './useSSE';
import { useChatConversation } from './useChatConversation';
import { nextSeq } from '../utils/seq';
import { takePendingJump } from '../utils/pendingJump';
import { DEFAULT_SSABI_TAB } from '../utils/constants';
import type { ChapterSummary, EntryResponse, PageResponse, SsabiTab } from '../types';

export interface ReadingSessionState {
  entryError: boolean;
  retryEntry: () => void;
  page: PageResponse | null;
  pageError: boolean;
  retryPage: () => void;
  currentPage: number | null;
  totalPages: number;
  chapters: ChapterSummary[];
  bookTitle: string | null;
  currentChapter: ChapterSummary | null;
  jumpOrigin: number | null;
  returnToOrigin: () => void;
  dismissJumpOrigin: () => void;
  moveTo: (page: number) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  highlightedQuote: string | null;
  quote: (text: string) => void;
  ssabiPanelProps: ComponentProps<typeof SsabiPanel>;
}

// FR-PRG-003 🚦 FR-BRF-001 FR-SVB-003
export function useReadingSession(bookId: string): ReadingSessionState {
  /**
   * ⚠️ `location.state.entry`를 시작 페이지로 쓰지 않는다 (2026-08-26, 사용자 제보 —
   * "30페이지에서 F5를 누르면 25페이지로 되돌아간다").
   *
   * React Router v6는 navigate state를 `window.history.state`에 싣고, 브라우저는 그것을
   * 새로고침 후에도 복원한다. 그래서 F5를 하면 "읽기 화면에 처음 들어왔을 때의 page"가
   * 되살아난다 — 언제 만들어진 값인지 알 수 없는 값이다. 예전엔 그 값으로 화면을 그리고
   * (낡은 페이지로 되돌아감) 진도까지 보내서(서버의 올바른 위치를 덮어씀) 두 번 틀렸다.
   *
   * 어디까지 읽었는지의 원천은 서버가 저장한 진도 하나뿐이므로, 진입할 때마다
   * enterBook()으로 물어본다. 이 호출은 서버의 event_seq도 0으로 되돌려(session.service.ts)
   * 새로고침으로 0부터 다시 시작한 로컬 seq와 다시 맞춰 준다 — 그러지 않으면 이후 진도가
   * FR-PRG-002의 "더 새로운 seq만 수용"에 막혀 통째로 버려진다.
   */

  const [page, setPage] = useState<PageResponse | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  /** 목차 (2026-08-25, 사용자 요청) — GET /info가 cutoff 인자 없이 전량 내려준다
   *  (FR-NAV-001, R3 4장). TocPanel이 그대로 그린다. */
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [infoSettled, setInfoSettled] = useState(false);
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
    setHighlightedQuote(text);
  }, []);

  /**
   * 본문 인용 하이라이트 (2026-08-25, 사용자 요청) — "선택한 문장" 카드와 같은 값을
   * 따로 들고 있다가 ReaderView에 내려준다. pendingQuote와 값은 같지만 목적이 다르다 —
   * pendingQuote는 "새 인용이 왔다"는 1회성 신호(token 포함, SsabiPanel 탭 전환용)이고
   * 이건 "지금 강조해야 할 문장이 있는가"라는 상태값이라, 카드가 지워지면(×·새 채팅·
   * 다른 대화 선택 — ChatbotTab의 onQuoteDismissed) 이것만 따로 null로 돌아간다.
   */
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);

  /**
   * 시작 페이지·세션은 **서버 진입 판정**이 정한다 (FR-BRF-001, 절대 규칙 8번).
   * 브리핑을 거쳐 왔으면 그 결과를 그대로 받고, URL 로 바로 들어왔으면 여기서 판정을 받는다.
   * 클라이언트가 1페이지라고 가정하면 그 값으로 진도가 발신되어 기준점이 되감긴다.
   */
  const [session, setSession] = useState<EntryResponse | null>(null);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [previousPage, setPreviousPage] = useState(currentPage);

  /**
   * 선택 문장은 그 문장이 있던 본문 페이지에서만 유효하다. 이전/다음·목차·직접 입력처럼
   * currentPage를 바꾸는 모든 이동 경로가 이 한 상태를 거치므로, 페이지를 떠나는 즉시
   * 챗봇 카드와 본문 강조를 함께 비운다.
   */
  if (previousPage !== currentPage) {
    setPreviousPage(currentPage);
    setPendingQuote(null);
    setHighlightedQuote(null);
  }

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
   * 인물 관계도 "주요인물/전체" 토글 기억 — tabMemory와 정확히 같은 이유·구조다
   * (2026-08-25, 사용자 요청. RelationshipTab.tsx "토글 위치 기억" 참고). SsabiPanel도
   * 패널을 닫으면 통째로 언마운트되므로, 여기(Reader)가 대신 들고 있다가 재마운트 시
   * 돌려준다.
   */
  const [characterModeMemory, setCharacterModeMemory] = useState<{
    mode: 'major' | 'all';
    epoch: number;
  } | null>(null);
  const handleCharacterModeChange = useCallback(
    (mode: 'major' | 'all') => {
      setCharacterModeMemory({ mode, epoch: session?.session_epoch ?? 0 });
    },
    [session?.session_epoch]
  );

  /**
   * 진입 판정 실패 상태. 실패 시 무한 로딩 대신 재시도 UI를 보여준다 —
   * 크리틱 P0: 이전에는 `.catch` 가 없어 백엔드 장애 시 "불러오는 중"에서 영원히 멈췄다.
   */
  const [entryError, setEntryError] = useState(false);
  const [pageError, setPageError] = useState(false);

  // FR-PRG-003 🚦
  const pendingJumpRef = useRef<{ taken: boolean; page: number | null }>({ taken: false, page: null });
  useEffect(() => {
    if (!pendingJumpRef.current.taken) pendingJumpRef.current = { taken: true, page: takePendingJump(bookId) };
  }, [bookId]);
  const [entryPage, setEntryPage] = useState<number | null>(null);
  const [jumpOrigin, setJumpOrigin] = useState<number | null>(null);
  const entryRequestRef = useRef(0);

  const loadEntry = useCallback(() => {
    setEntryError(false);
    const request = ++entryRequestRef.current;
    void enterBook(bookId)
      .then((judged) => {
        if (request !== entryRequestRef.current) return;
        setSession(judged);
        if (pendingJumpRef.current.page === null) setCurrentPage(judged.page);
        else setEntryPage(judged.page);
      })
      .catch(() => {
        if (request === entryRequestRef.current) setEntryError(true);
      });
  }, [bookId]);

  // 진입할 때마다 서버에 위치를 묻는다 — 새로고침으로 되살아난 낡은 state를 믿지 않기
  // 위해서다(위 주석). loadEntry는 bookId에만 의존하므로 책당 1회 실행된다.
  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  const {
    text: recapText,
    streaming: recapStreaming,
    error: recapError,
    consume: consumeRecap,
  } = useSSE(`${bookId}:${currentPage}`);
  /**
   * 패널 배지는 로컬 currentPage가 아니라 POST /progress가 확인한 applied_cutoff만 보여준다.
   * 그래야 배지는 최신인데 실제 챗봇·관계도는 전 페이지를 보는 거짓 상태가 되지 않는다.
   */
  const [, setPanelAppliedCutoff] = useState<number | null>(null);
  const progressRequestIdRef = useRef(0);
  const progressSyncRef = useRef<{
    page: number;
    promise: Promise<void>;
  } | null>(null);
  const syncPageProgress = useCallback(
    (targetPage: number): Promise<void> => {
      const requestId = ++progressRequestIdRef.current;
      const request = { page: targetPage, promise: Promise.resolve() };
      request.promise = sendProgress(bookId, targetPage).then((appliedCutoff) => {
        if (appliedCutoff === null) throw new Error('PROGRESS_SYNC_FAILED');
        if (requestId === progressRequestIdRef.current) setPanelAppliedCutoff(appliedCutoff);
      });
      progressSyncRef.current = request;
      // 느린 이전 요청이 나중에 돌아와 최신 배지를 되감지 못하게 한다.
      return request.promise;
    },
    [bookId]
  );
  const ensureHistoryPosition = useCallback(async () => {
    if (currentPage === null) throw new Error('POSITION_NOT_READY');
    const pending = progressSyncRef.current;
    if (pending?.page === currentPage) {
      await pending.promise;
      return;
    }
    await syncPageProgress(currentPage);
  }, [currentPage, syncPageProgress]);
  const invalidateHistoryPosition = useCallback(() => {
    progressSyncRef.current = null;
  }, []);
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
  } = useChatConversation(bookId, currentPage, ensureHistoryPosition, invalidateHistoryPosition);
  const { graph, failed: graphFailed } = useSsabiData({
    bookId,
    tab,
    currentPage,
  });

  /**
   * 한 페이지에 오래 머물러도 세션이 끊기지 않게 한다 (A2).
   * 읽기 화면에만 둔다 — 브리핑은 스쳐 가는 화면이고, 여기가 사용자가 머무는 곳이다.
   */
  useHeartbeat({ bookId });

  useEffect(() => {
    void fetchBookInfo(bookId)
      .then((info) => {
        const last = info.chapters[info.chapters.length - 1];
        setTotalPages(last ? last.end_page : 0);
        setChapters(info.chapters);
        setBookTitle(info.basic_info.title);
      })
      // FR-SPL-005
      .catch(() => undefined)
      .finally(() => setInfoSettled(true));
  }, [bookId]);

  // FR-PRG-003 🚦
  useEffect(() => {
    const jump = pendingJumpRef.current.page;
    if (entryPage === null || jump === null || !infoSettled) return;
    pendingJumpRef.current = { taken: true, page: null };
    const inRange = jump >= 1 && jump <= totalPages;
    if (inRange && jump !== entryPage) setJumpOrigin(entryPage);
    setCurrentPage(inRange ? jump : entryPage);
  }, [entryPage, infoSettled, totalPages]);

  const returnToOrigin = useCallback(() => {
    if (jumpOrigin !== null) setCurrentPage(jumpOrigin);
    setJumpOrigin(null);
  }, [jumpOrigin]);
  const dismissJumpOrigin = useCallback(() => setJumpOrigin(null), []);

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
    setPanelAppliedCutoff(null);
    void syncPageProgress(currentPage).catch(() => {
      // 자동 진도 실패는 페이지 이동을 막지 않으며, 확인 전 배지는 비워 둔다.
    });
  }, [currentPage, loadPage, syncPageProgress]);

  /**
   * 리캡 자동 생성 — 싸비가 닫혀 있다가 열리거나(패널 재마운트), 열린 채로 다른 탭에서
   * 리캡 탭으로 전환할 때만 그 시점 기준점으로 받는다 (2026-08-25, 사용자 요청).
   *
   * 이전에는 `currentPage`가 dep에 있어서 리캡 탭이 열린 채로 페이지를 넘길 때마다
   * LLM을 다시 불렀다 — 분당 호출 상한(NFR-AI-017)에 쉽게 걸리는 원인이었다. 이제
   * 페이지 이동만으로는 다시 부르지 않고, 아래 refreshRecap(새로고침 버튼)을 눌러야
   * 다시 받는다.
   *
   * "언제 새로 받을지"는 recapAutoFetchedRef로 판단한다 — panelOpen && tab==='recap'
   * 상태에 있는 동안은 true로 묶어 두고, 그 상태를 벗어나면(패널을 닫거나 다른 탭으로
   * 전환하면) false로 되돌린다. 그래서 effect의 dep에는 일부러 currentPage를 넣지
   * 않는다 — 넣으면 페이지가 바뀔 때마다 재실행되어 다시 원래 문제로 돌아간다. 대신
   * fetch 시점에는 그 순간의 currentPage(클로저로 캡처된 최신값)를 그대로 쓴다.
   *
   * panelOpen을 조건에 넣은 것도 이번에 같이 고쳤다 — 예전엔 tab만 봐서, 리캡 탭을
   * 한 번이라도 연 적이 있으면 그 값이 Reader에 남아(패널은 언마운트돼도 tab state는
   * 안 지워짐) 패널이 닫혀 있어도 페이지를 넘길 때마다 리캡이 계속 생성되고 있었다.
   */
  const recapAutoFetchedRef = useRef(false);
  useEffect(() => {
    if (!panelOpen || tab !== 'recap') {
      recapAutoFetchedRef.current = false;
      return;
    }
    if (recapAutoFetchedRef.current) return;
    recapAutoFetchedRef.current = true;
    if (currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, tab, bookId, consumeRecap]);

  const refreshRecap = useCallback(() => {
    if (currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
  }, [bookId, currentPage, consumeRecap]);

  const handleAsk = useCallback(
    (query: string, quote?: string) => {
      if (currentPage === null) return;
      void askChat(query, currentPage, nextSeq(), quote);
    },
    [askChat, currentPage]
  );

  const retryPage = useCallback(() => {
    if (currentPage !== null) loadPage(currentPage);
  }, [currentPage, loadPage]);

  const currentChapter =
    currentPage === null
      ? null
      : (chapters.find((chapter) => currentPage >= chapter.start_page && currentPage <= chapter.end_page) ?? null);

  return {
    entryError,
    retryEntry: loadEntry,
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
    moveTo: setCurrentPage,
    panelOpen,
    togglePanel,
    highlightedQuote,
    quote: handleQuote,
    ssabiPanelProps: {
      sessionEpoch: session?.session_epoch ?? 0,
      initialTab: tabMemory?.tab ?? null,
      initialTabEpoch: tabMemory?.epoch ?? null,
      onTabChange: handleTabChange,
      initialCharacterMode: characterModeMemory?.mode ?? null,
      initialCharacterModeEpoch: characterModeMemory?.epoch ?? null,
      onCharacterModeChange: handleCharacterModeChange,
      graph,
      graphFailed,
      totalPages,
      recapText,
      recapStreaming,
      recapFailed: recapError !== null,
      chatTurns,
      chatStreaming,
      chatError,
      chatConversations,
      chatHistoryOpen,
      pendingQuote,
      onRecapQuote: handleQuote,
      onRecapRefresh: refreshRecap,
      onQuoteDismissed: () => setHighlightedQuote(null),
      onAsk: handleAsk,
      onNewChat: startNewChat,
      onToggleChatHistory: toggleChatHistory,
      onSelectChatConversation: selectChatConversation,
      onDeleteChatConversation: deleteChatConversation,
    },
  };
}
