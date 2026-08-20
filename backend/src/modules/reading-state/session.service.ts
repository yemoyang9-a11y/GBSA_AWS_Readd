/**
 * 진입 판정 + 하트비트 — 세션 30분 규칙의 서버 단독 평가 (R2, S3)
 *
 * @see dev-spec-R2-core.md S3
 * @see architecture-r1.md 4.4.1절 — 세션 종료 스위퍼와 판정 기준을 공유한다
 *
 * 조항: FR-BRF-001 (세션 30분 규칙, 브리핑 1회 경유) · FR-BRW-002 🚦 (미완비 도서 진입 거절)
 *      · R6 (세션 = 무조작 30분) · A2 (조작의 범위)
 *
 * ⚠️ 세션 판정은 클라이언트가 하지 않는다 — 이 서비스가 `last_activity_at`에서 직접
 *    평가한다. 스위퍼(S4) 처리 여부와 무관하게 독립적으로 판정하므로, 스윕 지연이
 *    브리핑 노출 여부를 흔들지 않는다 (FR-BRF-001 AC, 4.4.1절 "재진입 판정과의 분리").
 */

import { FIRST_ENTRY_PAGE } from './cutoff.service'
import type { Clock } from './clock'
import type { BookMetaReader, ReadingPositionRepository, ReadingSessionRepository } from './repository'

/** 무조작 30분 — 세션 경계 (R6, FR-DAT-009). 4.4.1절 스위퍼와 같은 기준값을 쓴다. */
const SESSION_TIMEOUT_MS = 30 * 60_000

export class BookNotReadyError extends Error {
  constructor(readonly bookId: string) {
    super(`[session] 미완비 도서는 진입을 거절한다: bookId=${bookId}`) // FR-BRW-002 🚦
  }
}

export interface EntryDecision {
  route: 'briefing' | 'reader'
  page: number
  is_new_session: boolean
  /** route와 무관하게 항상 반환한다. 값이 바뀌면 새 세션이다 (R4 CP0 회신 항목 1) */
  session_epoch: number
}

export interface SessionServiceDeps {
  positions: ReadingPositionRepository
  books: BookMetaReader
  sessions: ReadingSessionRepository
  clock: Clock
}

export interface SessionService {
  /**
   * 진입 판정. 미완비 도서는 던진다(FR-BRW-002 🚦, 실패 = 미노출 원칙과 동일한 결의 —
   * R11). 세션 30분 규칙을 평가해 브리핑/읽기 화면 라우팅을 결정하고, 판정 후
   * `last_activity_at`을 갱신한다(A2 조작 4종 중 하나).
   */
  decideEntry(deviceId: string, bookId: string): Promise<EntryDecision>

  /**
   * 화면 가시 상태의 5분 주기 하트비트. `last_activity_at`만 갱신한다 — 진도·기준점에
   * 관여하지 않는다(A2).
   */
  acceptHeartbeat(deviceId: string, bookId: string): Promise<void>

  /**
   * "조작 이벤트 수신" 공통 갱신. 진도 이벤트·리캡/챗봇 요청 등 R2가 소유하지 않는
   * 호출부(라우트 핸들러)가 자신의 처리 뒤 이 함수를 불러 세션을 살린다(4.4.1절 A2
   * "서버 도달 이벤트 4종"). 세션 판단(신규 여부)은 하지 않는다 — 그건 decideEntry뿐이다.
   */
  touchActivity(deviceId: string, bookId: string): Promise<void>
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { positions, books, sessions, clock } = deps

  return {
    async decideEntry(deviceId: string, bookId: string): Promise<EntryDecision> {
      const ready = await books.findReadiness(bookId)
      if (!ready) {
        throw new BookNotReadyError(bookId) // FR-BRW-002 🚦 — 존재하지 않는 도서도 포함
      }

      const session = await sessions.findSession(deviceId, bookId)
      const isNewSession =
        session === null ||
        clock.now().getTime() - session.last_activity_at.getTime() >= SESSION_TIMEOUT_MS // R6

      let sessionEpoch: number
      if (isNewSession) {
        await positions.resetEventSeq(deviceId, bookId) // R4 CP0 회신 항목 2
        const result = await sessions.startNewSession(deviceId, bookId)
        sessionEpoch = result.session_epoch
      } else {
        await sessions.recordActivity(deviceId, bookId)
        sessionEpoch = session.session_epoch
      }

      const stored = await positions.findPosition(deviceId, bookId)
      const page = stored?.current_page ?? FIRST_ENTRY_PAGE

      return {
        route: isNewSession ? 'briefing' : 'reader', // R6 — 브리핑은 새 세션 진입 시 1회
        page,
        is_new_session: isNewSession,
        session_epoch: sessionEpoch,
      }
    },

    async acceptHeartbeat(deviceId: string, bookId: string): Promise<void> {
      await sessions.recordActivity(deviceId, bookId) // A2 — 진도·기준점 비관여
    },

    async touchActivity(deviceId: string, bookId: string): Promise<void> {
      await sessions.recordActivity(deviceId, bookId)
    },
  }
}
