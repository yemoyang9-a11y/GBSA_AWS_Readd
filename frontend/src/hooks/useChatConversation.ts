import { useCallback, useEffect, useRef, useState } from 'react';
import {
  askChatbot,
  deleteChatConversation,
  fetchChatConversationDetail,
  fetchChatConversations,
} from '../services/chatbotService';
import type { ChatbotConversationSummary, ChatbotConversationTurn } from '../types';
import {
  clearActiveChatConversationId,
  getActiveChatConversationId,
  setActiveChatConversationId,
} from '../utils/storage';

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
export function useChatConversation(
  bookId: string,
  currentPage?: number | null,
  beforeHistoryRequest?: () => Promise<void>,
  onHistoryRequestFailed?: () => void
) {
  const [turns, setTurns] = useState<ChatbotConversationTurn[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(() =>
    getActiveChatConversationId(bookId)
  );
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedCutoff, setAppliedCutoff] = useState<number | null>(null);

  const [conversations, setConversations] = useState<ChatbotConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const generation = useRef(0);
  const historyRequest = useRef(0);
  const [position, setPosition] = useState({ bookId, currentPage });

  // Position identifies result lifetime; the server remains the cutoff authority.
  // Adjust before children render so no frame exposes results from an old position.
  if (position.bookId !== bookId || position.currentPage !== currentPage) {
    generation.current++;
    historyRequest.current++;
    setPosition({ bookId, currentPage });
    setTurns([]);
    setConversations([]);
    setHistoryOpen(false);
    setHistoryLoading(false);
    setStreaming(false);
    setError(null);
    setAppliedCutoff(null);
    if (position.bookId !== bookId) setConversationId(getActiveChatConversationId(bookId));
  }
  useEffect(
    () => () => {
      generation.current++;
      historyRequest.current++;
    },
    []
  );

  const ask = useCallback(
    async (query: string, page: number, seq: number, quote?: string) => {
      const token = ++generation.current;
      historyRequest.current++;
      setHistoryLoading(false);
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
          if (token !== generation.current) continue;
          if (frame.type === 'delta') {
            setTurns((prev) => {
              if (token !== generation.current) return prev;
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant')
                next[next.length - 1] = { role: 'assistant', text: last.text + frame.text };
              return next;
            });
            continue;
          }
          if (frame.type === 'error') {
            // 실패는 미노출이 원칙이다 — 받다 만 답변 조각을 남기지 않는다 (FR-SPL-005 🚦)
            setTurns((prev) => (token === generation.current ? prev.slice(0, -1) : prev));
            setError(frame.message);
            return;
          }
          // done
          if (typeof frame.applied_cutoff === 'number') setAppliedCutoff(frame.applied_cutoff);
          // conversation_id는 백엔드 BIGINT 컬럼에서 나온 값이라 pg가 문자열로 반환하고
          // ("279"), SSE JSON도 그 문자열을 그대로 싣는다 — `typeof === 'number'`로만
          // 걸러내면 항상 걸려서(문자열이니까) conversationId가 절대 채워지지 않고, 다음
          // 질문마다 "안 보냄"으로 나가 서버가 매번 새 대화를 만들었다. 서버 쪽 같은 종류의
          // 버그(routes.ts parseConversationId)는 고쳤는데, 여기 수신부는 그대로 남아 있어서
          // 결과적으로 여전히 매번 새 대화로 갈라지고 있었다(2026-08-25, 사용자 재보고 —
          // "아직도 챗봇 대화가 분리되어 저장되는 문제가 있어"). 숫자든 숫자 문자열이든
          // 정수로 정규화해서 받는다.
          if (frame.conversation_id !== undefined) {
            const parsedConversationId = Number(frame.conversation_id);
            if (Number.isInteger(parsedConversationId) && parsedConversationId > 0) {
              setConversationId(parsedConversationId);
              setActiveChatConversationId(bookId, parsedConversationId);
            }
          }
          return;
        }
      } catch {
        if (token !== generation.current) return;
        setTurns((prev) => (token === generation.current ? prev.slice(0, -1) : prev));
        setError('답변을 불러오지 못했습니다');
      } finally {
        if (token === generation.current) setStreaming(false);
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
    generation.current++;
    historyRequest.current++;
    setTurns([]);
    setConversationId(null);
    clearActiveChatConversationId(bookId);
    setError(null);
    setHistoryOpen(false);
    setHistoryLoading(false);
    setStreaming(false);
    setAppliedCutoff(null);
  }, [bookId]);

  const toggleHistory = useCallback(() => {
    const next = !historyOpen;
    setHistoryOpen(next);
    const token = ++historyRequest.current;
    if (!next) {
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    void (async () => {
      if (beforeHistoryRequest) await beforeHistoryRequest();
      if (token !== historyRequest.current) return;
      return fetchChatConversations(bookId, currentPage ?? undefined);
    })()
      .then((list) => {
        if (token === historyRequest.current && list) setConversations(list);
      })
      .catch(() => {
        if (token !== historyRequest.current) return;
        onHistoryRequestFailed?.();
        setConversations([]);
        setError('대화 목록을 불러오지 못했습니다');
      })
      .finally(() => {
        if (token === historyRequest.current) setHistoryLoading(false);
      });
  }, [bookId, currentPage, historyOpen, beforeHistoryRequest, onHistoryRequestFailed]);

  /** 지난 대화 선택 — 그 대화를 이어서 계속 물어볼 수 있다 (conversationId를 그대로 이어받음) */
  const selectConversation = useCallback(
    async (id: number) => {
      const token = ++generation.current;
      const request = ++historyRequest.current;
      setTurns([]);
      setStreaming(false);
      setAppliedCutoff(null);
      setError(null);
      setHistoryLoading(true);
      try {
        if (beforeHistoryRequest) await beforeHistoryRequest();
        if (token !== generation.current) return;
        const detail = await fetchChatConversationDetail(bookId, id, currentPage ?? undefined);
        if (token !== generation.current) return;
        setTurns(detail.turns);
        setConversationId(detail.id);
        setActiveChatConversationId(bookId, detail.id);
        setHistoryOpen(false);
        setError(null);
      } catch {
        if (token === generation.current) {
          onHistoryRequestFailed?.();
          setError('대화를 불러오지 못했습니다');
        }
      } finally {
        if (request === historyRequest.current) setHistoryLoading(false);
      }
    },
    [bookId, currentPage, beforeHistoryRequest, onHistoryRequestFailed]
  );

  /**
   * 지난 대화 삭제 (2026-08-25, 사용자 요청). 목록에서는 낙관적으로 바로 지우고
   * (실패하면 되돌림), 지금 보고 있던 대화가 삭제 대상이었으면 서버 확인 후에만
   * 새 채팅 상태로 돌린다 — 삭제가 실패했는데 화면의 대화가 먼저 사라지는 걸 막는다.
   */
  const deleteConversation = useCallback(
    async (id: number) => {
      const token = generation.current;
      const request = historyRequest.current;
      const previous = conversations;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      try {
        await deleteChatConversation(bookId, id);
        if (token !== generation.current) return;
        if (conversationId === id) {
          newChat();
        }
      } catch {
        if (token !== generation.current || request !== historyRequest.current) return;
        setConversations(previous);
        setError('대화를 삭제하지 못했습니다');
      }
    },
    [bookId, conversationId, conversations, newChat]
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
    deleteConversation,
    resetAppliedCutoff,
  };
}
