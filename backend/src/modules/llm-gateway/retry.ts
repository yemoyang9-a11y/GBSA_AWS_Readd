/**
 * 재시도 로직 — 임베딩 등 SDK 내장 재시도가 없는 경로 전용
 *
 * NFR-AI-003: 재시도 / 타임아웃 (D-2로 재정의 — 폴백 모델 없이 재시도만)
 *
 * @see dev-spec-R3-ai.md 2장
 * @see docs/migration.md — Phase 1 (Bedrock → Anthropic API 이관, 2026-08-29)
 *
 * ⚠️ **LLM 게이트웨이는 이제 이 파일을 쓰지 않는다.** Anthropic SDK가 재시도·타임아웃을
 *    내장하고 있어 gateway.ts는 클라이언트 옵션(maxRetries/timeout)으로 처리한다.
 *    남은 사용처는 임베딩 배치(batch/pipeline/embed.ts) 하나다.
 *
 * ⚠️ `withFallback`은 제거했다 (D-2, 2026-08-29) — Nova Lite 폴백이 Bedrock 전용이었고,
 *    폴백 모델을 두면 R10/FR-QNA-004 🚦(근거 부재 시 고정 문구 수렴)을 모델별로 다시
 *    검증해야 한다. 단일 모델 + 재시도만 남긴다.
 */

/**
 * 재시도 설정
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000, // 30초
};

/**
 * 지수 백오프 딜레이 계산
 *
 * @param attempt - 시도 횟수 (0부터 시작)
 * @returns 딜레이 시간 (밀리초)
 */
function calculateDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * 재시도 가능한 오류인지 확인
 *
 * @param error - 발생한 오류
 * @returns 재시도 가능 여부
 */
function isRetryableError(error: any): boolean {
  // HTTP 상태로 먼저 판별한다 (2026-08-29) — 예전엔 'ThrottlingException' 같은 **AWS
  // 에러 이름**만 문자열 매칭했는데, AWS를 떠나면 그 이름이 절대 안 나온다. 그대로 뒀다면
  // 모든 오류가 "재시도 불가"로 분류돼 재시도가 조용히 죽는다 — 에러는 나지만 한 번도
  // 다시 시도하지 않는, 로그만 봐서는 안 보이는 실패 모드다.
  const status = error?.status ?? error?.statusCode;
  if (typeof status === 'number') {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  // 상태 코드가 없는 연결 단계 오류 — 이름/코드로 판별한다
  const errorName = String(error?.name || error?.code || '');
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'TimeoutError', 'APIConnectionError'].some(
    (name) => errorName.includes(name)
  );
}

/**
 * 재시도 로직이 포함된 함수 래퍼
 *
 * @param fn - 실행할 함수
 * @param context - 로그용 컨텍스트 (작업 유형 등)
 * @returns 함수 실행 결과
 *
 * @example
 * const result = await withRetry(
 *   () => fetch(COHERE_EMBED_URL, { ... }),
 *   { task: 'embed', model: 'embed-v4.0' }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // 타임아웃 적용
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), RETRY_CONFIG.timeoutMs)
        ),
      ]);

      // 성공
      if (attempt > 0) {
        console.log(`Retry succeeded after ${attempt} attempts`, context);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // 재시도 불가능한 오류면 즉시 실패
      if (!isRetryableError(error)) {
        console.error('Non-retryable error', { error, context });
        throw error;
      }

      // 최대 재시도 횟수 도달
      if (attempt === RETRY_CONFIG.maxRetries) {
        console.error('Max retries reached', {
          attempts: attempt + 1,
          error,
          context,
        });
        break;
      }

      // 재시도 전 대기
      const delay = calculateDelay(attempt);
      console.warn(
        `Retrying after ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
        context
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 모든 재시도 실패
  throw new Error(`Failed after ${RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`);
}

// withFallback은 제거했다 (D-2, 2026-08-29) — 위 파일 주석 참조.
