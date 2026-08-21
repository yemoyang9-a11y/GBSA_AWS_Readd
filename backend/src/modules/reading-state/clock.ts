/**
 * 시각 원천 — 세션 30분 규칙(R6)을 테스트에서 고정 시각으로 검증하기 위한 주입점.
 *
 * @see dev-spec-R2-core.md S3, S4
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
