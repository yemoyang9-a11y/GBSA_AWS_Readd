import { describe, expect, it } from 'vitest';
import { splitHighlighted } from './highlightNames';

describe('splitHighlighted', () => {
  it('목록에 없는 텍스트는 통째로 하나의 비강조 조각이다', () => {
    expect(splitHighlighted('정 주사는 미두장에 갔다.', [])).toEqual([
      { text: '정 주사는 미두장에 갔다.', bold: false },
    ]);
  });

  it('이름과 일치하는 부분만 bold:true 로 분리한다', () => {
    const result = splitHighlighted('정 주사는 미두장에 갔다.', ['정 주사']);
    expect(result).toEqual([
      { text: '정 주사', bold: true },
      { text: '는 미두장에 갔다.', bold: false },
    ]);
  });

  it('긴 이름을 먼저 매칭해 짧은 이름이 잘라먹지 않는다', () => {
    const result = splitHighlighted('정 주사는 주사를 좋아한다.', ['정 주사', '주사']);
    expect(result).toEqual([
      { text: '정 주사', bold: true },
      { text: '는 ', bold: false },
      { text: '주사', bold: true },
      { text: '를 좋아한다.', bold: false },
    ]);
  });

  it('같은 이름이 여러 번 나오면 전부 강조한다', () => {
    const result = splitHighlighted('초봉은 초봉이라 불렸다.', ['초봉']);
    expect(result.filter((s) => s.bold)).toHaveLength(2);
  });

  it('빈 문자열 이름은 무시한다', () => {
    const result = splitHighlighted('정 주사', ['', '정 주사']);
    expect(result).toEqual([{ text: '정 주사', bold: true }]);
  });
});
