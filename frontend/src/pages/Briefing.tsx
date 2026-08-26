import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BriefingView from './BriefingView';
import Loading from '../components/common/Loading';
import { fetchBriefing, streamRecap } from '../services/recapService';
import { fetchGraph } from '../services/ssabiService';
import { sendProgress } from '../services/progressService';
import { useSSE } from '../hooks/useSSE';
import { nextSeq } from '../utils/seq';
import { fetchBookInfo } from '../services/bookService';
import { resolveCoverUrl } from '../utils/coverOverrides';
import { BOOK_ROUTES } from '../utils/routes';
import type { BriefingResponse, ChapterSummary } from '../types';

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

  useEffect(() => {
    void fetchBriefing(bookId).then(setBriefing);
    void fetchBookInfo(bookId).then((info) => {
      setChapters(info.chapters);
      setBook({ title: info.basic_info.title, author: info.basic_info.author });
    });
  }, [bookId]);

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
    navigate(BOOK_ROUTES.reader.replace(':bookId', bookId));
  }, [navigate, bookId]);

  /**
   * 목차에서 장을 고르면 그 장의 start_page로 읽기 화면을 연다 (2026-08-26).
   *
   * 읽기 화면은 서버가 저장한 위치로만 시작하므로(Reader.tsx 상단 주석 — 새로고침으로
   * 되살아난 값을 믿지 않기 위해서다), 갈 페이지를 **진도로 먼저 확정한 뒤** 넘어간다.
   * 응답을 기다리는 이유는 순서 때문이다 — 저장이 끝나기 전에 읽기 화면이 진입 판정을
   * 물으면 예전 위치가 돌아온다. 실패해도(sendProgress는 던지지 않고 null을 준다) 이동은
   * 막지 않는다. 그때는 저장된 위치에서 열리고, 목차로 다시 고르면 된다.
   *
   * start_page는 서버가 내려준 값 그대로다 — 프론트에서 페이지 산술을 하지 않는다(절대 규칙 2번).
   */
  const handleSelectChapter = useCallback(
    async (startPage: number) => {
      await sendProgress(bookId, startPage);
      navigate(BOOK_ROUTES.reader.replace(':bookId', bookId));
    },
    [navigate, bookId]
  );

  if (!briefing) return <Loading />;

  return (
    <BriefingView
      briefing={briefing}
      chapters={chapters}
      title={book?.title ?? ''}
      author={book?.author ?? ''}
      coverUrl={resolveCoverUrl(bookId, null)}
      onContinue={handleContinue}
      onRequestFallback={handleFallback}
      onSelectChapter={handleSelectChapter}
      onBack={() => navigate('/')}
      streamedRecap={streamedRecap}
      recapFailed={recapError !== null}
      recapStreaming={recapStreaming}
      characterNames={characterNames}
    />
  );
}
