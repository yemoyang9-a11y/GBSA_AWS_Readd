/**
 * 진도·세션 (R2 제공 API 소비)
 *   POST /books/:bookId/entry      진입 판정 (FR-BRF-001). 응답 즉시 resetSeq() 를 부른다
 *   POST /books/:bookId/progress   진도 이벤트, fire-and-forget (NFR-PERF-005)
 *   POST /books/:bookId/heartbeat  5분 주기 (A2)
 *
 * 프론트는 기준점을 계산하지도 보내지도 않는다 (절대 규칙 2·8번).
 * 진도 이벤트를 GET /pages 로 흡수하지 않는다 — R2 거절 확정 (team-sync-r4.md §1.1).
 */

import { api } from './api';
import { USE_MOCK } from '../utils/constants';
import { nextSeq, resetSeq } from '../utils/seq';
import type { EntryResponse } from '../types';

export async function enterBook(bookId: string): Promise<EntryResponse> {
  const response = await (async () => {
    if (USE_MOCK) {
      const { mockEntry } = await import('../../mocks/server');
      return mockEntry();
    }
    const { data } = await api.post<EntryResponse>(`/books/${bookId}/entry`, {});
    return data;
  })();

  // 서버가 event_seq 를 0으로 되돌리므로 로컬 시퀀스도 함께 맞춘다 (team-sync-r4.md §1.6)
  resetSeq();
  return response;
}

/** 페이지 열림이 확정될 때 호출한다. 응답을 기다리지 않는다 — 넘김을 막지 않는다 */
export function sendProgress(bookId: string, page: number): void {
  const event = { page, seq: nextSeq() };

  if (USE_MOCK) {
    void import('../../mocks/server').then(({ mockRecordProgress }) => mockRecordProgress(page));
    return;
  }
  void api.post(`/books/${bookId}/progress`, event).catch(() => {
    // fire-and-forget — 실패해도 페이지 넘김을 막지 않는다 (NFR-PERF-005)
  });
}

export function sendHeartbeat(bookId: string): void {
  if (USE_MOCK) return;
  void api.post(`/books/${bookId}/heartbeat`, { timestamp: new Date().toISOString() }).catch(() => {
    // 조작 시각 갱신 전용 — 실패가 화면에 영향을 주지 않는다 (A2)
  });
}
