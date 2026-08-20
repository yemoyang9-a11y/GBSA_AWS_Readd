import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ReaderView from '../components/Reader/ReaderView';
import SsabiPanel from '../components/Ssabi/SsabiPanel';
import Loading from '../components/common/Loading';
import { fetchBookInfo, fetchPage } from '../services/bookService';
import { enterBook, sendProgress } from '../services/progressService';
import { streamRecap } from '../services/recapService';
import { askChatbot } from '../services/chatbotService';
import { useSsabiData } from '../hooks/useSsabiData';
import { useHeartbeat } from '../hooks/useHeartbeat';
import { useSSE } from '../hooks/useSSE';
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
   * 시작 페이지·세션은 **서버 진입 판정**이 정한다 (FR-BRF-001, 절대 규칙 8번).
   * 브리핑을 거쳐 왔으면 그 결과를 그대로 받고, URL 로 바로 들어왔으면 여기서 판정을 받는다.
   * 클라이언트가 1페이지라고 가정하면 그 값으로 진도가 발신되어 기준점이 되감긴다.
   */
  const [session, setSession] = useState<EntryResponse | null>(entry ?? null);
  const [currentPage, setCurrentPage] = useState<number | null>(entry?.page ?? null);

  useEffect(() => {
    if (session) return;
    void enterBook(bookId).then((judged) => {
      setSession(judged);
      setCurrentPage(judged.page);
    });
  }, [bookId, session]);

  const {
    text: recapText,
    streaming: recapStreaming,
    error: recapError,
    consume: consumeRecap,
  } = useSSE();
  const {
    text: chatAnswer,
    streaming: chatStreaming,
    error: chatError,
    consume: consumeChat,
  } = useSSE();
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

  useEffect(() => {
    if (currentPage === null) return; // 진입 판정 전에는 진도를 보내지 않는다
    void fetchPage(bookId, currentPage).then(setPage);
    // 페이지 열림이 확정된 시점에 진도를 알린다 (FR-PRG-002, NFR-PERF-005)
    sendProgress(bookId, currentPage);
  }, [bookId, currentPage]);

  // 리캡 탭을 열면 그 시점 기준점으로 받는다. 페이지가 바뀌면 다시 받는다 (FR-SVB-003)
  useEffect(() => {
    if (tab !== 'recap' || currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
  }, [tab, bookId, currentPage, consumeRecap]);

  const handleAsk = useCallback(
    (query: string) => {
      if (currentPage === null) return;
      void consumeChat(askChatbot(bookId, query, currentPage, nextSeq()));
    },
    [consumeChat, bookId, currentPage]
  );

  if (!page) return <Loading />;

  return (
    <div className="flex h-screen flex-col bg-canvas">
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
          />
        </div>

        <aside className="w-96">
          <SsabiPanel
            sessionEpoch={session?.session_epoch ?? 0}
            onTabChange={setTab}
            graph={graph}
            graphFailed={graphFailed}
            recapText={recapText}
            recapStreaming={recapStreaming}
            recapFailed={recapError !== null}
            chatAnswer={chatAnswer}
            chatStreaming={chatStreaming}
            chatError={chatError}
            onAsk={handleAsk}
          />
        </aside>
      </div>
    </div>
  );
}
