/**
 * Postgres 어댑터 — R2 리포지토리 계약의 실제 구현 (S3~S6 실데이터 전환)
 *
 * @see repository.ts — 이 파일이 구현하는 계약과 cutoff 인자 유무의 근거 전체
 * @see migrations/002_reading_state.sql — R2 소유 테이블(진도·세션·저장 리캡·세션 캐시·대화 이력)
 * @see migrations/003_recap_call_log.sql — 리캡 호출 로그
 * @see (R1 소유, 읽기 전용) migrations/001_content_store.sql — books·chapters·chapter_summaries·pages
 *
 * R1의 register.ts와 같은 패턴을 따른다 — 실제 `pg.Pool`을 직접 import하지 않고 최소
 * `QueryClient` 인터페이스를 받는다. 실 배선(pool 주입)은 CP3 라우트 연결 지점의 몫이고,
 * 이 파일의 SQL 자체는 목(mock) QueryClient로 단위 테스트한다(register.test.ts와 동일 스타일).
 *
 * ⚠️ books·chapters·chapter_summaries·pages는 R1 소유 테이블이다. 이 파일은 R1이 커밋한
 *    001_content_store.sql의 컬럼명을 그대로 읽기만 한다(쓰기 없음, 4.3절 "읽기 전용").
 */

import type {
  BookMetaReader,
  ChapterBoundary,
  ChapterSummaryRecord,
  ConversationHistoryRepository,
  ReadingPositionRepository,
  ReadingSessionRepository,
  RecapCallLogger,
  RecapContentReader,
  RecapState,
  SavedRecapRepository,
  SessionRecapCacheRepository,
  StoredPosition,
  StoredSavedRecap,
  StoredSession,
  SweepTarget,
} from './repository'
import type { RecapCallLog } from '../../shared/types'

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

// ============================================================================
// 진도 — reading_position (002)
// ============================================================================

export function createPgReadingPositionRepository(db: QueryClient): ReadingPositionRepository {
  return {
    async findPosition(deviceId: string, bookId: string): Promise<StoredPosition | null> {
      const { rows } = await db.query(
        `SELECT current_page, event_seq FROM reading_position WHERE device_id = $1 AND book_id = $2`,
        [deviceId, bookId]
      )
      if (rows.length === 0) return null
      return { current_page: rows[0].current_page, event_seq: Number(rows[0].event_seq) }
    },

    async savePosition(deviceId: string, bookId: string, position: StoredPosition): Promise<void> {
      await db.query(
        `INSERT INTO reading_position (device_id, book_id, current_page, event_seq, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (device_id, book_id) DO UPDATE SET
           current_page = $3, event_seq = $4, updated_at = now()`,
        [deviceId, bookId, position.current_page, position.event_seq]
      )
    },

    async resetEventSeq(deviceId: string, bookId: string): Promise<void> {
      // 저장 위치가 없으면 UPDATE가 0행에 적용된다 — 계약대로 아무 것도 하지 않는다
      await db.query(
        `UPDATE reading_position SET event_seq = 0 WHERE device_id = $1 AND book_id = $2`,
        [deviceId, bookId]
      )
    },
  }
}

// ============================================================================
// 공개 콘텐츠 스토어 읽기 — books · chapters · chapter_summaries · pages (R1 소유, 001)
// ============================================================================

