/**
 * Rate Limiter 테스트
 *
 * NFR-AI-017: 디바이스·도서당 분당 3회 제한
 */

import { checkRateLimit } from '../rate-limiter';

describe('Rate Limiter - NFR-AI-017', () => {
  beforeEach(() => {
    // 테스트 간 상태 초기화는 rate-limiter 내부 구현에 따라 필요
    // 현재는 in-memory store라 테스트마다 다른 key 사용
  });

  test('NFR-AI-017: 같은 디바이스·도서 조합에서 3회까지 허용', () => {
    const deviceId = 'test-device-1';
    const bookId = 'test-book-1';

    // 1회
    const check1 = checkRateLimit(deviceId, bookId);
    expect(check1.allowed).toBe(true);

    // 2회
    const check2 = checkRateLimit(deviceId, bookId);
    expect(check2.allowed).toBe(true);

    // 3회
    const check3 = checkRateLimit(deviceId, bookId);
    expect(check3.allowed).toBe(true);
  });

  test('NFR-AI-017: 4번째 요청은 차단', () => {
    const deviceId = 'test-device-2';
    const bookId = 'test-book-2';

    // 3회 실행
    checkRateLimit(deviceId, bookId);
    checkRateLimit(deviceId, bookId);
    checkRateLimit(deviceId, bookId);

    // 4번째는 차단
    const check4 = checkRateLimit(deviceId, bookId);
    expect(check4.allowed).toBe(false);
    expect(check4.retryAfter).toBeGreaterThan(0);
  });

  test('다른 디바이스는 독립적인 제한', () => {
    const bookId = 'test-book-3';

    // device-A 3회
    checkRateLimit('device-A', bookId);
    checkRateLimit('device-A', bookId);
    checkRateLimit('device-A', bookId);

    // device-A 4번째 차단
    const checkA4 = checkRateLimit('device-A', bookId);
    expect(checkA4.allowed).toBe(false);

    // device-B는 아직 허용
    const checkB1 = checkRateLimit('device-B', bookId);
    expect(checkB1.allowed).toBe(true);
  });

  test('다른 책은 독립적인 제한', () => {
    const deviceId = 'test-device-4';

    // book-A 3회
    checkRateLimit(deviceId, 'book-A');
    checkRateLimit(deviceId, 'book-A');
    checkRateLimit(deviceId, 'book-A');

    // book-A 4번째 차단
    const checkA4 = checkRateLimit(deviceId, 'book-A');
    expect(checkA4.allowed).toBe(false);

    // book-B는 아직 허용
    const checkB1 = checkRateLimit(deviceId, 'book-B');
    expect(checkB1.allowed).toBe(true);
  });

  test('retryAfter는 초 단위 (60초 이하)', () => {
    const deviceId = 'test-device-5';
    const bookId = 'test-book-5';

    // 3회 실행
    checkRateLimit(deviceId, bookId);
    checkRateLimit(deviceId, bookId);
    checkRateLimit(deviceId, bookId);

    // 4번째 차단
    const check4 = checkRateLimit(deviceId, bookId);
    expect(check4.allowed).toBe(false);
    expect(check4.retryAfter).toBeLessThanOrEqual(60);
    expect(check4.retryAfter).toBeGreaterThan(0);
  });
});
