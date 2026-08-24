/**
 * S3 게이트 테스트 — 진입 판정 + 하트비트
 *
 * 근거: dev-spec-R2-core.md S3 · architecture-r1.md 4.4.1절
 * S3는 4.5절 자가 검증 표에 전용 항목이 없다 — S3 본문·FR-BRF-001 AC·FR-BRW-002·R6·A2를
 * 근거로 직접 작성했다(테스트 규약 3.2절 "게이트 조항이 걸린 로직은 구현 전에 테스트").
 */

import {
  createSessionService,
  BookNotReadyError,
} from '../../../src/modules/reading-state/session.service';
import {
  FakeClock,
  FakeReadingSessionRepository,
  SEED_BOOK_ID,
  SEED_DEVICE_ID,
  makeSeededFakes,
} from './fakes';

const T0 = new Date('2026-08-20T00:00:00Z');

function build(now: Date = T0) {
  const { positions, books } = makeSeededFakes();
  const clock = new FakeClock(now);
  const sessions = new FakeReadingSessionRepository(clock);
  const service = createSessionService({ positions, books, sessions, clock });
  return { positions, books, sessions, clock, service };
}

describe('진입 판정 — decideEntry', () => {
  test('FR-BRW-002 🚦: 미완비 도서는 진입을 거절한다', async () => {
    const { books, service } = build();
    books.set('not-ready-book', { total_pages: 30, ready: false, chapters: [] });

    await expect(service.decideEntry(SEED_DEVICE_ID, 'not-ready-book')).rejects.toBeInstanceOf(
      BookNotReadyError
    );
  });

  test('R6: 첫 진입(세션 레코드 없음)은 새 세션이며 브리핑으로 라우팅한다', async () => {
    const { service } = build();

    const decision = await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(decision.route).toBe('briefing');
    expect(decision.is_new_session).toBe(true);
    expect(decision.page).toBe(1);
    expect(decision.session_epoch).toBe(1);
  });

  test('R6: 마지막 조작으로부터 30분 미만이면 같은 세션 — reader로 라우팅', async () => {
    const { sessions, service } = build();
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 29 * 60_000),
      recap_state: 'none',
      session_epoch: 3,
    });

    const decision = await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(decision.route).toBe('reader');
    expect(decision.is_new_session).toBe(false);
    expect(decision.session_epoch).toBe(3);
  });

  test('R6: 마지막 조작으로부터 30분 이상 무조작이면 새 세션 — briefing으로 라우팅, epoch 증가', async () => {
    const { sessions, service } = build();
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 30 * 60_000),
      recap_state: 'none',
      session_epoch: 3,
    });

    const decision = await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(decision.route).toBe('briefing');
    expect(decision.is_new_session).toBe(true);
    expect(decision.session_epoch).toBe(4);
  });

  test('세션 epoch는 route와 무관하게 항상 반환된다 (R4 CP0 회신 항목 1)', async () => {
    const { sessions, service } = build();
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: T0,
      recap_state: 'none',
      session_epoch: 5,
    });

    const decision = await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(decision.route).toBe('reader');
    expect(decision.session_epoch).toBe(5);
  });

  test('R4 CP0 회신 항목 2: 새 세션 진입은 저장된 event_seq를 0으로 리셋한다', async () => {
    const { positions, sessions, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 12, event_seq: 99 });
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 31 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    });

    await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(stored?.event_seq).toBe(0);
    expect(stored?.current_page).toBe(12); // 페이지는 그대로 — seq만 리셋
  });

  test('같은 세션 안에서 다시 진입해도(새로고침 등) event_seq는 똑같이 리셋된다', async () => {
    // 버그 수정(2026-08-24, 실사용 중 발견): 프론트(utils/seq.ts)는 "POST /entry를
    // 받으면 서버가 event_seq를 0으로 리셋한다"(R2 8/20 확정, 새 세션 여부와 무관)고
    // 가정하고 로컬 seq를 매번 0부터 다시 센다. 예전엔 여기서 isNewSession일 때만
    // 리셋해서, 같은 세션 안에서 새로고침 등으로 /entry가 다시 불리면 프론트의(0부터
    // 재시작한) seq가 서버에 남은 더 큰 event_seq보다 항상 작아져 이후 모든 진도·챗봇·
    // 리캡 요청이 FR-PRG-002의 "더 새로운 seq만 수용" 규칙에 막혀 조용히 버려졌다 —
    // 화면은 페이지가 넘어가는데 저장된 위치·기준점(K)은 그 시점에 영원히 멈추는
    // 증상으로 나타났다.
    const { positions, sessions, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 12, event_seq: 99 });
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 5 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    });

    await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(stored?.event_seq).toBe(0);
    expect(stored?.current_page).toBe(12); // 페이지는 그대로 — seq만 리셋
  });

  test('진입 판정 후 last_activity_at이 갱신된다 (4.4.1절 조작 4종 중 하나)', async () => {
    const { sessions, service } = build();

    await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    const session = await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(session?.last_activity_at).toEqual(T0);
    expect(session?.recap_state).toBe('none');
  });

  test('진입 판정은 recap_state를 none으로 되돌린다 (세션이 pending이던 상태에서 재진입)', async () => {
    const { sessions, service } = build();
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'pending',
      session_epoch: 1,
    });

    await service.decideEntry(SEED_DEVICE_ID, SEED_BOOK_ID);

    const session = await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(session?.recap_state).toBe('none');
  });
});

describe('하트비트 — acceptHeartbeat (A2)', () => {
  test('가시 하트비트는 last_activity_at만 갱신한다 — 진도·기준점 비관여', async () => {
    const { positions, sessions, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 7, event_seq: 3 });
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 20 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    });

    await service.acceptHeartbeat(SEED_DEVICE_ID, SEED_BOOK_ID);

    const session = await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(session?.last_activity_at).toEqual(T0);

    const position = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(position?.current_page).toBe(7); // 하트비트는 진도를 바꾸지 않는다
    expect(position?.event_seq).toBe(3);
  });

  test('하트비트는 세션 epoch를 바꾸지 않는다 (세션 판정은 서버가 진입 시점에만 한다)', async () => {
    const { sessions, service } = build();
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 20 * 60_000),
      recap_state: 'none',
      session_epoch: 2,
    });

    await service.acceptHeartbeat(SEED_DEVICE_ID, SEED_BOOK_ID);

    const session = await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(session?.session_epoch).toBe(2);
  });
});