export function createPgBookContentReader(db: QueryClient): BookMetaReader & RecapContentReader {
  return {
    async findTotalPages(bookId: string): Promise<number | null> {
      const { rows } = await db.query(`SELECT total_pages FROM books WHERE book_id = $1`, [bookId])
      return rows.length === 0 ? null : rows[0].total_pages
    },

    async findReadiness(bookId: string): Promise<boolean | null> {
      const { rows } = await db.query(`SELECT ssabi_ready FROM books WHERE book_id = $1`, [bookId])
      return rows.length === 0 ? null : Boolean(rows[0].ssabi_ready)
    },

    async findChapterContaining(bookId: string, pageNo: number): Promise<ChapterBoundary | null> {
      const { rows } = await db.query(
        `SELECT chapter_no, title, start_page, end_page FROM chapters
         WHERE book_id = $1 AND start_page <= $2 AND $2 <= end_page`,
        [bookId, pageNo]
      )
      if (rows.length === 0) return null
      const row = rows[0]
      return {
        chapter_no: row.chapter_no,
        title: row.title,
        start_page: row.start_page,
        end_page: row.end_page,
      }
    },

    async findCompletedChapterSummaries(
      bookId: string,
      cutoff: number
    ): Promise<ChapterSummaryRecord[]> {
      // FR-SPL-003 🚦 — 상한은 이 WHERE 조건 하나로 강제된다. cutoff 미적용 원시 쿼리를
      // 도메인 코드에 노출하지 않는다(4.3절) — 이 함수가 그 유일한 통로다.
      const { rows } = await db.query(
        `SELECT cs.chapter_no, c.title, cs.summary, c.end_page
         FROM chapter_summaries cs
         JOIN chapters c ON c.book_id = cs.book_id AND c.chapter_no = cs.chapter_no
         WHERE cs.book_id = $1 AND c.end_page <= $2
         ORDER BY cs.chapter_no ASC`,
        [bookId, cutoff]
      )
      return rows.map((row) => ({
        chapter_no: row.chapter_no,
        title: row.title,
        content: row.summary,
        end_page: row.end_page,
      }))
    },

    async findCurrentChapterPageTexts(
      bookId: string,
      cutoff: number,
      fromPage: number
    ): Promise<string[]> {
      // FR-SPL-003 🚦 — page_no <= cutoff. 조회형·검색과 동일한 필터식(5.3절 "필터 동일성")
      const { rows } = await db.query(
        `SELECT content FROM pages
         WHERE book_id = $1 AND page_no >= $2 AND page_no <= $3
         ORDER BY page_no ASC`,
        [bookId, fromPage, cutoff]
      )
      return rows.map((row) => row.content)
    },
  }
}

// ============================================================================
// 세션 — reading_session (002)
// ============================================================================

export function createPgReadingSessionRepository(db: QueryClient): ReadingSessionRepository {
  return {
    async findSession(deviceId: string, bookId: string): Promise<StoredSession | null> {
      const { rows } = await db.query(
        `SELECT last_activity_at, recap_state, session_epoch FROM reading_session
         WHERE device_id = $1 AND book_id = $2`,
        [deviceId, bookId]
      )
      if (rows.length === 0) return null
      return {
        last_activity_at: rows[0].last_activity_at,
        recap_state: rows[0].recap_state as RecapState,
        session_epoch: Number(rows[0].session_epoch),
      }
    },

    async recordActivity(deviceId: string, bookId: string): Promise<void> {
      await db.query(
        `INSERT INTO reading_session (device_id, book_id, last_activity_at, recap_state, session_epoch)
         VALUES ($1, $2, now(), 'none', 1)
         ON CONFLICT (device_id, book_id) DO UPDATE SET
           last_activity_at = now(), recap_state = 'none'`,
        [deviceId, bookId]
      )
    },

    async startNewSession(deviceId: string, bookId: string): Promise<{ session_epoch: number }> {
      const { rows } = await db.query(
        `INSERT INTO reading_session (device_id, book_id, last_activity_at, recap_state, session_epoch)
         VALUES ($1, $2, now(), 'none', 1)
         ON CONFLICT (device_id, book_id) DO UPDATE SET
           last_activity_at = now(), recap_state = 'none', session_epoch = reading_session.session_epoch + 1
         RETURNING session_epoch`,
        [deviceId, bookId]
      )
      return { session_epoch: Number(rows[0].session_epoch) }
    },

    async findSweepTargets(before: Date): Promise<SweepTarget[]> {
      // cutoff 인자 없음의 근거는 repository.ts에 있다 — 이 필터는 세션 비활성 시각이다
      const { rows } = await db.query(
        `SELECT device_id, book_id FROM reading_session
         WHERE recap_state = 'none' AND last_activity_at < $1`,
        [before]
      )
      return rows.map((row) => ({ device_id: row.device_id, book_id: row.book_id }))
    },

    async markPending(deviceId: string, bookId: string): Promise<void> {
      await setRecapState(db, deviceId, bookId, 'pending')
    },

    async markDone(deviceId: string, bookId: string): Promise<void> {
      await setRecapState(db, deviceId, bookId, 'done')
    },

    async markFailed(deviceId: string, bookId: string): Promise<void> {
      await setRecapState(db, deviceId, bookId, 'failed')
    },
  }
}

