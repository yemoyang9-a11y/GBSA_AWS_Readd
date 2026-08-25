import { pageIsIncludedInCutoff } from '../../../src/api/cutoff-inclusion';

describe('pageIsIncludedInCutoff', () => {
  test('첫 페이지(cutoff 0)는 챗봇 현재 페이지 근거에서도 예외로 제외한다', () => {
    expect(pageIsIncludedInCutoff(1, 0)).toBe(false);
  });

  test('2페이지 이상은 cutoff에 포함된 현재 페이지 근거를 사용한다', () => {
    expect(pageIsIncludedInCutoff(2, 2)).toBe(true);
    expect(pageIsIncludedInCutoff(400, 400)).toBe(true);
  });
});
