/**
 * 진도 이벤트 수용 — seq 순서 보장 (R2, S2)
 *
 * @see dev-spec-R2-core.md S2
 * @see dev-spec-00-shared.md 2.5절, 3.3절
 *
 * 조항: FR-PRG-002 (진도 순서 보장)
 *
 * `POST /books/{b}/progress`가 받는 `{page, seq}`와, 싸비·리캡·챗봇 조회 요청에 동봉된
 * `(page, seq)`는 **같은 함수**를 거친다 (3.3절) — "페이지 넘긴 직후 싸비를 열었는데
 * 저장이 아직 안 됨" 경합을 별도 분기 없이 이 함수 하나로 닫는다.
 *
 * ⚠️ 여기서는 seq 비교만 한다. cutoff·percent 파생은 다루지 않는다 — 그건 저장 이후
 *    cutoff.service.ts가 담당한다 (FR-BRF-005 🚦, 계산 지점 단일화).
 */

import type { ProgressEvent } from '../../shared/types'
import type { ReadingPositionRepository } from './repository'

export interface ProgressServiceDeps {
  positions: ReadingPositionRepository
}

export interface ProgressService {
  /**
   * 진도 이벤트를 수용한다. 저장된 seq보다 **더 새로울 때만** 반영한다
   * (FR-PRG-002). 빠른 연속 넘김·역방향 이동에서 이벤트가 역순 도착해도
   * 저장 위치가 뒤로 밀리지 않는다. 저장 위치가 없으면(첫 진입) 무조건 수용한다.
   *
   * 비블로킹·동기 커밋 여부는 호출부(라우트 핸들러)의 책임이다 — 이 함수 자체는
   * 저장소 쓰기 1회로 끝나는 순수 판단 로직이다.
   */
  acceptProgressEvent(deviceId: string, bookId: string, event: ProgressEvent): Promise<void>
}

export function createProgressService(deps: ProgressServiceDeps): ProgressService {
  const { positions } = deps

  return {
    async acceptProgressEvent(
      deviceId: string,
      bookId: string,
      event: ProgressEvent
    ): Promise<void> {
      const stored = await positions.findPosition(deviceId, bookId)

      // FR-PRG-002 — 저장 위치가 없으면(첫 진입) 무조건 수용, 있으면 더 새로운 seq만 수용
      if (stored !== null && event.seq <= stored.event_seq) {
        return
      }

      await positions.savePosition(deviceId, bookId, {
        current_page: event.page,
        event_seq: event.seq,
      })
    },
  }
}
