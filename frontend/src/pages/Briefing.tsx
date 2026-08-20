import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BriefingView from './BriefingView';
import Loading from '../components/common/Loading';
import { fetchBriefing } from '../services/recapService';
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

  useEffect(() => {
    void fetchBriefing(bookId).then(setBriefing);
    void fetchBookInfo(bookId).then((info) => setChapters(info.chapters));
  }, [bookId]);

  const handleFallback = useCallback(() => {
    // TODO(S6) POST /recap/stream 스트리밍 폴백 연결 — SSE 프레임은 utils/sse 가 처리한다.
    //   백엔드 501 스텁이 걷히면 붙인다 (team-sync-r4.md §1.4).
  }, []);

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
    />
  );
}
