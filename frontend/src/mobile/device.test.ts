import { isMobileDevice } from './device';

test('isMobileDevice: 짧은 변 600 미만만 모바일', () => {
  expect(isMobileDevice({ width: 375, height: 667 })).toBe(true);
  expect(isMobileDevice({ width: 932, height: 430 })).toBe(true);
  expect(isMobileDevice({ width: 600, height: 1024 })).toBe(false);
  expect(isMobileDevice({ width: 1440, height: 1000 })).toBe(false);
});
