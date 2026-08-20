/**
 * 표시 포맷.
 *
 * 여기서 파생값을 만들지 않는다 — percent 도 cutoff 도 서버가 준 값을 문자열로 바꾸기만 한다
 * (절대 규칙 2번, FR-BRF-005 🚦). 반올림은 "계산"이 아니라 "표시 규칙"이다 — 원본 나눗셈은
 * 서버(기준점 결정기)에서만 하고, 여기서는 그 결과를 정수로 반올림해 보여주기만 한다.
 */

/** 읽기 화면의 "12 / 340". 진도 바는 읽기 화면에 두지 않는다 (FR-PRG-004) */
export function formatPageIndicator(currentPage: number, totalPages: number): string {
  return `${currentPage} / ${totalPages}`;
}

/**
 * 서버가 내려준 percent 를 정수로 반올림해 표시한다 (8/20 팀 결정, team-sync-r4.md §4.9).
 * 첫 진입은 서버가 1/total_pages(예: 0.2%)를 그대로 내려보내는데, 반올림하면 "0%"로 보여
 * architecture-r1.md 4.1절의 서술과 자연히 맞는다 — 첫 진입을 특별 취급하는 분기가 없다.
 */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}
