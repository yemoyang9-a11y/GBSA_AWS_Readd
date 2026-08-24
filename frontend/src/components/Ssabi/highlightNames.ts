/**
 * 리캡 텍스트 안의 인물명을 찾아 굵게 표시하기 위한 순수 분할 함수.
 *
 * 2026-08-23 계획서(RecapTab Task 4)는 "식별 데이터가 없어 지어낸 판정이 된다"며 자동
 * 강조를 만들지 않기로 했다 — 하지만 그 판단은 본문 인물명 탭(FR-CHR-004, alias_index
 * 필요)과 혼동한 것이다. 이 리캡 탭은 이미 같은 화면에서 `/ssabi/graph` 로 받은
 * `GraphNode[]`(이름 + 별칭)를 갖고 있고, 그 응답은 기준점 K 이하로 이미 필터된 값이다
 * (types/ssabi.ts:3). 그 목록에 실제로 있는 이름만 굵게 표시하므로 "추측"이 아니다 —
 * 2026-08-24 사용자 피드백으로 되살렸다.
 *
 * 남는 위험은 식별이 아니라 문자열 매칭 정밀도뿐이다: 한국어 조사가 붙은 형태
 * ("초봉은")는 부분 일치로 잡힌다 — 이건 의도한 동작이다(이름 자체는 정확히 잡힌다).
 * 긴 별칭을 먼저 매칭해 짧은 별칭이 긴 별칭의 부분 문자열을 잘라먹지 않게 한다.
 */
export interface HighlightSegment {
  text: string;
  bold: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitHighlighted(text: string, names: string[]): HighlightSegment[] {
  const unique = Array.from(new Set(names.filter((n) => n.trim().length > 0)));
  if (unique.length === 0) return [{ text, bold: false }];

  // 긴 이름부터 매칭 — "정 주사"가 "정"보다 먼저 잡히게 한다.
  const sorted = unique.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'g');

  return text
    .split(pattern)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({ text: chunk, bold: sorted.includes(chunk) }));
}
