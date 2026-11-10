import { act, renderHook } from '@testing-library/react';
import { useChatConversation } from './useChatConversation';
import {
  askChatbot,
  fetchChatConversations,
  fetchChatConversationDetail,
} from '../services/chatbotService';
import type { ChatbotConversationDetail, ChatbotConversationSummary, SseFrame } from '../types';

vi.mock('../services/chatbotService', () => ({
  askChatbot: vi.fn(),
  fetchChatConversations: vi.fn(),
  fetchChatConversationDetail: vi.fn(),
  deleteChatConversation: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function* frames(...values: SseFrame[]): AsyncGenerator<SseFrame> {
  yield* values;
}

function summary(id: number, title: string): ChatbotConversationSummary {
  return {
    id,
    title,
    conversation_date: '2026-10-21',
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  };
}

function detail(id: number, text: string): ChatbotConversationDetail {
  return { ...summary(id, 'history'), turns: [{ role: 'assistant', text }] };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

it('hides K90 turns and history immediately on K40 and does not revive them when returning', async () => {
  vi.mocked(askChatbot).mockReturnValue(
    frames({ type: 'delta', text: 'future answer' }, { type: 'done', applied_cutoff: 90 })
  );
  vi.mocked(fetchChatConversations).mockResolvedValue([summary(9, 'future history')]);
  const { result, rerender } = renderHook(({ book, page }) => useChatConversation(book, page), {
    initialProps: { book: 'book', page: 90 },
  });
  await act(async () => {
    await result.current.ask('question', 90, 1);
  });
  await act(async () => {
    result.current.toggleHistory();
  });
  expect(result.current.turns[1].text).toBe('future answer');
  expect(result.current.conversations).toHaveLength(1);
  rerender({ book: 'book', page: 40 });
  expect(result.current.turns).toEqual([]);
  expect(result.current.conversations).toEqual([]);
  expect(result.current.historyOpen).toBe(false);
  expect(result.current.appliedCutoff).toBeNull();
  rerender({ book: 'book', page: 90 });
  expect(result.current.turns).toEqual([]);
});

it.each(['new chat', 'history selection', 'page change', 'book change'])(
  'ignores late SSE delta and done after %s',
  async (action) => {
    const gate = deferred<void>();
    async function* stream(): AsyncGenerator<SseFrame> {
      yield { type: 'delta', text: 'old answer' };
      await gate.promise;
      yield { type: 'delta', text: ' late leak' };
      yield { type: 'done', applied_cutoff: 90, conversation_id: 999 };
    }
    vi.mocked(askChatbot).mockReturnValue(stream());
    vi.mocked(fetchChatConversationDetail).mockResolvedValue(detail(3, 'selected answer'));
    const { result, rerender } = renderHook(({ book, page }) => useChatConversation(book, page), {
      initialProps: { book: 'book', page: 90 },
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.ask('question', 90, 1);
    });
    await act(async () => {
      if (action === 'new chat') result.current.newChat();
      if (action === 'history selection') await result.current.selectConversation(3);
      if (action === 'page change') rerender({ book: 'book', page: 40 });
      if (action === 'book change') rerender({ book: 'other', page: 90 });
    });
    const expected =
      action === 'history selection' ? [{ role: 'assistant', text: 'selected answer' }] : [];
    await act(async () => {
      gate.resolve();
      await pending;
    });
    expect(result.current.turns).toEqual(expected);
    expect(result.current.appliedCutoff).toBeNull();
    expect(result.current.conversationId).not.toBe(999);
    expect(result.current.streaming).toBe(false);
  }
);

it('ignores a late history list and detail after position changes', async () => {
  const list = deferred<ChatbotConversationSummary[]>();
  const pendingDetail = deferred<ChatbotConversationDetail>();
  vi.mocked(fetchChatConversations).mockReturnValue(list.promise);
  vi.mocked(fetchChatConversationDetail).mockReturnValue(pendingDetail.promise);
  const { result, rerender } = renderHook((page) => useChatConversation('book', page), {
    initialProps: 90,
  });
  act(() => result.current.toggleHistory());
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.selectConversation(3);
  });
  rerender(40);
  await act(async () => {
    list.resolve([summary(3, 'future title')]);
    pendingDetail.resolve(detail(3, 'future detail'));
    await pending;
  });
  expect(result.current.turns).toEqual([]);
  expect(result.current.conversations).toEqual([]);
  expect(result.current.historyLoading).toBe(false);
});

it('only applies the most recently selected history detail', async () => {
  const old = deferred<ChatbotConversationDetail>();
  vi.mocked(fetchChatConversationDetail)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(detail(4, 'current detail'));
  const { result } = renderHook(() => useChatConversation('book', 40));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.selectConversation(3);
  });
  await act(async () => {
    await result.current.selectConversation(4);
  });
  await act(async () => {
    old.resolve(detail(3, 'stale detail'));
    await pending;
  });
  expect(result.current.turns[0].text).toBe('current detail');
});

it('reports a rejected network stream without rejecting ask or keeping partial output', async () => {
  async function* broken(): AsyncGenerator<SseFrame> {
    yield { type: 'delta', text: 'partial' };
    throw new Error('network disconnected');
  }
  vi.mocked(askChatbot).mockReturnValue(broken());
  const { result } = renderHook(() => useChatConversation('book', 40));
  await act(async () => {
    await expect(result.current.ask('question', 40, 1)).resolves.toBeUndefined();
  });
  expect(result.current.turns).toEqual([{ role: 'user', text: 'question' }]);
  expect(result.current.error).toBeTruthy();
  expect(result.current.streaming).toBe(false);
});
