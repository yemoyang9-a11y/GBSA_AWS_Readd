import { useCallback, useState } from 'react';
import {
  askChatbot,
  fetchChatConversationDetail,
  fetchChatConversations,
} from '../services/chatbotService';
import type { ChatbotConversationSummary, ChatbotConversationTurn } from '../types';

/**
 * 챗봇 대화 이력 (2026-08-24, 사용자·R2 조율 결정)
 *
 * 클로드류 "새 채팅" + 하루(KST 자정) 단위 자동 롤오버. 롤오버 판단 자체는 서버가 하고
 * (conversation-service.ts resolveConversation), 여기서는 서버가 done 프레임에 실어 준
 * conversation_id를 그대로 다음 질문에 되돌려 보낼 뿐이다 — 프론트가 날짜 경계를
 * 스스로 계산하지 않는다(절대 규칙 2번과 같은 정신).
 *
 * 대화 중 스트리밍 답변도 turns 배열의 마지막 원소로 직접 갱신한다 — ChatbotTab은
 * turns 하나만 보고 그리면 된다.
 */
export function useChatConversation(bookId: string) {
  const [turns, setTurns] = useState<ChatbotConversationTurn[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedCutoff, setAppliedCutoff] = useState<number | null>(null);

  const [conversations, setConversations] = useState<ChatbotConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const ask = useCallback(
    async (query: string, page: number, seq: number, quote?: string) => {
      setError(null);
      setStreaming(true);
      setTurns((prev) => [...prev, { role: 'user', text: query }, { role: 'assistant', text: '' }]);

      try {
        for await (const frame of askChatbot(
          bookId,
          query,
          page,
          seq,
          conversationId ?? undefined,
          quote
        )) {
          if (frame.type === 'delta') {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { role: 'assistant', text: last.text + frame.text };
              return next;
            });
            continue;
          }
          if (frame.type === 'error') {
            // 실패는 미노출이 원칙이다 — 받다 만 답변 조각을 남기지 않는다 (FR-SPL-005 🚦)
            setTurns((prev) => prev.slice(0, -1));
            setError(frame.message);
            return;
          }
          // done
          if (typeof frame.applied_cutoff === 'number') setAppliedCutoff(frame.applied_cutoff);
          if (typeof frame.conversation_id === 'number') setConversationId(frame.conversation_id);
          return;
        }
      } finally {
        setStreaming(false);
      }
    },
    [bookId, conversationId]
  );

  /**
   * "Np까지 읽음" 배지 전용 초기화. useSSE.resetAppliedCutoff와 같은 이유 — 페이지를
   * 넘기면 이전에 확인된 숫자가 지금 페이지를 더 이상 설명하지 못한다. turns·conversationId는
   * 그대로 둔다 — 대화 이어가기는 페이지 이동과 무관하다.
   */
  const resetAppliedCutoff = useCallback(() => {
    setAppliedCutoff(null);
  }, []);

  /** "새 채팅" — conversationId를 비운다. 다음 질문이 서버에 새 대화로 잡힌다 */
  const newChat = useCallback(() => {
    setTurns([]);
    setConversationId(null);
    setError(null);
    setHistoryOpen(false);
  }, []);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next) {
        setHistoryLoading(true);
        void fetchChatConversations(bookId)
          .then(setConversations)
          .catch(() => setConversations([]))
          .finally(() => setHistoryLoading(false));
      }
      return next;
    });
  }, [bookId]);

  /** 지난 대화 선택 — 그 대화를 이어서 계속 물어볼 수 있다 (conversationId를 그대로 이어받음) */
  const selectConversation = useCallback(
    async (id: number) => {
      setHistoryLoading(true);
      try {
        const detail = await fetchChatConversationDetail(bookId, id);
        setTurns(detail.turns);
        setConversationId(detail.id);
        setHistoryOpen(false);
        setError(null);
      } catch {
        setError('대화를 불러오지 못했습니다');
      } finally {
        setHistoryLoading(false);
      }
    },
    [bookId]
  );

  return {
    turns,
    conversationId,
    streaming,
    error,
    appliedCutoff,
    conversations,
    historyOpen,
    historyLoading,
    ask,
    newChat,
    toggleHistory,
    selectConversation,
    resetAppliedCutoff,
  };
}
