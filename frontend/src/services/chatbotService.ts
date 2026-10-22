/**
 * 챗봇 (R3 제공 API 소비)
 *   POST /books/:bookId/chat  SSE 스트리밍 delta/done/error (NFR-PERF-008)
 *
 * 답변은 근거로 확인된 부분과 확인하지 못한 부분을 구분해 delta 로 흘러온다.
 * 프론트는 이를 그대로 렌더하며 고정 거절 문구를 만들지 않는다 (FR-QNA-004 🚦).
 * 호출량 상한 초과(429)는 SSE 를 열기 전 일반 JSON 으로 온다 (R3 8/20 확인) — 스트림
 * 파싱과 별도로 처리해 "답변이 시작됐다 사라지는" 화면을 만들지 않는다.
 */

import { readSseStream } from './stream';
import { api } from './api';
import { API_BASE_URL, USE_MOCK } from '../utils/constants';
import { getDeviceId } from '../utils/storage';
import type { ChatbotConversationDetail, ChatbotConversationSummary, SseFrame } from '../types';

export async function* askChatbot(
  bookId: string,
  query: string,
  page: number,
  seq: number,
  conversationId?: number,
  quote?: string
): AsyncGenerator<SseFrame> {
  if (USE_MOCK) {
    const { mockStreamFrames, mockChatAnswer } = await import('../../mocks/server');
    yield* mockStreamFrames(mockChatAnswer(query));
    return;
  }

  const response = await fetch(`${API_BASE_URL}/books/${bookId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() ?? '' },
    body: JSON.stringify({ query, quote, page, seq, conversationId }),
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

/**
 * 대화 이력 목록 (2026-08-24). 봉인 기준점이 현재 기준점을 넘는 대화는 서버가 이미
 * 제외해서 준다 — 프론트는 받은 목록을 그대로 그린다.
 */
export async function fetchChatConversations(
  bookId: string,
  expectedPage?: number
): Promise<ChatbotConversationSummary[]> {
  if (USE_MOCK) return [];
  const { data } = await api.get<ChatbotConversationSummary[]>(
    `/books/${bookId}/chat/conversations`,
    {
      params: { expected_page: expectedPage },
    }
  );
  return data;
}

/** 대화 상세(전체 문답). 봉인되어 숨겨졌거나 존재하지 않으면 서버가 404를 준다. */
export async function fetchChatConversationDetail(
  bookId: string,
  conversationId: number,
  expectedPage?: number
): Promise<ChatbotConversationDetail> {
  const { data } = await api.get<ChatbotConversationDetail>(
    `/books/${bookId}/chat/conversations/${conversationId}`,
    { params: { expected_page: expectedPage } }
  );
  return data;
}

/** 대화 삭제 (2026-08-25, 사용자 요청). 다른 디바이스 소유이거나 존재하지 않으면 404. */
export async function deleteChatConversation(
  bookId: string,
  conversationId: number
): Promise<void> {
  await api.delete(`/books/${bookId}/chat/conversations/${conversationId}`);
}
