/**
 * 공통 타입 + 재수출.
 * 출처: docs/api/API_CONTRACT.md (CP0 동결 계약) + backend/SSE_SPEC.md (8/20 확정) + team-sync-r4.md
 */

export * from './book';
export * from './progress';
export * from './ssabi';

/** 공통 에러 응답 (API_CONTRACT.md '에러 응답'). 코드는 전부 대문자 상수 (R2 확인, 8/20) */
export interface ApiError {
  error: ApiErrorCode;
  message: string;
  /** RATE_LIMIT 일 때만 (NFR-AI-017) */
  retry_after?: number;
}

export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMIT'
  | 'INTERNAL_ERROR'
  | 'BOOK_NOT_READY';

/**
 * SSE 프레임 — 리캡(R2)·챗봇(R3)이 같은 형식을 쓴다 (backend/SSE_SPEC.md, 8/20 확정).
 *
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done","applied_cutoff":79}   ← applied_cutoff 는 리캡(R2) 확정, 챗봇(R3) 확인 대기
 *   data: {"type":"error","message":"..."}
 *
 * done 프레임을 받아야 정상 종료로 처리한다 — 없으면 연결 끊김과 구분할 수 없다.
 * 근거 부재 거절 문구도 delta 로 흘러온다. 프론트는 error 여부만 보고, 텍스트 내용으로
 * 거절인지 판별하지 않는다 (절대 규칙 7번).
 */
export type SseFrame = SseDeltaFrame | SseDoneFrame | SseErrorFrame;

export interface SseDeltaFrame {
  type: 'delta';
  text: string;
}

export interface SseDoneFrame {
  type: 'done';
  /**
   * 응답 payload 의 페이지 값 필드 (NFR-OBS-003). 리캡 스트림은 R2가 8/20 확정 —
   * 항상 온다. 챗봇 스트림은 R3 확인 전이라 아직 optional 로 둔다 (team-sync §3.1·§4.2).
   */
  applied_cutoff?: number;
}

export interface SseErrorFrame {
  type: 'error';
  message: string;
}
