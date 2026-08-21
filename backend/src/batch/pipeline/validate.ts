/**
 * 생성 결과의 페이지 태깅 검증 — LLM이 인용한 페이지 번호가 그 장의 범위 안인지 확인한다.
 * 상한 강제가 아니라 생성 품질 점검용(V4 사람 검토 전 1차 스크리닝).
 */
export interface PageBoundsResult {
  ok: boolean;
  label: string;
  outOfBounds: number[];
}

export function checkPageBounds(
  label: string,
  reportedPages: number[],
  min: number,
  max: number
): PageBoundsResult {
  const outOfBounds = reportedPages.filter((p) => p < min || p > max);
  return { ok: outOfBounds.length === 0, label, outOfBounds };
}
