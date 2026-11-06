import { decideSwipe } from './swipeDecision';

const base = { width: 375, hasPrev: true, hasNext: true };

test('FR-PRG-003: 1/4 이상 왼쪽으로 밀면 다음', () =>
  expect(decideSwipe({ ...base, dx: -100, dy: 5, velocityX: -0.2 })).toBe('next'));

test('1/4 이상 오른쪽으로 밀면 이전', () =>
  expect(decideSwipe({ ...base, dx: 100, dy: 5, velocityX: 0.2 })).toBe('prev'));

test('짧고 느리면 취소', () =>
  expect(decideSwipe({ ...base, dx: -60, dy: 0, velocityX: -0.1 })).toBe('cancel'));

test('짧아도 빠르면 다음', () =>
  expect(decideSwipe({ ...base, dx: -60, dy: 0, velocityX: -1.2 })).toBe('next'));

test('빠르더라도 24px 미만이면 취소', () =>
  expect(decideSwipe({ ...base, dx: -20, dy: 0, velocityX: -2 })).toBe('cancel'));

test('마지막 페이지에서 다음은 취소', () =>
  expect(decideSwipe({ ...base, hasNext: false, dx: -200, dy: 0, velocityX: -1 })).toBe('cancel'));

test('첫 페이지에서 이전은 취소', () =>
  expect(decideSwipe({ ...base, hasPrev: false, dx: 200, dy: 0, velocityX: 1 })).toBe('cancel'));

test('세로가 더 크면 취소', () =>
  expect(decideSwipe({ ...base, dx: -120, dy: 200, velocityX: -1 })).toBe('cancel'));
