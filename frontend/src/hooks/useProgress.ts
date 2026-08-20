/**
 * 진도 관리 훅 — 페이지 열림 확정 시 {page, seq} 발신 (FR-PRG-002, NFR-PERF-005)
 * POST /books/:bookId/progress 를 그대로 호출한다 — GET /pages 로 흡수하지 않는다.
 *   R2가 명시적으로 거절했다: 선요청 안전(API_CONTRACT #9) 위반이고, 프리페치 시
 *   열어보지 않은 페이지까지 기준점이 올라가는 경로가 생긴다 (team-sync-r4.md §1.1).
 * seq 는 utils/seq.nextSeq() 로 만든다. entry 응답을 받으면 utils/seq.resetSeq() 를
 * 먼저 호출해 서버의 리셋과 맞춘다. 페이지 내 스크롤은 이벤트를 만들지 않는다 (절대 규칙 9번)
 */
export {};
