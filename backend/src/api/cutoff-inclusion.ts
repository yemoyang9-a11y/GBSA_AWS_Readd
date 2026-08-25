/**
 * 현재 페이지가 기준점(K) 안에 들어오는지 판정한다.
 *
 * K는 진도 레코드가 있으면 current_page 그대로이고, 레코드가 아예 없을 때만 0이다
 * (cutoff.service.ts — 유일한 계산 지점). 따라서 책을 한 번도 열지 않은 상태에서만
 * 이 판정이 거짓이 되어, 챗봇이 표시용 1페이지 본문을 근거로 얹지 않는다.
 */
export function pageIsIncludedInCutoff(page: number, cutoff: number): boolean {
  return page <= cutoff;
}
