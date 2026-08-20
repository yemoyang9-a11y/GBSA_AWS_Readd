/**
 * S3~S6 Postgres 어댑터 테스트 — mock QueryClient (R1 register.test.ts와 같은 스타일)
 *
 * 실제 DB 없이 SQL·파라미터 형태를 검증한다. FR-SPL-002·003 🚦이 걸리는 조회는
 * WHERE 절에 cutoff 필터가 실제로 들어가는지를 파라미터 순서까지 확인한다 —
 * 리포지토리 계층의 코드 수준 강제(00-shared 2.2절)가 이 테스트의 대상이다.
 */

import {
  createPgBookContentReader,
  createPgConversationHistoryRepository,
  createPgReadingPositionRepository,
  createPgReadingSessionRepository,
  createPgRecapCallLogger,
  createPgSavedRecapRepository,
  createPgSessionRecapCacheRepository,
  QueryClient,
} from '../../../src/modules/reading-state/pg-repository'
import type { RecapCallLog } from '../../../src/shared/types'

function mockClient(rows: any[] = []): { client: QueryClient; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = []
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return { rows }
      },
    },
    calls,
  }
}

describe('진도 — createPgReadingPositionRepository', () => {
  test('findPosition은 device_id·book_id로 조회하고 event_seq(bigint)를 number로 변환한다', async () => {
    const { client, calls } = mockClient([{ current_page: 15, event_seq: '99' }]) // pg bigint → string
    const repo = createPgReadingPositionRepository(client)

    const result = await repo.findPosition('dev-1', 'book-1')

    expect(result).toEqual({ current_page: 15, event_seq: 99 })
    expect(calls[0].params).toEqual(['dev-1', 'book-1'])
  })

  test('findPosition — 레코드 없으면 null', async () => {
    const { client } = mockClient([])
    const repo = createPgReadingPositionRepository(client)

    expect(await repo.findPosition('dev-1', 'book-1')).toBeNull()
  })

  test('savePosition은 (device_id, book_id) upsert로 current_page·event_seq를 쓴다', async () => {
    const { client, calls } = mockClient()
    const repo = createPgReadingPositionRepository(client)

    await repo.savePosition('dev-1', 'book-1', { current_page: 20, event_seq: 7 })

    expect(calls[0].sql).toMatch(/INSERT INTO reading_position/)
    expect(calls[0].sql).toMatch(/ON CONFLICT \(device_id, book_id\)/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1', 20, 7])
  })

  test('resetEventSeq는 event_seq만 0으로 되돌린다 (current_page 미변경)', async () => {
    const { client, calls } = mockClient()
    const repo = createPgReadingPositionRepository(client)

    await repo.resetEventSeq('dev-1', 'book-1')

    expect(calls[0].sql).toMatch(/UPDATE reading_position SET event_seq = 0/)
    expect(calls[0].sql).not.toMatch(/current_page/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1'])
  })
})

describe('공개 콘텐츠 스토어 읽기 — createPgBookContentReader', () => {
  test('findTotalPages', async () => {
    const { client } = mockClient([{ total_pages: 411 }])
    const reader = createPgBookContentReader(client)

    expect(await reader.findTotalPages('takryu')).toBe(411)
  })

  test('findReadiness — ssabi_ready를 boolean으로 반환', async () => {
    const { client } = mockClient([{ ssabi_ready: true }])
    const reader = createPgBookContentReader(client)

    expect(await reader.findReadiness('takryu')).toBe(true)
  })

  test('findReadiness — 도서 없으면 null', async () => {
    const { client } = mockClient([])
    const reader = createPgBookContentReader(client)

    expect(await reader.findReadiness('unknown')).toBeNull()
  })

  test('findChapterContaining은 start_page<=pageNo<=end_page 범위 조건을 쓴다', async () => {
    const { client, calls } = mockClient([
      { chapter_no: 2, title: '2장', start_page: 11, end_page: 20 },
    ])
    const reader = createPgBookContentReader(client)

    const chapter = await reader.findChapterContaining('takryu', 15)

    expect(chapter).toEqual({ chapter_no: 2, title: '2장', start_page: 11, end_page: 20 })
    expect(calls[0].sql).toMatch(/start_page <= \$2 AND \$2 <= end_page/)
    expect(calls[0].params).toEqual(['takryu', 15])
  })

  test('FR-SPL-003 🚦: findCompletedChapterSummaries는 end_page <= cutoff를 WHERE에 걸고 cutoff를 파라미터로 받는다', async () => {
    const { client, calls } = mockClient([
      { chapter_no: 1, title: '1장', summary: '요약', end_page: 10 },
    ])
    const reader = createPgBookContentReader(client)

    const summaries = await reader.findCompletedChapterSummaries('takryu', 40)

    expect(summaries).toEqual([{ chapter_no: 1, title: '1장', content: '요약', end_page: 10 }])
    expect(calls[0].sql).toMatch(/end_page <= \$2/)
    expect(calls[0].params).toEqual(['takryu', 40])
  })

  test('FR-SPL-003 🚦: findCurrentChapterPageTexts는 page_no <= cutoff(파라미터)로 상한을 건다', async () => {
    const { client, calls } = mockClient([{ content: 'p.11' }, { content: 'p.12' }])
    const reader = createPgBookContentReader(client)

    const texts = await reader.findCurrentChapterPageTexts('takryu', 12, 11)

    expect(texts).toEqual(['p.11', 'p.12'])
    expect(calls[0].sql).toMatch(/page_no >= \$2 AND page_no <= \$3/)
    expect(calls[0].params).toEqual(['takryu', 11, 12]) // [bookId, fromPage, cutoff] — cutoff가 상한 파라미터
  })
})

describe('세션 — createPgReadingSessionRepository', () => {
  test('findSession은 session_epoch(bigint)를 number로 변환한다', async () => {
    const lastActivity = new Date('2026-08-20T00:00:00Z')
    const { client } = mockClient([
      { last_activity_at: lastActivity, recap_state: 'none', session_epoch: '3' },
    ])
    const repo = createPgReadingSessionRepository(client)

    const session = await repo.findSession('dev-1', 'book-1')

    expect(session).toEqual({ last_activity_at: lastActivity, recap_state: 'none', session_epoch: 3 })
  })

  test('recordActivity는 last_activity_at=now·recap_state=none으로 upsert한다 (epoch 미변경)', async () => {
    const { client, calls } = mockClient()
    const repo = createPgReadingSessionRepository(client)

    await repo.recordActivity('dev-1', 'book-1')

    expect(calls[0].sql).toMatch(/recap_state = 'none'/)
    expect(calls[0].sql).not.toMatch(/session_epoch = reading_session\.session_epoch \+ 1/)
  })

  test('startNewSession은 session_epoch를 1 증가시키고 RETURNING으로 새 값을 읽는다', async () => {
    const { client, calls } = mockClient([{ session_epoch: '4' }])
    const repo = createPgReadingSessionRepository(client)

    const result = await repo.startNewSession('dev-1', 'book-1')

    expect(result).toEqual({ session_epoch: 4 })
    expect(calls[0].sql).toMatch(/session_epoch = reading_session\.session_epoch \+ 1/)
    expect(calls[0].sql).toMatch(/RETURNING session_epoch/)
  })

  test('findSweepTargets는 recap_state=none AND last_activity_at < before로 스캔한다', async () => {
    const before = new Date('2026-08-20T00:00:00Z')
    const { client, calls } = mockClient([{ device_id: 'dev-1', book_id: 'book-1' }])
    const repo = createPgReadingSessionRepository(client)

    const targets = await repo.findSweepTargets(before)

    expect(targets).toEqual([{ device_id: 'dev-1', book_id: 'book-1' }])
    expect(calls[0].sql).toMatch(/recap_state = 'none' AND last_activity_at < \$1/)
    expect(calls[0].params).toEqual([before])
  })

  test.each(['markPending', 'markDone', 'markFailed'] as const)(
    '%s는 recap_state만 갱신한다',
    async (method) => {
      const { client, calls } = mockClient()
      const repo = createPgReadingSessionRepository(client)

      await repo[method]('dev-1', 'book-1')

      expect(calls[0].sql).toMatch(/UPDATE reading_session SET recap_state = \$3/)
      expect(calls[0].params).toEqual([
        'dev-1',
        'book-1',
        { markPending: 'pending', markDone: 'done', markFailed: 'failed' }[method],
      ])
    }
  )
})

describe('저장 리캡 · 세션 캐시', () => {
  test('findSavedRecap', async () => {
    const { client } = mockClient([{ cutoff_page: 15, recap_text: '리캡' }])
    const repo = createPgSavedRecapRepository(client)

    expect(await repo.findSavedRecap('dev-1', 'book-1')).toEqual({
      cutoff_page: 15,
      recap_text: '리캡',
    })
  })

  test('upsertSavedRecap — (device_id, book_id) 1건 upsert (FR-DAT-009)', async () => {
    const { client, calls } = mockClient()
    const repo = createPgSavedRecapRepository(client)

    await repo.upsertSavedRecap('dev-1', 'book-1', 15, '리캡')

    expect(calls[0].sql).toMatch(/ON CONFLICT \(device_id, book_id\)/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1', 15, '리캡'])
  })

  test('R8: findCached는 cutoff_page 일치 + expires_at > now() 조건을 쓴다', async () => {
    const { client, calls } = mockClient([{ recap_text: '캐시' }])
    const repo = createPgSessionRecapCacheRepository(client)

    expect(await repo.findCached('dev-1', 'book-1', 15)).toBe('캐시')
    expect(calls[0].sql).toMatch(/cutoff_page = \$3 AND expires_at > now\(\)/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1', 15])
  })

  test('saveCached — (device_id, book_id, cutoff_page) 키로 upsert', async () => {
    const { client, calls } = mockClient()
    const repo = createPgSessionRecapCacheRepository(client)
    const expiresAt = new Date('2026-08-21T00:00:00Z')

    await repo.saveCached('dev-1', 'book-1', 15, '캐시', expiresAt)

    expect(calls[0].sql).toMatch(/ON CONFLICT \(device_id, book_id, cutoff_page\)/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1', 15, '캐시', expiresAt])
  })
})

describe('대화 이력 파기 — A7', () => {
  test('purge는 (device_id, book_id) 전체 이력을 삭제한다', async () => {
    const { client, calls } = mockClient()
    const repo = createPgConversationHistoryRepository(client)

    await repo.purge('dev-1', 'book-1')

    expect(calls[0].sql).toMatch(/DELETE FROM conversation_history/)
    expect(calls[0].params).toEqual(['dev-1', 'book-1'])
  })
})

describe('리캡 호출 로그 — NFR-OBS-002 🚦', () => {
  test('record는 로그 계약 필드를 전부 파라미터로 싣는다', async () => {
    const { client, calls } = mockClient()
    const logger = createPgRecapCallLogger(client)
    const entry: RecapCallLog = {
      timestamp: new Date('2026-08-20T00:00:00Z'),
      device_id: 'dev-1',
      book_id: 'book-1',
      cutoff_page: 15,
      input_chapter_summary_ids: ['1'],
      current_chapter_cutoff: 15,
      output_ref: '생성된 리캡',
      model: 'recap',
      tokens: { input: 100, output: 20 },
      trigger: 'realtime',
    }

    await logger.record(entry)

    expect(calls[0].sql).toMatch(/INSERT INTO recap_call_log/)
    expect(calls[0].params).toEqual([
      entry.timestamp,
      'dev-1',
      'book-1',
      15,
      ['1'],
      15,
      '생성된 리캡',
      'recap',
      100,
      20,
      'realtime',
    ])
  })
})
