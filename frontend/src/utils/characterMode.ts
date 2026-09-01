import { DEFAULT_CHARACTER_MODE } from './constants';

/**
 * 인물 관계도 "주요인물/전체" 토글 상태 결정 (FR-CHR-001, 2026-08-25 토글 위치 기억)
 *
 * `ssabiTab.ts` 의 `resolveSsabiTab` 과 같은 규칙이다 — 세션 경계는 서버가 준
 * session_epoch 의 **변화**로만 판정한다. 값의 크기를 비교하거나 30분 규칙을
 * 클라이언트에서 다시 계산하지 않는다 (절대 규칙 8번).
 *
 * ⚠️ 이 판정을 `useEffect` 로 미루면 안 된다. 자식(`RelationshipTab`)이 첫 렌더에
 *    `useState(initialCharacterMode ?? 'major')` 로 값을 고정하므로, 렌더가 끝난 뒤에
 *    부모가 리셋해 봐야 자식은 그것을 보지 못한다. 세션이 바뀌었는데도 이전 토글이
 *    그대로 남는 버그가 여기서 났다 (2026-09-01). 탭 기억이 같은 문제를 겪지 않은
 *    이유는 `resolveSsabiTab` 이 **렌더 중에** 값을 파생하기 때문이다.
 */
export function resolveCharacterMode({
  previousEpoch,
  currentEpoch,
  lastMode,
}: {
  previousEpoch: number | null;
  currentEpoch: number;
  lastMode: 'major' | 'all' | null;
}): 'major' | 'all' {
  const sameSession = previousEpoch !== null && previousEpoch === currentEpoch;
  if (sameSession && lastMode) return lastMode;
  return DEFAULT_CHARACTER_MODE;
}
