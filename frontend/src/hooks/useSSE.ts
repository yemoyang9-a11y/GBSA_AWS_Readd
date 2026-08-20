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
        return; // done
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    setText('');
    setError(null);
  }, []);

  return { text, streaming, error, consume, reset };
}
