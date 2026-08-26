import { act, renderHook } from '@testing-library/react';
import { useChatConversation } from './useChatConversation';
import type { SseFrame } from '../types';

const askChatbotMock = vi.fn();
vi.mock('../services/chatbotService', () => ({
  askChatbot: (...args: unknown[]) => askChatbotMock(...args),
  fetchChatConversations: vi.fn(async () => []),
  fetchChatConversationDetail: vi.fn(),
  deleteChatConversation: vi.fn(),
}));

async function* frames(...items: SseFrame[]): AsyncGenerator<SseFrame> {
  for (const item of items) yield item;
}

beforeEach(() => {
  askChatbotMock.mockReset();
  localStorage.clear();
});

/**
 * conversation_id는 백엔드 BIGINT 컬럼에서 나와 항상 문자열로 온다("279") — 숫자만
 * 믿고 typeof로 걸렀다가 conversationId가 절대 안 채워져 매 질문이 새 대화로 갈라지던
 * 버그(2026-08-25, 사용자 재보고 — "아직도 챗봇 대화가 분리되어 저장되는 문제가
 * 있어"). negative(고쳐지기 전 증상)와 positive(고친 뒤 동작)를 쌍으로 확인한다.
 */
describe('useChatConversation — conversationId 문자열 정규화', () => {
  it('positive: done 프레임의 문자열 conversation_id를 정수로 기억한다', async () => {
    askChatbotMock.mockReturnValueOnce(
      frames(
        { type: 'delta', text: '답' },
        { type: 'done', applied_cutoff: 4, conversation_id: '279' }
      )
    );
    const { result } = renderHook(() => useChatConversation('takryu'));

    await act(async () => {
      await result.current.ask('정주사가 누구야', 5, 1);
    });

    expect(result.current.conversationId).toBe(279);
  });

  it('positive: 다음 질문은 그 정수 conversationId를 그대로 실어 보낸다 — 같은 대화로 이어진다', async () => {
    askChatbotMock
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '279' }))
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '279' }));
    const { result } = renderHook(() => useChatConversation('takryu'));

    await act(async () => {
      await result.current.ask('정주사가 누구야', 5, 1);
    });
    await act(async () => {
      await result.current.ask('고태수는 뭐하는 사람이야', 5, 2);
    });

    // askChatbot(bookId, query, page, seq, conversationId, quote)
    expect(askChatbotMock).toHaveBeenNthCalledWith(
      2,
      'takryu',
      '고태수는 뭐하는 사람이야',
      5,
      2,
      279,
      undefined
    );
  });

  it('negative: conversation_id가 아예 없는 done(구경로)이면 conversationId를 건드리지 않는다', async () => {
    askChatbotMock.mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4 }));
    const { result } = renderHook(() => useChatConversation('takryu'));

    await act(async () => {
      await result.current.ask('정주사가 누구야', 5, 1);
    });

    expect(result.current.conversationId).toBeNull();
  });
});
