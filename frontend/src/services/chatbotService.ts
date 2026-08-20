/**
 * 챗봇 (R3 제공 API 소비)
 *   POST /books/:bookId/chat  SSE 스트리밍 delta/done/error (NFR-PERF-008)
 *
 * 근거 부재 문구는 delta 로 흘러온다 — 서버 상수 문구를 일반 답변과 똑같이 렌더한다.
 * 프론트가 거절 여부를 판별해 다르게 처리하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 * 호출량 상한 초과(429)는 SSE 를 열기 전 일반 JSON 으로 온다 (R3 8/20 확인) — 스트림
 * 파싱과 별도로 처리해 "답변이 시작됐다 사라지는" 화면을 만들지 않는다.
 */

import { readSseStream } from './stream';
import { API_BASE_URL, USE_MOCK } from '../utils/constants';
import { getDeviceId } from '../utils/storage';
import type { SseFrame } from '../types';

export async function* askChatbot(
  bookId: string,
  query: string,
  page: number,
  seq: number
): AsyncGenerator<SseFrame> {
  if (USE_MOCK) {
    const { mockStreamFrames, mockChatAnswer } = await import('../../mocks/server');
    yield* mockStreamFrames(mockChatAnswer(query));
    return;
  }

  const response = await fetch(`${API_BASE_URL}/books/${bookId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() ?? '' },
    body: JSON.stringify({ query, page, seq }),
  });

  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as { retry_after?: number } | null;
    const wait = body?.retry_after;
    yield {
      type: 'error',
      message: wait
        ? `질문이 너무 잦습니다. ${wait}초 뒤에 다시 시도해 주세요.`
        : '질문이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.',
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield { type: 'error', message: `chat stream failed (${response.status})` };
    return;
  }
  yield* readSseStream(response.body);
}
