/**
 * LLM 호출 재시도 로직
 *
 * NFR-AI-003: 재시도 / 타임아웃 / 폴백 전환
 *
 * @see dev-spec-R3-ai.md 2장
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
  // 네트워크 오류, 타임아웃, 429 (Too Many Requests), 5xx 서버 오류
  const retryableErrors = [
    'NetworkingError',
    'TimeoutError',
    'ThrottlingException',
    'ServiceUnavailable',
    'InternalServerError',
  ];

  const errorName = error.name || error.code || '';
  return retryableErrors.some((name) => errorName.includes(name));
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
 *   () => bedrockClient.send(command),
 *   { task: 'chatbot', modelId: 'claude-v1' }
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

/**
 * 폴백 모델 전환
 *
 * Sonnet 실패 시 Haiku로 폴백
 *
 * @param primaryModelId - 1차 모델 ID
 * @param fallbackModelId - 폴백 모델 ID
 * @param fn - 실행할 함수 (모델 ID를 인자로 받음)
 * @returns 함수 실행 결과
 *
 * @example
 * const result = await withFallback(
 *   'claude-sonnet-v1',
 *   'claude-haiku-v1',
 *   (modelId) => callBedrock(modelId, prompt)
 * );
 */
export async function withFallback<T>(
  primaryModelId: string,
  fallbackModelId: string,
  fn: (modelId: string) => Promise<T>
): Promise<T> {
  try {
    // 1차 시도: 지정된 모델
    return await fn(primaryModelId);
  } catch (error) {
    console.warn('Primary model failed, trying fallback', {
      primary: primaryModelId,
      fallback: fallbackModelId,
      error,
    });

    // 2차 시도: 폴백 모델
    try {
      const result = await fn(fallbackModelId);
      console.log('Fallback model succeeded', { fallback: fallbackModelId });
      return result;
    } catch (fallbackError) {
      console.error('Fallback model also failed', {
        fallback: fallbackModelId,
        error: fallbackError,
      });
      throw fallbackError;
    }
  }
}
