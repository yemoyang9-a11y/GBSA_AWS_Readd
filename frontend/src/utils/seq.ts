/**
 * 진도 이벤트 seq — 클라이언트 단조 증가 시퀀스 (FR-PRG-002).
 *
 * R2가 8/20 확정: POST /entry 를 받으면 서버가 event_seq 를 0으로 리셋한다.
 * 앱은 항상 entry 를 먼저 호출하므로 로컬 seq 도 그때마다 다시 시작하면 된다 —
 * localStorage 에 영속시킬 필요가 없다 (team-sync-r4.md §1.6).
 */

let current = 0;

/** entry 응답을 받은 직후 반드시 호출한다 — 서버 기준선(0)과 동기화 */
export function resetSeq(): void {
  current = 0;
}

export function nextSeq(): number {
  current += 1;
  return current;
}
