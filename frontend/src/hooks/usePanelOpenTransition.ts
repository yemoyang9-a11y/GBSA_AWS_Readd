import { useEffect, useState } from 'react';

/**
 * 싸비 패널을 "닫히는 즉시 언마운트"에서 "닫히는 동안만 잠깐 더 마운트해 폭을 0으로
 * 줄이고, 그 다음에 언마운트"로 바꾸기 위한 훅(2026-08-24, 사용자 피드백 — 지피티
 * 워크 모드 사이드 채팅처럼 슬라이드되는 느낌을 원함).
 *
 * Reader.tsx가 닫는 즉시 언마운트했던 이유(리캡 탭이 안 보이는 채로 계속 마운트돼
 * 있으면 페이지를 넘길 때마다 쓸데없이 리캡을 재스트리밍해 분당 호출 상한에 걸림)는
 * 여전히 유효하다 — 다만 그 위험은 "닫힌 채로 오래 마운트돼 있는 것"이지 "닫히는
 * 애니메이션 한 번(수백 ms)"이 아니다. `open`이 false가 되면 `durationMs` 후에
 * 언마운트를 반영하고, 그 사이 `open`이 다시 true가 되면 타이머를 취소한다.
 */
export function usePanelOpenTransition(open: boolean, durationMs = 260): boolean {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const id = window.setTimeout(() => setRendered(false), durationMs);
    return () => window.clearTimeout(id);
  }, [open, durationMs]);

  return rendered;
}
