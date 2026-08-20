import type { BriefingResponse } from '../types';

export type BriefingView = { kind: 'recap' } | { kind: 'fallback' } | { kind: 'empty' };

/**
 * 브리핑 화면 분기 (FR-BRF-002~005, D13 ①)
 *
 * cutoff = 0 검사를 recap === null 검사보다 **먼저** 한다. 둘을 같은 분기로 묶으면
 * 첫 진입에서 스트리밍 폴백이 호출되어 LLM 호출 0회 설계가 깨진다 (자가 검증 20·21번).
 */
export function resolveBriefingView(briefing: BriefingResponse): BriefingView {
  if (briefing.applied_cutoff === 0) return { kind: 'empty' };
  if (briefing.recap === null) return { kind: 'fallback' };
  return { kind: 'recap' };
}
