/**
 * S4 게이트 테스트 — 세션 종료 스위퍼
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 16~18번 (19번은 session.service.test.ts가
 * "스윕 지연과 무관하게 entry가 30분 규칙을 직접 평가"로 이미 고정한다)
 */

import { runSweep } from '../../../src/batch/session-sweeper/sweep'
import { createCutoffService } from '../../../src/modules/reading-state/cutoff.service'
import { createRecapService } from '../../../src/modules/reading-state/recap.service'
import {
  FakeClock,
  FakeConversationHistoryRepository,
  FakeRecapCallLogger,
  FakeReadingSessionRepository,
  FakeSavedRecapRepository,
  FakeSessionRecapCacheRepository,
  SEED_BOOK_ID,
  SEED_DEVICE_ID,
  makeSeededFakes,
} from './fakes'

const T0 = new Date('2026-08-20T00:00:00Z')

function build(now: Date = T0) {
  const { positions, books } = makeSeededFakes()
  const clock = new FakeClock(now)
  const sessions = new FakeReadingSessionRepository(clock)
  const savedRecap = new FakeSavedRecapRepository()
  const sessionCache = new FakeSessionRecapCacheRepository()
  const recapLog = new FakeRecapCallLogger()
  const conversationHistory = new FakeConversationHistoryRepository()

  const cutoffService = createCutoffService({ positions, books })
  const llmStream = async function* (_task: string, _prompt: string) {
    yield '리캡 생성됨'
  }
  const recapService = createRecapService({
    content: books,
    books,
    savedRecap,
    sessionCache,
    recapLog,
    llmStream,
  })

  return {
    positions,
    books,
    sessions,
    savedRecap,
    conversationHistory,
    recapLog,
    clock,
    deps: { sessions, cutoffService, recapService, conversationHistory, clock },
  }
}

describe('세션 종료 스위퍼 — runSweep', () => {
  test('4.4.1절: 무조작 30분 경과 + recap_state=none 대상만 처리한다', async () => {
    const { positions, sessions, savedRecap, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 }) // K=15
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 31 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    const report = await runSweep(deps)

    expect(report.processed).toBe(1)
    const saved = await savedRecap.findSavedRecap(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(saved).toEqual({ cutoff_page: 15, recap_text: '리캡 생성됨' })
  })

  test('30분 미만 무조작 대상은 건드리지 않는다', async () => {
    const { positions, sessions, savedRecap, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 })
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 10 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    const report = await runSweep(deps)

    expect(report.processed).toBe(0)
    expect(await savedRecap.findSavedRecap(SEED_DEVICE_ID, SEED_BOOK_ID)).toBeNull()
  })

  test('recap_state가 이미 none이 아닌 대상(진행 중·완료)은 다시 집지 않는다', async () => {
    const { positions, sessions, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 })
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'done',
      session_epoch: 1,
    })

    const report = await runSweep(deps)

    expect(report.processed).toBe(0)
  })

  test('#16 FR-DAT-009: 멱등 — 두 번 돌려도 저장 리캡이 (디바이스, 도서)당 1건', async () => {
    const { positions, sessions, savedRecap, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 })
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    await runSweep(deps)
    // 조작이 없었으므로 recap_state는 'done'으로 남아 있다 — 두 번째 스윕은 대상에서 빠진다
    const second = await runSweep(deps)

    expect(second.processed).toBe(0)
    const all = await savedRecap.findSavedRecap(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(all).not.toBeNull() // 1건 upsert가 유지된다 (2건이 될 수 없는 스키마 — PK 자체가 보증)
  })

  test('#18 A7: 세션 종료 대상의 대화 이력은 파기하고, 리캡 호출 로그(질의 로그와 별개)는 보존한다', async () => {
    const { positions, sessions, conversationHistory, recapLog, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 })
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    await runSweep(deps)

    expect(conversationHistory.wasPurged(SEED_DEVICE_ID, SEED_BOOK_ID)).toBe(true)
    expect(recapLog.records).toHaveLength(1) // 리캡 호출 로그는 운영 기록 — 파기 대상이 아니다
  })

  test('NFR-AI-016: 리캡 생성이 실패해도 사용자 동선을 막지 않는다 — recap_state=failed, 다음 대상 계속 처리', async () => {
    const { positions, sessions, deps } = build()
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 }) // K=15 → 정상
    positions.set('device-b', 'unknown-book', { current_page: 5, event_seq: 1 }) // 도서 없음 → 스냅샷 실패
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })
    sessions.set('device-b', 'unknown-book', {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    const report = await runSweep(deps)

    expect(report.processed).toBe(1)
    expect(report.failed).toEqual(['device-b::unknown-book'])

    const failedSession = await sessions.findSession('device-b', 'unknown-book')
    expect(failedSession?.recap_state).toBe('failed')
    const okSession = await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(okSession?.recap_state).toBe('done')
  })

  test('멱등·자기 교정: 스윕 처리 후 조작이 오면 recap_state가 none으로 되돌아간다', async () => {
    const { sessions, deps } = build()
    sessions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      last_activity_at: new Date(T0.getTime() - 40 * 60_000),
      recap_state: 'none',
      session_epoch: 1,
    })

    await runSweep(deps)
    expect((await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID))?.recap_state).toBe('done')

    // 다음 조작(예: 하트비트·진도 이벤트)이 last_activity_at·recap_state를 되돌린다
    await sessions.recordActivity(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect((await sessions.findSession(SEED_DEVICE_ID, SEED_BOOK_ID))?.recap_state).toBe('none')
  })
})
