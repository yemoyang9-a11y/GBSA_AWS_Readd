import { isMobileDevice } from './device';

test('isMobileDevice: 짧은 변 600 미만만 모바일', () => {
  expect(isMobileDevice({ width: 375, height: 667 })).toBe(true);
  expect(isMobileDevice({ width: 932, height: 430 })).toBe(true);
  expect(isMobileDevice({ width: 600, height: 1024 })).toBe(false);
  expect(isMobileDevice({ width: 1440, height: 1000 })).toBe(false);
});

test('isMobileDevice: 화면 크기를 알 수 없으면(0) 모바일로 보지 않는다', () => {
  expect(isMobileDevice({ width: 0, height: 0 })).toBe(false);
});
