import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBriefing, streamRecap } from '../services/recapService';
import { fetchGraph } from '../services/ssabiService';
import { useSSE } from './useSSE';
import { nextSeq } from '../utils/seq';
import { fetchBookInfo } from '../services/bookService';
import { resolveCoverUrl } from '../utils/coverOverrides';
import { isMobileDevice } from '../mobile/device';
import { setPendingJump } from '../utils/pendingJump';
import { BOOK_ROUTES, bookPath } from '../utils/routes';
import type { BriefingResponse, ChapterSummary } from '../types';

export interface BriefingSessionState {
  briefing: BriefingResponse | null;
  briefingError: boolean;
  retryBriefing: () => void;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  coverUrl: string | null;
  characterNames: string[];
  streamedRecap: string;
  recapStreaming: boolean;
  recapFailed: boolean;
  requestFallback: () => void;
  continueReading: () => void;
  selectChapter: (startPage: number) => void;
  goBack: () => void;
}

/**
 * 브리핑 화면 컨테이너 — S6
 *
 * 데이터만 모아 BriefingView 에 넘긴다. 화면 분기(리캡/폴백/빈 상태)는 뷰가 판정한다.
 * 목차는 GET /info 에서 1회 받아 쓴다 — 브리핑 응답에 목차를 중복으로 싣지 않는다
 * (team-sync-r4.md §1.3, R2 확인).
 */
// FR-BRF-001 FR-SPL-005 🚦
export function useBriefingSession(bookId: string): BriefingSessionState {
  const navigate = useNavigate();

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [book, setBook] = useState<{ title: string; author: string } | null>(null);
  /** 리캡 인물명 강조(RecapTab.tsx와 동일 방식) — /ssabi/graph도 K 이하로 이미 걸러진
   *  응답이라 여기서 새로 판별하지 않는다(types/ssabi.ts:3). 조회 실패 시에도 리캡 본문
   *  자체는 그대로 보여줘야 하므로 강조만 조용히 빠진다. */
  const [characterNames, setCharacterNames] = useState<string[]>([]);

  const {
    text: streamedRecap,
    streaming: recapStreaming,
    error: recapError,
    consume: consumeRecap,
  } = useSSE();

  // 저장 리캡이 무효일 때만 부른다. 판정은 BriefingView 가 하며(utils/briefingView),
  // 첫 진입(cutoff = 0)에서는 여기까지 오지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①).
  const currentPage = briefing?.progress.current_page ?? null;

  const [briefingError, setBriefingError] = useState(false);

  const loadBriefing = useCallback(() => {
    setBriefingError(false);
    void fetchBriefing(bookId)
      .then(setBriefing)
      .catch(() => setBriefingError(true));
  }, [bookId]);

  useEffect(() => {
    loadBriefing();
    void fetchBookInfo(bookId).then((info) => {
      setChapters(info.chapters);
      setBook({ title: info.basic_info.title, author: info.basic_info.author });
    });
  }, [bookId, loadBriefing]);

  useEffect(() => {
    if (currentPage === null) return;
    let cancelled = false;
    void fetchGraph(bookId, currentPage, nextSeq())
      .then((graph) => {
        if (!cancelled) setCharacterNames(graph.nodes.flatMap((n) => [n.name, ...n.aliases]));
      })
      .catch(() => {
        if (!cancelled) setCharacterNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, currentPage]);

  const handleFallback = useCallback(() => {
    if (currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
  }, [consumeRecap, bookId, currentPage]);

  const handleContinue = useCallback(() => {
    // '마저 읽기'는 리캡 상태와 무관하게 즉시 동작한다 (UC-28 E1, FR-SPL-005 🚦).
    //
    // 진입 판정 결과를 state로 넘기지 않는다 (2026-08-26) — 읽기 화면은 이제 스스로
    // enterBook()으로 서버에 위치를 묻는다. 넘기면 그 값이 history에 남아 새로고침 때
    // 되살아나고, 읽기 화면이 낡은 페이지로 되돌아간다(Reader.tsx 상단 주석).
    // "넘기지 않으면 1페이지로 진도를 보낸다"던 옛 우려는 해당하지 않는다 — 서버가
    // 저장된 위치를 돌려주므로 시작 페이지를 모르는 상태 자체가 없다.
    navigate(BOOK_ROUTES.reader.replace(':bookId', bookId), { viewTransition: true });
  }, [navigate, bookId]);

  // FR-PRG-003 🚦
  const handleSelectChapter = useCallback(
    (startPage: number) => {
      setPendingJump(bookId, startPage);
      navigate(BOOK_ROUTES.reader.replace(':bookId', bookId), { viewTransition: true });
    },
    [navigate, bookId]
  );

  const goBack = useCallback(
    () => navigate(bookPath(bookId), isMobileDevice(window.screen) ? undefined : { viewTransition: true }),
    [navigate, bookId]
  );

  return {
    briefing,
    briefingError,
    retryBriefing: loadBriefing,
    chapters,
    title: book?.title ?? '',
    author: book?.author ?? '',
    coverUrl: resolveCoverUrl(bookId, null),
    characterNames,
    streamedRecap,
    recapStreaming,
    recapFailed: recapError !== null,
    requestFallback: handleFallback,
    continueReading: handleContinue,
    selectChapter: handleSelectChapter,
    goBack,
  };
}
