import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ReaderView from '../components/Reader/ReaderView';
import SsabiPanel from '../components/Ssabi/SsabiPanel';
import Loading from '../components/common/Loading';
import { fetchBookInfo, fetchPage } from '../services/bookService';
import { sendProgress } from '../services/progressService';
import type { EntryResponse, PageResponse, SsabiTab } from '../types';

/**
 * 읽기 화면 컨테이너 — S3
 *
 * 페이지가 열릴 때마다 진도 이벤트를 보낸다 (POST /progress, fire-and-forget).
 * GET /pages 로 흡수하지 않는다 — 선요청 안전 규칙 때문에 R2가 거절했다 (team-sync-r4.md §1.1).
 * 이동할 페이지 번호는 서버 응답의 prev_page·next_page 를 그대로 쓴다.
 */
export default function Reader() {
  const { bookId = '' } = useParams();
  const location = useLocation();
  const entry = (location.state as { entry?: EntryResponse } | null)?.entry;

  const [page, setPage] = useState<PageResponse | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  // 진입 판정이 알려준 페이지에서 시작한다. 직접 URL 로 들어온 경우 1페이지.
  const [currentPage, setCurrentPage] = useState(entry?.page ?? 1);

  useEffect(() => {
    void fetchBookInfo(bookId).then((info) => {
      const last = info.chapters[info.chapters.length - 1];
      setTotalPages(last ? last.end_page : 0);
    });
  }, [bookId]);

  useEffect(() => {
    void fetchPage(bookId, currentPage).then(setPage);
    // 페이지 열림이 확정된 시점에 진도를 알린다 (FR-PRG-002, NFR-PERF-005)
    sendProgress(bookId, currentPage);
  }, [bookId, currentPage]);

  const handleTabData = useCallback((_tab: SsabiTab, _page: number) => {
    // TODO(S4·S5) 탭별 조회 연결 — 관계도·인물 상세는 ssabiService, 리캡·챗봇은 SSE.
  }, []);

  if (!page) return <Loading />;

  return (
    <div className="flex h-screen">
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
          currentPage={page.page_no}
          sessionEpoch={entry?.session_epoch ?? 0}
          onTabDataNeeded={handleTabData}
        />
      </aside>
    </div>
  );
}
