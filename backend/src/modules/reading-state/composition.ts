/**
 * R2 조립 루트 — Postgres 어댑터 + 서비스를 한 곳에서 엮는다 (CP3 실데이터 전환)
 *
 * API 라우트(api/routes.ts)와 세션 종료 스위퍼 스크립트(batch/session-sweeper/run-sweep.ts)
 * 양쪽이 이 함수를 통해 같은 조립 규칙으로 서비스를 얻는다 — 두 곳에서 배선을 따로
 * 하면 리포지토리 구현이 갈릴 위험이 생긴다.
 */

import type { Pool } from 'pg'
import { stream as llmStream } from '../llm-gateway/gateway'
import { systemClock } from './clock'
import { createCutoffService } from './cutoff.service'
import { createProgressService } from './progress.service'
import { createSessionService } from './session.service'
import { createBriefingService } from './briefing.service'
import { createRecapService } from './recap.service'
import type { QueryClient } from './pg-repository'
import {
  createPgBookContentReader,
  createPgConversationHistoryRepository,
  createPgReadingPositionRepository,
  createPgReadingSessionRepository,
  createPgRecapCallLogger,
  createPgSavedRecapRepository,
  createPgSessionRecapCacheRepository,
} from './pg-repository'
import type { ReadingSessionRepository, ConversationHistoryRepository } from './repository'

export interface ReadingStateServices {
  cutoffService: ReturnType<typeof createCutoffService>
  progressService: ReturnType<typeof createProgressService>
  sessionService: ReturnType<typeof createSessionService>
  briefingService: ReturnType<typeof createBriefingService>
  recapService: ReturnType<typeof createRecapService>
  /** 스위퍼 전용 — 라우트는 이 두 개를 직접 쓰지 않는다 */
  sessions: ReadingSessionRepository
  conversationHistory: ConversationHistoryRepository
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) }
}

export function createReadingStateServices(pool: Pool): ReadingStateServices {
  const db = toQueryClient(pool)

  const positions = createPgReadingPositionRepository(db)
  const books = createPgBookContentReader(db)
  const sessions = createPgReadingSessionRepository(db)
  const savedRecap = createPgSavedRecapRepository(db)
  const sessionCache = createPgSessionRecapCacheRepository(db)
  const recapLog = createPgRecapCallLogger(db)
  const conversationHistory = createPgConversationHistoryRepository(db)

  const cutoffService = createCutoffService({ positions, books })
  const progressService = createProgressService({ positions })
  const sessionService = createSessionService({ positions, books, sessions, clock: systemClock })
  const briefingService = createBriefingService({ cutoffService, books, savedRecap })
  const recapService = createRecapService({
    content: books,
    books,
    savedRecap,
    sessionCache,
    recapLog,
    llmStream,
  })

  return {
    cutoffService,
    progressService,
    sessionService,
    briefingService,
    recapService,
    sessions,
    conversationHistory,
  }
}
