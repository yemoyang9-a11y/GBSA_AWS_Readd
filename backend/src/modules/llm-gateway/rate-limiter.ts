/**
 * LLM 호출량 상한 (Rate Limiter)
 *
 * NFR-AI-017, A1: 디바이스·도서당 분당 질의 3회
 *
 * @see dev-spec-R3-ai.md 2장
 */

/**
 * 호출 기록 저장소
 * 실제 운영에서는 Redis 등 사용
 */
const requestLog = new Map<string, number[]>();

/**
 * Rate Limit 설정
 */
const RATE_LIMIT_CONFIG = {
  maxRequests: 3,        // 최대 요청 수
  windowMs: 60 * 1000,   // 시간 윈도우 (1분)
};

/**
 * Rate Limit 체크
 *
 * @param deviceId - 디바이스 ID
 * @param bookId - 도서 ID
 * @returns { allowed: boolean, retryAfter?: number }
 *
 * @example
 * const check = checkRateLimit(deviceId, bookId);
 * if (!check.allowed) {
 *   return res.status(429).json({
 *     error: 'RATE_LIMIT',
 *     message: '분당 3회 제한을 초과했습니다',
 *     retry_after: check.retryAfter
 *   });
 * }
 */
export function checkRateLimit(
  deviceId: string,
  bookId: string
): { allowed: boolean; retryAfter?: number } {
  const key = `${deviceId}:${bookId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

  // 기존 기록 가져오기
  let timestamps = requestLog.get(key) || [];

  // 윈도우 밖의 오래된 기록 제거
  timestamps = timestamps.filter(ts => ts > windowStart);

  // 상한 체크
  if (timestamps.length >= RATE_LIMIT_CONFIG.maxRequests) {
    // 가장 오래된 요청이 윈도우를 벗어날 때까지 남은 시간
    const oldestTimestamp = timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + RATE_LIMIT_CONFIG.windowMs - now) / 1000);

    return {
      allowed: false,
      retryAfter,
    };
  }

  // 허용: 현재 시간 기록
  timestamps.push(now);
  requestLog.set(key, timestamps);

  return { allowed: true };
}

/**
 * Rate Limit 초기화 (테스트용)
 *
 * @param deviceId - 디바이스 ID (선택사항)
 * @param bookId - 도서 ID (선택사항)
 */
export function resetRateLimit(deviceId?: string, bookId?: string): void {
  if (deviceId && bookId) {
    const key = `${deviceId}:${bookId}`;
    requestLog.delete(key);
  } else {
    requestLog.clear();
  }
}

/**
 * Rate Limit 통계 조회 (모니터링용)
 *
 * @returns 현재 Rate Limit 상태
 */
export function getRateLimitStats(): {
  totalKeys: number;
  activeWindows: number;
} {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

  let activeWindows = 0;

  for (const timestamps of requestLog.values()) {
    const activeTimestamps = timestamps.filter(ts => ts > windowStart);
    if (activeTimestamps.length > 0) {
      activeWindows++;
    }
  }

  return {
    totalKeys: requestLog.size,
    activeWindows,
  };
}

/**
 * 주기적 정리 (메모리 누수 방지)
 *
 * 오래된 기록을 주기적으로 정리
 * 실제 운영에서는 Redis TTL 사용
 */
export function cleanupOldRecords(): void {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

  for (const [key, timestamps] of requestLog.entries()) {
    const activeTimestamps = timestamps.filter(ts => ts > windowStart);

    if (activeTimestamps.length === 0) {
      requestLog.delete(key);
    } else {
      requestLog.set(key, activeTimestamps);
    }
  }
}

// 5분마다 정리 실행
setInterval(cleanupOldRecords, 5 * 60 * 1000);
