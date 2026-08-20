import { useEffect } from 'react';
import { sendHeartbeat } from '../services/progressService';
import { HEARTBEAT_INTERVAL_MS } from '../utils/constants';

/**
 * 하트비트 — 5분 주기로 마지막 조작 시각만 갱신한다 (A2).
 *
 * 진도·기준점에 관여하지 않는다. 그래서 `seq` 를 만들지도 보내지도 않는다 — 실수로
 * 진도 채널에 끼어들면 기준점이 움직인다.
 *
 * **화면이 보이는 동안만 보낸다.** 이건 최적화가 아니라 정확성 문제다. 백그라운드 탭이
 * 계속 하트비트를 보내면 무조작 30분 판정이 영원히 나지 않아 스위퍼가 세션을 닫지 못하고,
 * 세션 종료 시 만들어지는 저장 리캡(FR-DAT-009)이 아예 생성되지 않는다. 그러면 다음 진입마다
 * 브리핑이 실시간 폴백을 타게 되어 LLM 호출이 늘어난다.
 *
 * 마운트 직후에는 보내지 않는다 — 진입 판정(POST /entry)이 방금 조작 시각을 갱신했다.
 */
export function useHeartbeat({
  bookId,
  send = sendHeartbeat,
  intervalMs = HEARTBEAT_INTERVAL_MS,
}: {
  bookId: string;
  send?: (bookId: string) => void;
  intervalMs?: number;
}): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => send(bookId), intervalMs);
    };

    const syncWithVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    syncWithVisibility();
    document.addEventListener('visibilitychange', syncWithVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', syncWithVisibility);
    };
  }, [bookId, send, intervalMs]);
}
