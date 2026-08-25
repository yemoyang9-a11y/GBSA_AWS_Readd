/**
 * 챗봇 답변에 섞여 오는 "**굵게**" 마크다운만 파싱한다(2026-08-25, 사용자 요청 —
 * 별표가 지워지지 않고 글자 그대로 보이던 문제). 챗봇 답변 전용의 좁은 파서다 —
 * 헤더·리스트·링크 같은 마크다운 전체 문법을 다룰 필요가 없어 라이브러리를 새로
 * 들이지 않는다. highlightNames.ts의 splitHighlighted와 같은 결(순수 분할 함수)로 뒀다.
 */
export interface BoldSegment {
  text: string;
  bold: boolean;
}

export function splitMarkdownBold(text: string): BoldSegment[] {
  const pattern = /\*\*(.+?)\*\*/g;
  const segments: BoldSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), bold: false });
    segments.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false });

  return segments.length > 0 ? segments : [{ text, bold: false }];
}
