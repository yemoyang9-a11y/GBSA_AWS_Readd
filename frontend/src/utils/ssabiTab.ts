import type { SsabiTab } from '../types';
import { DEFAULT_SSABI_TAB } from './constants';

/**
 * 싸비 탭 상태 결정 (FR-SVB-002·004)
 *
 * 세션 경계는 서버가 준 session_epoch 의 **변화**로만 판정한다. 값의 크기를 비교하거나
 * 30분 규칙을 클라이언트에서 다시 계산하지 않는다 (절대 규칙 8번, R4 자가 검증 17번).
 * epoch 은 R2가 entry 응답에 항상 실어 준다 — route 와 무관하게 (team-sync-r4.md §1.5).
 */
export function resolveSsabiTab({
  previousEpoch,
  currentEpoch,
  lastTab,
}: {
  previousEpoch: number | null;
  currentEpoch: number;
  lastTab: SsabiTab | null;
}): SsabiTab {
  const sameSession = previousEpoch !== null && previousEpoch === currentEpoch;
  if (sameSession && lastTab) return lastTab;
  return DEFAULT_SSABI_TAB;
}
