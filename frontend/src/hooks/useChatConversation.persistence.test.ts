import { act, renderHook } from '@testing-library/react';
import type { SseFrame } from '../types';
import { useChatConversation } from './useChatConversation';

const askChatbotMock = vi.fn();

vi.mock('../services/chatbotService', () => ({
  askChatbot: (...args: unknown[]) => askChatbotMock(...args),
  deleteChatConversation: vi.fn(),
  fetchChatConversationDetail: vi.fn(),
  fetchChatConversations: vi.fn(async () => []),
}));

async function* frames(...items: SseFrame[]): AsyncGenerator<SseFrame> {
  for (const item of items) yield item;
}

describe('useChatConversation active session persistence', () => {
  beforeEach(() => {
    askChatbotMock.mockReset();
    localStorage.clear();
  });

  it('sends the last conversation id after the reader remounts', async () => {
    askChatbotMock
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '279' }))
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '279' }));
    const first = renderHook(() => useChatConversation('takryu'));

    await act(async () => {
      await first.result.current.ask('first question', 5, 1);
    });
    first.unmount();

    const second = renderHook(() => useChatConversation('takryu'));
    await act(async () => {
      await second.result.current.ask('question after re-entry', 5, 2);
    });

    expect(askChatbotMock).toHaveBeenNthCalledWith(
      2,
      'takryu',
      'question after re-entry',
      5,
      2,
      279,
      undefined
    );
  });

  it('starts a new session after new chat even when the reader remounts', async () => {
    askChatbotMock
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '279' }))
      .mockReturnValueOnce(frames({ type: 'done', applied_cutoff: 4, conversation_id: '280' }));
    const first = renderHook(() => useChatConversation('takryu'));

    await act(async () => {
      await first.result.current.ask('first question', 5, 1);
    });
    act(() => first.result.current.newChat());
    first.unmount();

    const second = renderHook(() => useChatConversation('takryu'));
    await act(async () => {
      await second.result.current.ask('first question in new chat', 5, 2);
    });

    expect(askChatbotMock).toHaveBeenNthCalledWith(
      2,
      'takryu',
      'first question in new chat',
      5,
      2,
      undefined,
      undefined
    );
  });
});
