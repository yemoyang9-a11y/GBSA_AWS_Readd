import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BriefingView from './BriefingView';
import Loading from '../components/common/Loading';
import { fetchBriefing, streamRecap } from '../services/recapService';
import { useSSE } from '../hooks/useSSE';
import { nextSeq } from '../utils/seq';
import { fetchBookInfo } from '../services/bookService';
import { BOOK_ROUTES } from '../utils/routes';
import type { BriefingResponse, ChapterSummary, EntryResponse } from '../types';

/**
 * 브리핑 화면 컨테이너 — S6
 *
 * 데이터만 모아 BriefingView 에 넘긴다. 화면 분기(리캡/폴백/빈 상태)는 뷰가 판정한다.
 * 목차는 GET /info 에서 1회 받아 쓴다 — 브리핑 응답에 목차를 중복으로 싣지 않는다
 * (team-sync-r4.md §1.3, R2 확인).
 */
export default function Briefing() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const entry = (location.state as { entry?: EntryResponse } | null)?.entry;

  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);

  const {
    text: streamedRecap,
    error: recapError,
    consume: consumeRecap,
  } = useSSE();

  // 저장 리캡이 무효일 때만 부른다. 판정은 BriefingView 가 하며(utils/briefingView),
  // 첫 진입(cutoff = 0)에서는 여기까지 오지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①).
  const currentPage = briefing?.progress.current_page ?? null;

  useEffect(() => {
    void fetchBriefing(bookId).then(setBriefing);
    void fetchBookInfo(bookId).then((info) => setChapters(info.chapters));
  }, [bookId]);

  const handleFallback = useCallback(() => {
    if (currentPage === null) return;
    void consumeRecap(streamRecap(bookId, currentPage, nextSeq()));
  }, [consumeRecap, bookId, currentPage]);

  const handleContinue = useCallback(() => {
    // '마저 읽기'는 리캡 상태와 무관하게 즉시 동작한다 (UC-28 E1, FR-SPL-005 🚦).
    // 진입 판정 결과를 그대로 넘긴다 — 넘기지 않으면 읽기 화면이 시작 페이지를 몰라
    // 1페이지로 진도를 보내고, 기준점이 통째로 되감긴다 (FR-PRG-003 🚦).
    navigate(BOOK_ROUTES.reader.replace(':bookId', bookId), { state: { entry } });
  }, [navigate, bookId, entry]);

  if (!briefing) return <Loading />;

  return (
    <BriefingView
      briefing={briefing}
      chapters={chapters}
      onContinue={handleContinue}
      onRequestFallback={handleFallback}
      streamedRecap={streamedRecap}
      recapFailed={recapError !== null}
    />
  );
}
