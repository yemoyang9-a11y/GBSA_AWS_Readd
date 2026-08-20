/**
 * S2 게이트 테스트 — 진도 이벤트 + seq 순서 보장
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 5~8번
 *
 * 테스트 규약 3.2절에 따라 구현 전에 작성했다. 조항 문구를 테스트 이름에 그대로 넣는다.
 */

import { createProgressService } from '../../../src/modules/reading-state/progress.service'
import { SEED_BOOK_ID, SEED_DEVICE_ID, makeSeededFakes } from './fakes'

function serviceWith(currentPage: number, seq: number) {
  const { positions } = makeSeededFakes()
  positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: currentPage, event_seq: seq })
  return { positions, service: createProgressService({ positions }) }
}

describe('진도 이벤트 — acceptProgressEvent', () => {
  test('FR-PRG-002: seq 5 → seq 3 순으로 도착 시 저장 위치가 5로 유지', async () => {
    const { positions, service } = serviceWith(20, 5)

    await service.acceptProgressEvent(SEED_DEVICE_ID, SEED_BOOK_ID, { page: 10, seq: 3 })

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(stored?.current_page).toBe(20)
    expect(stored?.event_seq).toBe(5)
  })

  test('FR-PRG-002: seq 5 → seq 7 도착 시 7로 갱신', async () => {
    const { positions, service } = serviceWith(20, 5)

    await service.acceptProgressEvent(SEED_DEVICE_ID, SEED_BOOK_ID, { page: 25, seq: 7 })

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(stored?.current_page).toBe(25)
    expect(stored?.event_seq).toBe(7)
  })

  test('FR-PRG-002: 동일 seq 재도착은 수용하지 않는다 (더 새로운 seq만 수용)', async () => {
    const { positions, service } = serviceWith(20, 5)

    await service.acceptProgressEvent(SEED_DEVICE_ID, SEED_BOOK_ID, { page: 99, seq: 5 })

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(stored?.current_page).toBe(20)
    expect(stored?.event_seq).toBe(5)
  })

  test('첫 진입(저장 위치 없음)은 seq 무관하게 수용된다', async () => {
    const { positions } = makeSeededFakes()
    const service = createProgressService({ positions })

    await service.acceptProgressEvent(SEED_DEVICE_ID, SEED_BOOK_ID, { page: 3, seq: 1 })

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(stored?.current_page).toBe(3)
    expect(stored?.event_seq).toBe(1)
  })

  test('3.3절: 조회 요청의 (page, seq) 동봉이 진도 이벤트와 동일 처리된다', async () => {
    // 싸비·리캡·챗봇 요청에 동봉된 (page, seq)도 별도 경로가 아니라 같은
    // acceptProgressEvent를 거친다 — 함수가 하나뿐이라는 사실 자체가 이 조항의 근거다.
    const { positions, service } = serviceWith(20, 5)

    await service.acceptProgressEvent(SEED_DEVICE_ID, SEED_BOOK_ID, { page: 22, seq: 6 })

    const stored = await positions.findPosition(SEED_DEVICE_ID, SEED_BOOK_ID)
    expect(stored?.current_page).toBe(22)
    expect(stored?.event_seq).toBe(6)
  })
})