async function setRecapState(
  db: QueryClient,
  deviceId: string,
  bookId: string,
  state: RecapState
): Promise<void> {
  await db.query(
    `UPDATE reading_session SET recap_state = $3 WHERE device_id = $1 AND book_id = $2`,
    [deviceId, bookId, state]
  )
}

// ============================================================================
// 저장 리캡 · 세션 리캡 캐시 — saved_recap · session_recap_cache (002)
// ============================================================================

export function createPgSavedRecapRepository(db: QueryClient): SavedRecapRepository {
  return {
    async findSavedRecap(deviceId: string, bookId: string): Promise<StoredSavedRecap | null> {
      const { rows } = await db.query(
        `SELECT cutoff_page, recap_text FROM saved_recap WHERE device_id = $1 AND book_id = $2`,
        [deviceId, bookId]
      )
      if (rows.length === 0) return null
      return { cutoff_page: rows[0].cutoff_page, recap_text: rows[0].recap_text }
    },

    async upsertSavedRecap(
      deviceId: string,
      bookId: string,
      cutoffPage: number,
      recapText: string
    ): Promise<void> {
      // FR-DAT-009 — 사용자·도서당 1건. PK(device_id, book_id)가 그 보증을 스키마 층에서 건다
      await db.query(
        `INSERT INTO saved_recap (device_id, book_id, cutoff_page, recap_text, created_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (device_id, book_id) DO UPDATE SET
           cutoff_page = $3, recap_text = $4, created_at = now()`,
        [deviceId, bookId, cutoffPage, recapText]
      )
    },
  }
}

export function createPgSessionRecapCacheRepository(db: QueryClient): SessionRecapCacheRepository {
  return {
    async findCached(deviceId: string, bookId: string, cutoff: number): Promise<string | null> {
      const { rows } = await db.query(
        `SELECT recap_text FROM session_recap_cache
         WHERE device_id = $1 AND book_id = $2 AND cutoff_page = $3 AND expires_at > now()`,
        [deviceId, bookId, cutoff]
      )
      return rows.length === 0 ? null : rows[0].recap_text
    },

    async saveCached(
      deviceId: string,
      bookId: string,
      cutoff: number,
      recapText: string,
      expiresAt: Date
    ): Promise<void> {
      // FR-DAT-010 — 영구 저장이 아니다. saved_recap과 테이블이 분리되어 있어 이 upsert가
      // 저장 리캡에 영향을 주지 않는다.
      await db.query(
        `INSERT INTO session_recap_cache (device_id, book_id, cutoff_page, recap_text, created_at, expires_at)
         VALUES ($1, $2, $3, $4, now(), $5)
         ON CONFLICT (device_id, book_id, cutoff_page) DO UPDATE SET
           recap_text = $4, created_at = now(), expires_at = $5`,
        [deviceId, bookId, cutoff, recapText, expiresAt]
      )
    },
  }
}

// ============================================================================
// 대화 이력 — conversation_history (002, A7 파기 대상)
// ============================================================================

export function createPgConversationHistoryRepository(db: QueryClient): ConversationHistoryRepository {
  return {
    async purge(deviceId: string, bookId: string): Promise<void> {
      await db.query(`DELETE FROM conversation_history WHERE device_id = $1 AND book_id = $2`, [
        deviceId,
        bookId,
      ])
    },
  }
}

// ============================================================================
// 리캡 호출 로그 — recap_call_log (003, NFR-OBS-002 🚦)
// ============================================================================

export function createPgRecapCallLogger(db: QueryClient): RecapCallLogger {
  return {
    async record(entry: RecapCallLog): Promise<void> {
      await db.query(
        `INSERT INTO recap_call_log
           (created_at, device_id, book_id, cutoff_page, input_chapter_summary_ids,
            current_chapter_cutoff, output_ref, model, input_tokens, output_tokens, trigger)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.timestamp,
          entry.device_id,
          entry.book_id,
          entry.cutoff_page,
          entry.input_chapter_summary_ids,
          entry.current_chapter_cutoff,
          entry.output_ref,
          entry.model,
          entry.tokens.input,
          entry.tokens.output,
          entry.trigger,
        ]
      )
    },
  }
}
