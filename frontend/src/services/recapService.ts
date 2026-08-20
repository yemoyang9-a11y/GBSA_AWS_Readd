/**
 * 리캡 (R2 제공 API 소비)
 *   GET  /books/:bookId/briefing      저장 리캡 / null, 최상단 applied_cutoff
 *   POST /books/:bookId/recap/stream  스트리밍 폴백 (NFR-PERF-002 🚦)
 *
 * 첫 진입(cutoff = 0)은 폴백을 호출하지 않는다 (D13 ①) — 분기는 utils/briefingView 가 정한다.
 * 스트리밍 중 페이지가 바뀌어도 끊지 않는다. 진행 중인 응답은 시작 시점 기준점을 유지한다
 * (UC-27 A5, R2 8/20 확인).
 */

import { api } from './api';
import { readSseStream } from './stream';
import { API_BASE_URL, USE_MOCK } from '../utils/constants';
import { getDeviceId } from '../utils/storage';
import type { BriefingResponse, SseFrame } from '../types';

export async function fetchBriefing(bookId: string): Promise<BriefingResponse> {
  if (USE_MOCK) {
    const { mockBriefingResponse } = await import('../../mocks/server');
    return mockBriefingResponse();
  }
  const { data } = await api.get<BriefingResponse>(`/books/${bookId}/briefing`);
  return data;
}

/** 저장 리캡이 무효일 때만 부른다. 프레임은 챗봇과 같은 형식이다 */
export async function* streamRecap(
  bookId: string,
  page: number,
  seq: number
): AsyncGenerator<SseFrame> {
  if (USE_MOCK) {
    const { mockStreamFrames, mockRecapText } = await import('../../mocks/server');
    yield* mockStreamFrames(mockRecapText());
    return;
  }

  // axios 는 브라우저에서 스트림 본문을 주지 않으므로 이 경로만 fetch 를 쓴다
  const response = await fetch(`${API_BASE_URL}/books/${bookId}/recap/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() ?? '' },
    body: JSON.stringify({ page, seq }),
  });

  if (!response.ok || !response.body) {
    yield { type: 'error', message: `recap stream failed (${response.status})` };
    return;
  }
  yield* readSseStream(response.body);
}
