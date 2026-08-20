import { formatPageIndicator, formatPercent } from './format';

/**
 * 프론트 불변식 — 표시 함수는 파생값을 만들지 않는다 (절대 규칙 2번, FR-BRF-005 🚦).
 */
describe('표시 포맷', () => {
  it('FR-PRG-004: 읽기 화면 표기는 "현재 / 전체" 형식이다', () => {
    expect(formatPageIndicator(12, 340)).toBe('12 / 340');
  });

  it('FR-BRF-005 🚦: percent 는 서버가 준 값을 정수로 반올림해 표시한다 (재계산 아닌 표시 규칙)', () => {
    expect(formatPercent(23.5)).toBe('24%');
  });

  it('team-sync-r4.md §4.9: 첫 진입 0.2% 는 반올림으로 "0%" 가 된다 — 특별 분기 없이', () => {
    expect(formatPercent(0.2)).toBe('0%');
  });
});
