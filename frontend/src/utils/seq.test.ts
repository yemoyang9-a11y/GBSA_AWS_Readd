import { nextSeq, resetSeq } from './seq';

/**
 * 진도 이벤트 seq — 클라이언트 단조 증가 시퀀스 (FR-PRG-002).
 * R2 확정(8/20): POST /entry 가 서버 event_seq 를 0으로 리셋하므로,
 * 프론트도 entry 응답마다 다시 시작한다 — 영속 저장하지 않는다 (team-sync-r4.md §1.6).
 */
describe('진도 이벤트 seq', () => {
  beforeEach(() => {
    resetSeq();
  });

  it('FR-PRG-002: 호출할 때마다 단조 증가한다', () => {
    expect(nextSeq()).toBe(1);
    expect(nextSeq()).toBe(2);
    expect(nextSeq()).toBe(3);
  });

  it('team-sync §1.6: resetSeq 후에는 다시 1부터 시작한다 (entry 가 서버 기준선을 0으로 되돌리므로)', () => {
    nextSeq();
    nextSeq();

    resetSeq();

    expect(nextSeq()).toBe(1);
  });

  it('localStorage 에 남기지 않는다 — 영속 저장이 필요 없어졌다', () => {
    nextSeq();
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
});
