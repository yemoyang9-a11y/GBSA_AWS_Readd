import { useEffect, useState } from 'react';
import { fetchGraph as defaultFetchGraph } from '../services/ssabiService';
import { nextSeq } from '../utils/seq';
import type { GraphResponse, SsabiTab } from '../types';

/**
 * 싸비 탭 데이터 — 열려 있는 탭만 조회하고, 페이지가 바뀌면 다시 조회한다 (FR-SVB-003).
 *
 * 응답은 이미 K 이하로 걸러져 온다. 여기서 초과 여부를 판별하지 않는다 (절대 규칙 7번).
 * 조회가 실패하면 옛 데이터를 남기지 않는다 — 실패 시 미노출이 원칙이다 (FR-SPL-005 🚦).
 * 리캡·챗봇 탭은 스트리밍이라 이 훅이 다루지 않는다.
 */
export function useSsabiData({
  bookId,
  tab,
  currentPage,
  fetchGraph = defaultFetchGraph,
}: {
  bookId: string;
  tab: SsabiTab;
  currentPage: number;
  fetchGraph?: (bookId: string, page: number, seq: number) => Promise<GraphResponse>;
}): { graph: GraphResponse | null; failed: boolean } {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (tab !== 'relationship') return;

    let cancelled = false;
    setFailed(false);

    void fetchGraph(bookId, currentPage, nextSeq())
      .then((response) => {
        if (!cancelled) setGraph(response);
      })
      .catch(() => {
        if (cancelled) return;
        setGraph(null);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // currentPage 가 의존성에 있는 이유가 이 훅의 요지다 — 페이지가 바뀌면 K 가 바뀌므로
    // 열려 있는 탭을 다시 조회해야 한다 (FR-SVB-003).
  }, [bookId, tab, currentPage, fetchGraph]);

  return { graph, failed };
}
