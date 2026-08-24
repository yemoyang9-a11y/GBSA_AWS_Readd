import { useCallback, useRef, useState } from 'react';
import type { SseFrame } from '../types';

/**
 * SSE 스트림 소비 — 리캡(R2)·챗봇(R3)이 같은 프레임을 쓰므로 훅 하나로 둘 다 받는다
 * (backend/SSE_SPEC.md, 8/20 확정).
 *
 *   delta -> 텍스트 이어붙이기 / done -> 정상 종료 / error -> 메시지 표시
 *
 * 스트리밍 도중 페이지를 넘겨도 진행 중 스트림은 유지한다 — 진행 중인 응답은 시작 시점
 * 기준점을 쓴다 (UC-27 A5, R2·R3 8/20 확인). 그래서 여기에 페이지 의존성이 없다.
 *
 * "유지한다"는 네트워크 스트림을 끊지 않는다는 뜻이지 화면에 계속 얹는다는 뜻이 아니다.
 * Reader가 페이지마다 새 consume()을 부르므로(FR-SVB-003), 이전 호출의 for-await가
 * 아직 끝나지 않은 채로 새 consume()이 시작될 수 있다 — 그러면 두 스트림의 delta가
 * 같은 text state에 번갈아 쌓여 서로 다른 기준점의 문장이 뒤섞인 채로 보인다. latestToken
 * 으로 "지금 화면에 반영해도 되는 호출"을 하나로 못박고, 낡은 호출은 상태 반영 없이
 * 끝까지 소비만 시켜 백엔드 쪽 생성·캐싱은 그대로 완료되게 둔다.
 */
export function useSSE() {
  const latestToken = useRef(0);
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
    const token = ++latestToken.current;
    setText('');
    setError(null);
    setStreaming(true);

    try {
      for await (const frame of frames) {
        // 더 새 consume()이 이미 시작됐으면 이 호출은 낡은 것이다 — 스트림은 끝까지
        // 받아서(백엔드 생성·캐싱을 그대로 두고) 화면 상태에는 더 이상 반영하지 않는다.
        if (token !== latestToken.current) continue;

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
      if (token === latestToken.current) setStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    setText('');
    setError(null);
    setConversationId(null);
  }, []);

  /**
   * "Np까지 읽음" 배지 전용 초기화. 페이지를 넘기면 그 배지가 가리키는 기준점은 더 이상
   * 지금 페이지를 설명하지 못한다 — 값을 지우지 않으면(=마지막 확인값 유지 정책, 위 주석)
   * 예전 페이지에서 확인된 숫자가 새 페이지에서도 그대로 남아 사실과 다른 숫자를 보여준다.
   * text·error·conversationId는 건드리지 않는다 — 진행 중 스트림·대화 이어가기는
   * 페이지 이동과 무관하게 유지된다(UC-27 A5).
   */
  const resetAppliedCutoff = useCallback(() => {
    setAppliedCutoff(null);
  }, []);

  return { text, streaming, error, appliedCutoff, conversationId, consume, reset, resetAppliedCutoff };
}
