/**
 * 챗봇 (R3 제공 API 소비)
 *   POST /books/:bookId/chat  SSE 스트리밍 delta/done/error (NFR-PERF-008, backend/SSE_SPEC.md)
 *
 * 근거 부재 문구는 delta 로 흘러온다 — 서버 상수 문구를 일반 답변과 똑같이 렌더한다.
 * 프론트가 거절 여부를 판별해 다르게 처리하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 * 429(RATE_LIMIT)는 SSE 를 열기 전 일반 JSON 으로 온다 — 스트림 파싱과 별도로 처리한다.
 * done 프레임에 applied_cutoff 가 실릴지는 아직 R3 확인 전이다 — types/index.ts 의
 * SseDoneFrame.applied_cutoff 는 optional 로 둔 상태 (team-sync-r4.md §3.1·§4.2)
 */
export {};
