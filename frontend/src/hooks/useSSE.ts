import { useCallback, useState } from 'react';
import type { SseFrame } from '../types';

/**
 * SSE 스트림 소비 — 리캡(R2)·챗봇(R3)이 같은 프레임을 쓰므로 훅 하나로 둘 다 받는다
 * (backend/SSE_SPEC.md, 8/20 확정).
 *
 *   delta -> 텍스트 이어붙이기 / done -> 정상 종료 / error -> 메시지 표시
 *
 * 스트리밍 도중 페이지를 넘겨도 진행 중 스트림은 유지한다 — 진행 중인 응답은 시작 시점
 * 기준점을 쓴다 (UC-27 A5, R2·R3 8/20 확인). 그래서 여기에 페이지 의존성이 없다.
 */
export function useSSE() {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * done 프레임이 실어 온 적용된 기준점. 프론트가 계산한 값이 아니라 서버가 확인해 준
   * 값이므로 표시에 써도 절대 규칙 2번과 부딪히지 않는다 — 마지막으로 받은 값을 유지하고,
   * 다음 요청이 시작돼도(consume 재호출) 새 done 이 올 때까지는 지우지 않는다.
   */
  const [appliedCutoff, setAppliedCutoff] = useState<number | null>(null);
  /**
   * done 프레임이 실어 온 대화 ID (챗봇 전용, 2026-08-24 대화 이력 기능). 다음 질문을
   * 이 값과 함께 보내면 같은 대화로 이어진다 — "새 채팅"은 reset()으로 이 값을 비운다.
   */
  const [conversationId, setConversationId] = useState<number | null>(null);

  const consume = useCallback(async (frames: AsyncGenerator<SseFrame>) => {
    setText('');
    setError(null);
    setStreaming(true);

    try {
      for await (const frame of frames) {
        if (frame.type === 'delta') {
          setText((previous) => previous + frame.text);
          continue;
        }
        if (frame.type === 'error') {
          // 실패는 미노출이 원칙이다 — 받다 만 조각을 남기지 않는다 (FR-SPL-005 🚦)
          setText('');
          setError(frame.message);
          return;
        }
        // done
        if (typeof frame.applied_cutoff === 'number') {
          setAppliedCutoff(frame.applied_cutoff);
        }
        if (typeof frame.conversation_id === 'number') {
          setConversationId(frame.conversation_id);
        }
        return;
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    setText('');
    setError(null);
    setConversationId(null);
  }, []);

  return { text, streaming, error, appliedCutoff, conversationId, consume, reset };
}
