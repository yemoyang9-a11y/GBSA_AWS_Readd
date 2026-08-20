/**
 * 리캡 (R2 제공 API 소비)
 *   GET  /books/:bookId/briefing      저장 리캡 / null, 최상단 applied_cutoff
 *   POST /books/:bookId/recap/stream  스트리밍 폴백 (NFR-PERF-002 🚦)
 *
 * 첫 진입(cutoff = 0)은 폴백을 호출하지 않는다 (D13 ①) — 분기는 utils/briefingView 가 정한다.
 */

import { api } from './api';
import { USE_MOCK } from '../utils/constants';
import type { BriefingResponse } from '../types';

export async function fetchBriefing(bookId: string): Promise<BriefingResponse> {
  if (USE_MOCK) {
    const { mockBriefingResponse } = await import('../../mocks/server');
    return mockBriefingResponse();
  }
  const { data } = await api.get<BriefingResponse>(`/books/${bookId}/briefing`);
  return data;
}
